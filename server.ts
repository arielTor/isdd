import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fs from "fs";
import mysql from "mysql2/promise";
import session from "express-session";
import bcrypt from "bcryptjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── TypeScript: augment session to hold user ──────────────────────────────
declare module "express-session" {
  interface SessionData {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
      permissions: { company_id: string; bank_id: string | null }[];
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ── CORS — applied only to /api/* routes ─────────────────────────────────
  // Static files and the SPA shell are served same-origin and don't need CORS.
  // Cloudflare adds Origin to every proxied request, so we keep CORS off the
  // static file routes to avoid blocking page loads when APP_URL is unset.
  const allowedOrigins = [
    process.env.APP_URL,
    "https://finboard.corp-domain.com",
    "https://stage-finboard.corp-domain.com",
    "http://localhost:3000",
    "http://localhost:5173",
  ].filter(Boolean) as string[];

  const corsMiddleware = cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) callback(null, true);
      else callback(new Error(`CORS: origin ${origin} not allowed`));
    },
    credentials: true,
  });

  // Trust the first proxy (Cloudflare → Azure App Service).
  // Without this, Express sees req.secure=false (HTTP between CF and Azure),
  // so express-session refuses to set the Secure cookie → every post-login
  // request gets a new empty session → 401 "Not authenticated".
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ── Custom MySQL session store (pure mysql2 — ESM compatible) ─────────────
  // Stores sessions in the `sessions` DB table so they survive restarts.
  // SAML-ready: only the login mechanism changes when switching to SAML;
  // session.user shape and all downstream middleware stay identical.
  class MySQLSessionStore extends session.Store {
    async _getConn() { return mysql.createConnection(dbConfig()); }

    async _ensureTable() {
      const conn = await this._getConn();
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS sessions (
            session_id VARCHAR(128) NOT NULL PRIMARY KEY,
            expires     BIGINT      NOT NULL,
            data        MEDIUMTEXT,
            INDEX idx_expires (expires)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
      } finally { conn.end(); }
    }

    get(sid: string, cb: (err: any, session?: any) => void) {
      this._getConn().then(async conn => {
        try {
          const [rows] = await conn.execute(
            "SELECT data, expires FROM sessions WHERE session_id = ?", [sid]
          ) as [any[], any];
          if (!rows.length || Date.now() > rows[0].expires) return cb(null, null);
          cb(null, JSON.parse(rows[0].data));
        } catch (e) { cb(e); } finally { conn.end(); }
      }).catch(cb);
    }

    set(sid: string, sessionData: any, cb: (err?: any) => void) {
      const expires = Date.now() + (8 * 60 * 60 * 1000);
      const data = JSON.stringify(sessionData);
      this._getConn().then(async conn => {
        try {
          await conn.execute(
            `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
            [sid, expires, data]
          );
          cb();
        } catch (e) { cb(e); } finally { conn.end(); }
      }).catch(cb);
    }

    destroy(sid: string, cb: (err?: any) => void) {
      this._getConn().then(async conn => {
        try {
          await conn.execute("DELETE FROM sessions WHERE session_id = ?", [sid]);
          cb();
        } catch (e) { cb(e); } finally { conn.end(); }
      }).catch(cb);
    }

    touch(sid: string, sessionData: any, cb: (err?: any) => void) {
      const expires = Date.now() + (8 * 60 * 60 * 1000);
      this._getConn().then(async conn => {
        try {
          await conn.execute(
            "UPDATE sessions SET expires = ? WHERE session_id = ?", [expires, sid]
          );
          cb();
        } catch (e) { cb(e); } finally { conn.end(); }
      }).catch(cb);
    }
  }

  const sessionStore = new MySQLSessionStore();

  app.use(
    session({
      secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
      store: sessionStore,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000, // 8 hours
      },
    })
  );

  // Request logger
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // ── Auth middleware ───────────────────────────────────────────────────────
  function requireAuth(req: any, res: any, next: any) {
    if (req.session?.user) return next();
    res.status(401).json({ error: "Not authenticated" });
  }

  function requireAdmin(req: any, res: any, next: any) {
    if (req.session?.user?.role === "Admin") return next();
    res.status(403).json({ error: "Admin access required" });
  }

  // ── In-memory data store ──────────────────────────────────────────────────
  const DATA_FILE = path.join(process.cwd(), "latest_liquidity_data.json");
  let latestData: any[] = [];
  let lastUpdateTime = Date.now();

  // Delete stale JSON cache on startup — always fetch fresh from DB so
  // last_modified_date and balances are never served from a stale file.
  if (fs.existsSync(DATA_FILE)) {
    try { fs.unlinkSync(DATA_FILE); } catch (_) {}
    console.log("Cleared stale data cache — will fetch fresh from DB.");
  }

  // ── Live exchange-rate engine ─────────────────────────────────────────────
  // Rates are fetched at most once every 5 minutes and cached in memory.
  // value_usd from integrations is always authoritative — rates only fill in
  // wallets where value_usd is NULL / 0 in the database.

  // Stablecoins we treat as exactly 1 USD (no API call needed)
  const STABLECOINS = new Set(["USDT", "USDtb", "USDC", "TUSD", "BUSD", "DAI", "USD"]);

  // Map from our currency ticker → CoinGecko coin id
  const COINGECKO_IDS: Record<string, string> = {
    BTC:  "bitcoin",
    ETH:  "ethereum",
    PEPE: "pepe",
    HEX:  "hex",
    SOL:  "solana",
    BNB:  "binancecoin",
    XRP:  "ripple",
    LTC:  "litecoin",
  };

  // usdRates[ticker] = how many USD 1 unit of ticker is worth
  const rateCache: { usdRates: Record<string, number>; fetchedAt: number } = {
    usdRates: {},
    fetchedAt: 0,
  };
  const RATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  async function refreshRates(): Promise<Record<string, number>> {
    const rates: Record<string, number> = { USD: 1 };

    // All stablecoins = 1 USD
    for (const sc of STABLECOINS) rates[sc] = 1;

    // ── Fiat rates via open.er-api.com (free, no API key) ──────────────────
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data: any = await res.json();
        // data.rates[X] = how many X per 1 USD → invert → USD per X
        if (data?.rates) {
          for (const [cur, perUsd] of Object.entries(data.rates as Record<string, number>)) {
            rates[cur] = 1 / perUsd;
          }
        }
        console.log("[Rates] Fiat rates updated");
      }
    } catch (e: any) {
      console.warn("[Rates] Fiat fetch failed:", e.message);
    }

    // ── Crypto rates via CoinGecko free API ───────────────────────────────
    try {
      const ids = Object.values(COINGECKO_IDS).join(",");
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (res.ok) {
        const data: any = await res.json();
        for (const [ticker, cgId] of Object.entries(COINGECKO_IDS)) {
          if (data[cgId]?.usd) rates[ticker] = data[cgId].usd;
        }
        console.log("[Rates] Crypto rates updated");
      }
    } catch (e: any) {
      console.warn("[Rates] Crypto fetch failed:", e.message);
    }

    rateCache.usdRates = rates;
    rateCache.fetchedAt = Date.now();
    return rates;
  }

  async function getUsdRates(): Promise<Record<string, number>> {
    if (
      Object.keys(rateCache.usdRates).length > 0 &&
      Date.now() - rateCache.fetchedAt < RATE_TTL_MS
    ) {
      return rateCache.usdRates;
    }
    return refreshRates();
  }

  // ── DB connection helper ──────────────────────────────────────────────────
  function dbConfig() {
    return {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      ssl: { rejectUnauthorized: process.env.DB_SSL_VERIFY !== "false" },
      connectTimeout: 10000,
    };
  }

  // ── Helper: filter liquidity data by user permissions ────────────────────
  function filterByPermissions(
    data: any[],
    permissions: { company_id: string; bank_id: string | null }[]
  ) {
    if (!permissions || permissions.length === 0) return data;
    return data
      .filter((company) =>
        permissions.some((p) => p.company_id === company.id)
      )
      .map((company) => {
        const perms = permissions.filter((p) => p.company_id === company.id);
        const seeAllBanks = perms.some((p) => !p.bank_id);
        return {
          ...company,
          banks: seeAllBanks
            ? company.banks
            : company.banks.filter((bank: any) =>
                perms.some((p) => p.bank_id === bank.id)
              ),
        };
      });
  }

  // ── SQL query ─────────────────────────────────────────────────────────────
  const SQL_QUERY = `
    SELECT
      c.id                 AS company_id,
      c.name               AS company_name,
      c.industry           AS company_industry,
      c.status             AS company_status,
      b.id                 AS bank_id,
      b.name               AS bank_name,
      b.country            AS bank_country,
      b.is_verified        AS bank_is_verified,
      DATE_FORMAT(b.last_modified_date, '%Y-%m-%d %H:%i') AS bank_last_modified,
      ba.id                AS bank_account_id,
      ba.account_number    AS bank_account_number,
      ba.label             AS bank_account_label,
      w.id                 AS wallet_id,
      w.currency           AS wallet_currency,
      w.balance            AS wallet_balance,
      w.value_usd          AS wallet_value_usd,
      w.updated_at         AS wallet_updated_at
    FROM companies c
    INNER JOIN banks b          ON b.company_id = c.id AND b.is_verified = 1
    INNER JOIN bank_accounts ba ON ba.bank_id = b.id
    INNER JOIN wallets w        ON w.account_id = ba.id
    ORDER BY c.id, b.id, ba.id, w.id
  `;

  // ── PSP query — providers / eWallets / live wallet accounts ───────────────
  const PSP_SQL_QUERY = `
    SELECT
      pe.company_id            AS company_id,
      pp.id                    AS psp_provider_id,
      pp.name                  AS psp_provider_name,
      pp.slug                  AS psp_provider_slug,
      pp.is_active             AS psp_provider_is_active,
      pe.ewallet_id            AS ewallet_id,
      pe.ewallet_reference_id  AS ewallet_reference_id,
      pe.type                  AS ewallet_type,
      pe.category              AS ewallet_category,
      pe.status                AS ewallet_status,
      pwa.id                   AS wallet_account_id,
      pwa.currency             AS wallet_currency,
      pwa.balance              AS wallet_balance,
      pwa.received_balance     AS wallet_received_balance,
      pwa.on_hold_balance      AS wallet_on_hold_balance,
      pwa.reserve_balance      AS wallet_reserve_balance,
      DATE_FORMAT(pwa.updated_at, '%Y-%m-%d %H:%i:%s') AS wallet_updated_at
    FROM psp_ewallets pe
    INNER JOIN psp_providers pp       ON pp.id = pe.psp_provider_id
    LEFT JOIN psp_wallet_accounts pwa ON pwa.ewallet_id = pe.ewallet_id
    ORDER BY pe.company_id, pp.id, pe.id, pwa.id
  `;

  // ── PSP query — settlements (next payments + history) ─────────────────────
  const PSP_SETTLEMENTS_SQL_QUERY = `
    SELECT
      pe.company_id        AS company_id,
      ps.id                 AS settlement_id,
      ps.ewallet_id         AS ewallet_id,
      pp.name               AS psp_provider_name,
      ps.psp_reference_id   AS psp_reference_id,
      ps.currency           AS currency,
      ps.amount             AS amount,
      ps.status             AS status,
      DATE_FORMAT(ps.payment_date, '%Y-%m-%d') AS payment_date,
      DATE_FORMAT(ps.paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at,
      ps.bank_account_name  AS bank_account_name,
      ps.bank_account_ref   AS bank_account_ref,
      ps.notes              AS notes
    FROM psp_settlements ps
    INNER JOIN psp_ewallets pe  ON pe.ewallet_id = ps.ewallet_id
    INNER JOIN psp_providers pp ON pp.id = pe.psp_provider_id
    ORDER BY pe.company_id, ps.payment_date, ps.id
  `;

  async function queryDatabase(): Promise<void> {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
    } catch (err: any) {
      throw new Error(`DB connection failed: ${err.message}`);
    }
    try {
      // Fetch live rates before building the dataset — wallets without a
      // DB-supplied value_usd will get an estimated value from these rates.
      const rates = await getUsdRates();

      // Seed every company first so ones with PSP-only data (no verified
      // banks yet) still show up, not just companies that appear in SQL_QUERY.
      const [companyRows] = (await conn.execute(
        "SELECT id, name, industry, status FROM companies"
      )) as [any[], any];
      const companiesMap = new Map<string, any>();
      for (const c of companyRows) {
        companiesMap.set(c.id, {
          id: c.id,
          name: c.name,
          industry: c.industry,
          status: c.status,
          banks: new Map(),
          psp_providers: new Map(),
          psp_settlements: [],
        });
      }

      const [rows] = (await conn.execute(SQL_QUERY)) as [any[], any];
      for (const row of rows) {
        const company = companiesMap.get(row.company_id);
        if (!company) continue;
        if (!company.banks.has(row.bank_id)) {
          company.banks.set(row.bank_id, {
            id: row.bank_id,
            name: row.bank_name,
            country: row.bank_country,
            is_verified: row.bank_is_verified,
            last_modified_date: row.bank_last_modified,
            bank_accounts: new Map(),
          });
        }
        const bank = company.banks.get(row.bank_id);
        if (!bank.bank_accounts.has(row.bank_account_id)) {
          bank.bank_accounts.set(row.bank_account_id, {
            id: row.bank_account_id,
            account_number: row.bank_account_number,
            label: row.bank_account_label,
            wallets: [],
          });
        }

        const dbValueUsd = row.wallet_value_usd !== null && row.wallet_value_usd !== undefined
          ? Number(row.wallet_value_usd)
          : null;
        const balance    = Number(row.wallet_balance ?? 0);
        const currency   = row.wallet_currency as string;
        const rate       = rates[currency];

        // Use DB value when present (non-null); otherwise estimate from live rate.
        // Negative balances are valid (overdrafts) and must not be discarded.
        const hasDbValue      = dbValueUsd !== null;
        const valueUsd        = hasDbValue ? dbValueUsd! : (rate !== undefined ? balance * rate : null);
        const valueUsdEstimated = !hasDbValue && rate !== undefined && valueUsd !== null;

        bank.bank_accounts.get(row.bank_account_id).wallets.push({
          id: row.wallet_id,
          currency,
          balance,
          value_usd:           valueUsd ?? 0,
          value_usd_estimated: valueUsdEstimated,
          updated_at: row.wallet_updated_at,
        });
      }

      // ── PSP providers / eWallets / wallet accounts ──────────────────────
      // psp_wallet_accounts has no value_usd column (unlike bank wallets), so
      // PSP balances are always converted from the same live rates used above.
      const [pspRows] = (await conn.execute(PSP_SQL_QUERY)) as [any[], any];
      for (const row of pspRows) {
        const company = companiesMap.get(row.company_id);
        if (!company) continue;

        if (!company.psp_providers.has(row.psp_provider_id)) {
          company.psp_providers.set(row.psp_provider_id, {
            id: String(row.psp_provider_id),
            name: row.psp_provider_name,
            slug: row.psp_provider_slug,
            isActive: row.psp_provider_is_active === 1 || row.psp_provider_is_active === true,
            ewallets: new Map(),
          });
        }
        const provider = company.psp_providers.get(row.psp_provider_id);

        if (row.ewallet_id && !provider.ewallets.has(row.ewallet_id)) {
          provider.ewallets.set(row.ewallet_id, {
            id: row.ewallet_id,
            reference_id: row.ewallet_reference_id,
            type: row.ewallet_type,
            category: row.ewallet_category,
            status: row.ewallet_status,
            wallets: [],
          });
        }

        if (row.ewallet_id && row.wallet_account_id != null) {
          const balance  = Number(row.wallet_balance ?? 0);
          const currency = row.wallet_currency as string;
          const rate     = rates[currency];
          const valueUsd = rate !== undefined ? balance * rate : 0;

          provider.ewallets.get(row.ewallet_id).wallets.push({
            id: String(row.wallet_account_id),
            currency,
            balance,
            received_balance: Number(row.wallet_received_balance ?? 0),
            on_hold_balance:  Number(row.wallet_on_hold_balance ?? 0),
            reserve_balance:  Number(row.wallet_reserve_balance ?? 0),
            value_usd: valueUsd,
            value_usd_estimated: rate !== undefined,
            updated_at: row.wallet_updated_at,
          });
        }
      }

      // ── PSP settlements (future + history) ──────────────────────────────
      const [settlementRows] = (await conn.execute(PSP_SETTLEMENTS_SQL_QUERY)) as [any[], any];
      for (const row of settlementRows) {
        const company = companiesMap.get(row.company_id);
        if (!company) continue;
        company.psp_settlements.push({
          id: String(row.settlement_id),
          ewalletId: row.ewallet_id,
          pspProviderName: row.psp_provider_name,
          currency: row.currency,
          amount: Number(row.amount ?? 0),
          status: row.status,
          paymentDate: row.payment_date ?? null,
          paidAt: row.paid_at ?? null,
          bankAccountName: row.bank_account_name,
          bankAccountRef: row.bank_account_ref,
          notes: row.notes,
        });
      }

      const data = Array.from(companiesMap.values()).map((c: any) => ({
        ...c,
        banks: Array.from(c.banks.values()).map((b: any) => ({
          ...b,
          bank_accounts: Array.from(b.bank_accounts.values()),
        })),
        psp_providers: Array.from(c.psp_providers.values()).map((p: any) => ({
          ...p,
          ewallets: Array.from(p.ewallets.values()),
        })),
      }));
      latestData = data;
      lastUpdateTime = Date.now();
      fs.writeFileSync(DATA_FILE, JSON.stringify(latestData, null, 2));
      console.log(`✅ DB sync: ${rows.length} rows → ${data.length} companies`);
    } finally {
      await conn.end();
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // AUTH ROUTES  (no requireAuth — these are the login endpoints)
  // ════════════════════════════════════════════════════════════════════════

  // Check whether any user has a password set yet (first-time setup)
  app.get("/api/auth/setup-status", corsMiddleware, async (_req, res) => {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [rows] = (await conn.execute(
        "SELECT COUNT(*) AS cnt FROM users WHERE password_hash IS NOT NULL"
      )) as [any[], any];
      res.json({ needsSetup: rows[0].cnt === 0 });
    } catch {
      // DB unreachable — surface setup page so admin can diagnose
      res.json({ needsSetup: true });
    } finally {
      conn?.end();
    }
  });

  // One-time initial setup: set first admin password
  // Blocked as soon as ANY user has a password
  app.post("/api/auth/setup-initial", corsMiddleware, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [check] = (await conn.execute(
        "SELECT COUNT(*) AS cnt FROM users WHERE password_hash IS NOT NULL"
      )) as [any[], any];
      if (check[0].cnt > 0)
        return res.status(403).json({ error: "Setup already completed. Use the login screen." });

      const [users] = (await conn.execute(
        "SELECT id, name, role FROM users WHERE email = ?",
        [email]
      )) as [any[], any];
      if (users.length === 0)
        return res.status(404).json({ error: "No user found with that email" });

      const hash = await bcrypt.hash(password, 10);
      await conn.execute(
        "UPDATE users SET password_hash = ? WHERE email = ?",
        [hash, email]
      );
      console.log(`✅ Initial password set for ${email}`);
      res.json({ ok: true, name: users[0].name });
    } catch (err: any) {
      console.error("Setup error:", err.message);
      res.status(500).json({ error: "Setup failed — check server logs" });
    } finally {
      conn?.end();
    }
  });

  // Login
  app.post("/api/auth/login", corsMiddleware, async (req: any, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password required" });

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [users] = (await conn.execute(
        "SELECT * FROM users WHERE email = ? AND status = 'Active'",
        [email]
      )) as [any[], any];

      if (users.length === 0)
        return res.status(401).json({ error: "Invalid email or password" });

      const user = users[0];
      if (!user.password_hash)
        return res
          .status(401)
          .json({ error: "Password not set yet. Ask your admin." });

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid)
        return res.status(401).json({ error: "Invalid email or password" });

      // Load permissions
      const [perms] = (await conn.execute(
        "SELECT company_id, bank_id FROM user_permissions WHERE user_id = ?",
        [user.id]
      )) as [any[], any];

      req.session.user = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        permissions: perms, // empty array = Admin sees everything
      };

      // Explicitly save session before responding so MySQL store persists it
      // BEFORE the browser makes its next request (prevents "Not authenticated")
      req.session.save((saveErr: any) => {
        if (saveErr) {
          console.error("Session save error:", saveErr.message);
          return res.status(500).json({ error: "Session error — please try again" });
        }
        res.json({ user: req.session.user });
      });
    } catch (err: any) {
      console.error("Login error:", err.message);
      res.status(500).json({ error: "Login failed — check server logs" });
    } finally {
      conn?.end();
    }
  });

  // Logout
  app.post("/api/auth/logout", (req: any, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  // Current session user
  app.get("/api/auth/me", corsMiddleware, (req: any, res) => {
    if (!req.session?.user)
      return res.status(401).json({ error: "Not authenticated" });
    res.json({ user: req.session.user });
  });

  // ════════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT ROUTES  (require auth + admin)
  // ════════════════════════════════════════════════════════════════════════

  // List all users with their permissions
  app.get("/api/users", corsMiddleware, requireAuth, requireAdmin, async (_req, res) => {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [users] = (await conn.execute(
        "SELECT id, name, email, role, status FROM users ORDER BY name"
      )) as [any[], any];
      const [perms] = (await conn.execute(
        "SELECT user_id, company_id, bank_id FROM user_permissions"
      )) as [any[], any];

      const result = users.map((u: any) => ({
        ...u,
        permissions: (perms as any[])
          .filter((p: any) => p.user_id === u.id)
          .map((p: any) => ({
            companyId: p.company_id,
            bankIds: p.bank_id ? [p.bank_id] : [],
          })),
      }));

      res.json({ users: result });
    } catch (err: any) {
      console.error("GET /api/users error:", err.message);
      res.status(500).json({ error: "Failed to load users" });
    } finally {
      conn?.end();
    }
  });

  // Create user
  app.post("/api/users", corsMiddleware, requireAuth, requireAdmin, async (req, res) => {
    const { name, email, role, status, password, permissions } = req.body;
    if (!name || !email || !role)
      return res.status(400).json({ error: "Name, email and role required" });

    const id = `u_${Date.now()}`;
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      // Check email not already taken
      const [existing] = (await conn.execute(
        "SELECT id FROM users WHERE email = ?",
        [email]
      )) as [any[], any];
      if (existing.length > 0)
        return res.status(409).json({ error: "A user with that email already exists" });

      await conn.execute(
        "INSERT INTO users (id, name, email, role, status, password_hash) VALUES (?, ?, ?, ?, ?, ?)",
        [id, name, email, role, status || "Active", passwordHash]
      );

      // Insert permissions (empty = all access)
      if (permissions && permissions.length > 0) {
        for (const p of permissions) {
          if (!p.companyId) continue;
          const bankIds: (string | null)[] =
            p.bankIds && p.bankIds.length > 0 ? p.bankIds : [null];
          for (const bankId of bankIds) {
            await conn.execute(
              "INSERT INTO user_permissions (user_id, company_id, bank_id) VALUES (?, ?, ?)",
              [id, p.companyId, bankId]
            );
          }
        }
      }

      res.json({ id, ok: true });
    } catch (err: any) {
      console.error("POST /api/users error:", err.message);
      res.status(500).json({ error: "Failed to create user" });
    } finally {
      conn?.end();
    }
  });

  // Update user
  app.put("/api/users/:id", corsMiddleware, requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { name, email, role, status, password, permissions } = req.body;

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      if (password) {
        const hash = await bcrypt.hash(password, 10);
        await conn.execute(
          "UPDATE users SET name=?, email=?, role=?, status=?, password_hash=? WHERE id=?",
          [name, email, role, status, hash, id]
        );
      } else {
        await conn.execute(
          "UPDATE users SET name=?, email=?, role=?, status=? WHERE id=?",
          [name, email, role, status, id]
        );
      }

      // Replace permissions
      await conn.execute("DELETE FROM user_permissions WHERE user_id = ?", [id]);
      if (permissions && permissions.length > 0) {
        for (const p of permissions) {
          if (!p.companyId) continue;
          const bankIds: (string | null)[] =
            p.bankIds && p.bankIds.length > 0 ? p.bankIds : [null];
          for (const bankId of bankIds) {
            await conn.execute(
              "INSERT INTO user_permissions (user_id, company_id, bank_id) VALUES (?, ?, ?)",
              [id, p.companyId, bankId]
            );
          }
        }
      }

      res.json({ ok: true });
    } catch (err: any) {
      console.error("PUT /api/users/:id error:", err.message);
      res.status(500).json({ error: "Failed to update user" });
    } finally {
      conn?.end();
    }
  });

  // Delete user
  app.delete("/api/users/:id", corsMiddleware, requireAuth, requireAdmin, async (req, res) => {
    const { id } = req.params;
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      await conn.execute("DELETE FROM user_permissions WHERE user_id = ?", [id]);
      await conn.execute("DELETE FROM users WHERE id = ?", [id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/users/:id error:", err.message);
      res.status(500).json({ error: "Failed to delete user" });
    } finally {
      conn?.end();
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // DATA ROUTES  (require auth — data filtered by permissions)
  // ════════════════════════════════════════════════════════════════════════

  // Dashboard data — filtered per logged-in user's permissions
  app.get("/api/liquidity", corsMiddleware, requireAuth, (req: any, res) => {
    const user = req.session.user;
    // Admins + users with no explicit permissions see everything
    if (user.role === "Admin" || !user.permissions || user.permissions.length === 0) {
      return res.json({ data: latestData, lastUpdateTime });
    }
    const filtered = filterByPermissions(latestData, user.permissions);
    res.json({ data: filtered, lastUpdateTime });
  });

  // All wallets for Manual Data Upload (Admin + Manager only, all banks regardless of is_verified)
  app.get("/api/wallets", corsMiddleware, requireAuth, async (req: any, res) => {
    const role = req.session.user?.role;
    if (role !== "Admin" && role !== "Manager")
      return res.status(403).json({ error: "Admin or Manager access required" });

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [rows] = (await conn.execute(`
        SELECT
          c.id     AS company_id,
          c.name   AS company_name,
          b.id     AS bank_id,
          b.name   AS bank_name,
          b.country AS bank_country,
          ba.id           AS account_id,
          ba.account_number AS account_number,
          ba.label          AS account_label,
          w.id        AS wallet_id,
          w.currency  AS wallet_currency,
          w.balance   AS wallet_balance,
          w.value_usd AS wallet_value_usd
        FROM companies c
        INNER JOIN banks b          ON b.company_id = c.id
        INNER JOIN bank_accounts ba ON ba.bank_id = b.id
        INNER JOIN wallets w        ON w.account_id = ba.id
        ORDER BY c.name, b.name, ba.account_number, w.currency
      `)) as [any[], any];

      res.json({ wallets: rows });
    } catch (err: any) {
      console.error("GET /api/wallets error:", err.message);
      res.status(500).json({ error: "Failed to load wallets" });
    } finally {
      conn?.end();
    }
  });

  // Historical snapshot for a specific date
  app.get("/api/liquidity/snapshot", corsMiddleware, requireAuth, async (req: any, res) => {
    const date = req.query.date as string;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date))
      return res.status(400).json({ error: "date query param required (YYYY-MM-DD)" });

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      // Check whether any snapshot exists for this date
      const [check] = await conn.execute(
        "SELECT COUNT(*) AS cnt FROM wallet_snapshots WHERE snapshot_date = ?", [date]
      ) as [any[], any];
      if (check[0].cnt === 0) {
        return res.json({ data: null, date, empty: true });
      }

      const rates = await getUsdRates();

      const [rows] = await conn.execute(`
        SELECT
          c.id                 AS company_id,
          c.name               AS company_name,
          c.industry           AS company_industry,
          c.status             AS company_status,
          b.id                 AS bank_id,
          b.name               AS bank_name,
          b.country            AS bank_country,
          b.is_verified        AS bank_is_verified,
          DATE_FORMAT(b.last_modified_date, '%Y-%m-%d %H:%i') AS bank_last_modified,
          ba.id                AS bank_account_id,
          ba.account_number    AS bank_account_number,
          ba.label             AS bank_account_label,
          w.id                 AS wallet_id,
          w.currency           AS wallet_currency,
          ws.balance           AS wallet_balance,
          ws.value_usd         AS wallet_value_usd
        FROM companies c
        INNER JOIN banks b             ON b.company_id = c.id AND b.is_verified = 1
        INNER JOIN bank_accounts ba    ON ba.bank_id = b.id
        INNER JOIN wallets w           ON w.account_id = ba.id
        INNER JOIN wallet_snapshots ws ON ws.wallet_id = w.id AND ws.snapshot_date = ?
        ORDER BY c.id, b.id, ba.id, w.id
      `, [date]) as [any[], any];

      const companiesMap = new Map<string, any>();
      for (const row of rows) {
        if (!companiesMap.has(row.company_id)) {
          companiesMap.set(row.company_id, {
            id: row.company_id, name: row.company_name,
            industry: row.company_industry, status: row.company_status,
            banks: new Map(),
          });
        }
        const company = companiesMap.get(row.company_id);
        if (!company.banks.has(row.bank_id)) {
          company.banks.set(row.bank_id, {
            id: row.bank_id, name: row.bank_name, country: row.bank_country,
            is_verified: row.bank_is_verified, last_modified_date: row.bank_last_modified,
            bank_accounts: new Map(),
          });
        }
        const bank = company.banks.get(row.bank_id);
        if (!bank.bank_accounts.has(row.bank_account_id)) {
          bank.bank_accounts.set(row.bank_account_id, {
            id: row.bank_account_id, account_number: row.bank_account_number,
            label: row.bank_account_label, wallets: [],
          });
        }
        const dbValueUsd = row.wallet_value_usd != null ? Number(row.wallet_value_usd) : null;
        const balance    = Number(row.wallet_balance ?? 0);
        const currency   = row.wallet_currency as string;
        const rate       = rates[currency];
        const hasDbValue = dbValueUsd !== null;
        const valueUsd   = hasDbValue ? dbValueUsd! : (rate !== undefined ? balance * rate : null);
        bank.bank_accounts.get(row.bank_account_id).wallets.push({
          id: row.wallet_id, currency, balance,
          value_usd: valueUsd ?? 0,
          value_usd_estimated: !hasDbValue && rate !== undefined && valueUsd !== null,
        });
      }

      const data = Array.from(companiesMap.values()).map((c: any) => ({
        ...c,
        banks: Array.from(c.banks.values()).map((b: any) => ({
          ...b, bank_accounts: Array.from(b.bank_accounts.values()),
        })),
      }));

      const user = req.session.user;
      const filtered = (user.role === "Admin" || !user.permissions?.length)
        ? data : filterByPermissions(data, user.permissions);

      res.json({ data: filtered, date, empty: false });
    } catch (err: any) {
      console.error("GET /api/liquidity/snapshot error:", err.message);
      res.status(500).json({ error: "Failed to load snapshot" });
    } finally {
      conn?.end();
    }
  });

  // ── Portfolio history sparklines ─────────────────────────────────────────
  // GET /api/portfolio-history?days=30&companyId=xxx
  // Returns daily fiat / crypto / total USD totals for the sparkline charts.
  // Applies the same value_usd → balance×rate fallback as the snapshot API
  // so that chart totals exactly match what is displayed in the donut/cards.
  app.get("/api/portfolio-history", corsMiddleware, requireAuth, async (req: any, res) => {
    const days = Math.min(Math.max(parseInt((req.query.days as string) || "30", 10), 7), 365);
    const companyId = req.query.companyId as string | undefined;
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      // Same crypto set used everywhere in the app
      const CRYPTO_SET = new Set(['BTC','ETH','USDT','USDtb','USDC','TUSD','BUSD','DAI','PEPE','HEX','SOL','BNB','XRP','LTC','MATIC','ADA','AVAX','DOT']);

      // Fetch live FX rates for the balance×rate fallback (mirrors snapshot API)
      const rates = await getUsdRates();

      // Pull individual wallet rows so we can apply the rate fallback per wallet
      const params: any[] = [days];
      if (companyId) params.push(companyId);

      const [rows] = await conn.execute(`
        SELECT
          ws.snapshot_date,
          w.currency,
          ws.balance,
          ws.value_usd
        FROM wallet_snapshots ws
        JOIN wallets       w  ON w.id  = ws.wallet_id
        JOIN bank_accounts ba ON ba.id = w.account_id
        JOIN banks         b  ON b.id  = ba.bank_id
        JOIN companies     c  ON c.id  = b.company_id
        WHERE ws.snapshot_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
          AND ws.snapshot_date <= CURDATE()
          ${companyId ? 'AND c.id = ?' : ''}
        ORDER BY ws.snapshot_date ASC
      `, params) as [any[], any];

      // Aggregate in JS, using the same fallback logic as /api/liquidity/snapshot
      const byDate = new Map<string, { fiat: number; crypto: number; total: number }>();
      for (const row of rows as any[]) {
        const dateKey = row.snapshot_date instanceof Date
          ? row.snapshot_date.toISOString().slice(0, 10)
          : String(row.snapshot_date).slice(0, 10);

        if (!byDate.has(dateKey)) byDate.set(dateKey, { fiat: 0, crypto: 0, total: 0 });

        const balance  = Number(row.balance) || 0;
        const currency = row.currency as string;

        // value_usd authoritative → fall back to balance × live rate (same as snapshot API)
        const usdVal = (row.value_usd != null && row.value_usd !== '')
          ? Number(row.value_usd)
          : (rates[currency] !== undefined ? balance * rates[currency] : 0);

        const entry = byDate.get(dateKey)!;
        entry.total += usdVal;
        if (CRYPTO_SET.has(currency)) entry.crypto += usdVal;
        else                          entry.fiat   += usdVal;
      }

      // Inject today's live wallet balances if today has no snapshot yet
      const todayKey = new Date().toISOString().slice(0, 10);
      if (!byDate.has(todayKey)) {
        const liveParams: any[] = [];
        if (companyId) liveParams.push(companyId);
        const [liveRows] = await conn.execute(`
          SELECT w.currency, w.balance, w.value_usd
          FROM wallets w
          JOIN bank_accounts ba ON ba.id = w.account_id
          JOIN banks b ON b.id = ba.bank_id
          JOIN companies c ON c.id = b.company_id
          ${companyId ? 'WHERE c.id = ?' : ''}
        `, liveParams) as [any[], any];

        const todayEntry = { fiat: 0, crypto: 0, total: 0 };
        for (const row of liveRows as any[]) {
          const balance  = Number(row.balance) || 0;
          const currency = row.currency as string;
          const usdVal = (row.value_usd != null && row.value_usd !== '')
            ? Number(row.value_usd)
            : (rates[currency] !== undefined ? balance * rates[currency] : 0);
          todayEntry.total += usdVal;
          if (CRYPTO_SET.has(currency)) todayEntry.crypto += usdVal;
          else                          todayEntry.fiat   += usdVal;
        }
        if (todayEntry.total > 0) byDate.set(todayKey, todayEntry);
      }

      // Sort by date ascending
      const data = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, fiat: v.fiat, crypto: v.crypto, total: v.total }));

      res.json({ data, days, companyId: companyId || null });
    } catch (e: any) {
      console.error("[portfolio-history] error:", e.message);
      res.status(500).json({ error: e.message });
    } finally {
      conn?.end();
    }
  });

  // Manual sync trigger
  app.post("/api/sync", corsMiddleware, requireAuth, async (_req, res) => {
    try {
      await queryDatabase();
      res.json({ status: "Synced", count: latestData.length, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("DB sync error:", err.message);
      res.status(500).json({ error: "Sync failed — check server logs" });
    }
  });

  // Current exchange rates (read-only, for the rates panel in the UI)
  app.get("/api/rates", corsMiddleware, requireAuth, async (_req, res) => {
    try {
      const rates = await getUsdRates();
      res.json({ rates, fetchedAt: new Date(rateCache.fetchedAt).toISOString() });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to fetch rates" });
    }
  });

  // Manual wallet balance update
  app.post("/api/update-balances", corsMiddleware, requireAuth, async (req, res) => {
    const updates: { wallet_id: string; wallet_balance: number; wallet_value_usd: number | null }[] =
      req.body?.updates;
    if (!Array.isArray(updates) || updates.length === 0)
      return res.status(400).json({ error: "No updates provided" });

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
    } catch (err: any) {
      console.error("Balance update — DB connection failed:", err.message);
      return res.status(500).json({ error: "Database unavailable — check server logs" });
    }

    let updated = 0;
    const notFound: string[] = [];
    try {
      for (const u of updates) {
        const hasusd = u.wallet_value_usd !== null && u.wallet_value_usd !== undefined;
        const sql = hasusd
          ? "UPDATE wallets SET balance = ?, value_usd = ?, updated_at = NOW() WHERE id = ?"
          : "UPDATE wallets SET balance = ?, updated_at = NOW() WHERE id = ?";
        const params = hasusd
          ? [u.wallet_balance, u.wallet_value_usd, u.wallet_id]
          : [u.wallet_balance, u.wallet_id];
        const [result] = (await conn.execute(sql, params)) as any[];
        if (result.affectedRows === 0) notFound.push(u.wallet_id);
        else updated++;
      }

      // Update last_modified_date on the parent bank for every wallet that was changed
      if (updated > 0) {
        const updatedWalletIds = updates
          .filter(u => !notFound.includes(u.wallet_id))
          .map(u => u.wallet_id);
        const placeholders = updatedWalletIds.map(() => "?").join(", ");
        await conn.execute(
          `UPDATE banks b
           INNER JOIN bank_accounts ba ON ba.bank_id = b.id
           INNER JOIN wallets w ON w.account_id = ba.id
           SET b.last_modified_date = NOW()
           WHERE w.id IN (${placeholders})`,
          updatedWalletIds
        );
      }

      await queryDatabase().catch((err) =>
        console.warn("Post-update sync failed:", err.message)
      );
      res.json({ updated, notFound });
    } catch (err: any) {
      console.error("Balance update error:", err.message);
      res.status(500).json({ error: "Update failed — check server logs" });
    } finally {
      await conn.end();
    }
  });

  // ── Alerts DB table ───────────────────────────────────────────────────────
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS wallet_alerts (
            id          VARCHAR(64)  NOT NULL PRIMARY KEY,
            company_id  VARCHAR(64)  NOT NULL,
            bank_id     VARCHAR(64)  NOT NULL,
            wallet_id   VARCHAR(64)  NOT NULL,
            threshold   DOUBLE       NOT NULL,
            email       VARCHAR(255) NOT NULL,
            is_enabled  TINYINT      NOT NULL DEFAULT 1,
            last_fired_at DATETIME   NULL,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[Alerts] wallet_alerts table ready");
      } catch (e: any) { console.warn("[Alerts] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Alerts] DB not reachable on startup (alerts table skipped):", e.message);
    }
  })();

  // ── Per-user dashboard layout table ───────────────────────────────────────
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS user_dashboard_layout (
            user_id     VARCHAR(64) NOT NULL PRIMARY KEY,
            layout_json LONGTEXT    NOT NULL,
            updated_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[Dashboard] user_dashboard_layout table ready");
      } catch (e: any) { console.warn("[Dashboard] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Dashboard] DB not reachable on startup (layout table skipped):", e.message);
    }
  })();

  // GET /api/dashboard-layout — the current user's saved widget layout (null if none)
  app.get("/api/dashboard-layout", corsMiddleware, requireAuth, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute(
        "SELECT layout_json FROM user_dashboard_layout WHERE user_id = ?",
        [req.session.user.id]
      )) as any;
      if (!rows.length) return res.json({ layout: null });
      let layout = null;
      try { layout = JSON.parse(rows[0].layout_json); } catch { layout = null; }
      res.json({ layout });
    } catch (err: any) {
      console.error("Dashboard layout load error:", err.message);
      res.status(500).json({ error: "Failed to load layout" });
    } finally {
      await conn.end();
    }
  });

  // POST /api/dashboard-layout — upsert the current user's widget layout
  app.post("/api/dashboard-layout", corsMiddleware, requireAuth, async (req: any, res) => {
    const layout = req.body?.layout;
    if (!Array.isArray(layout)) {
      return res.status(400).json({ error: "layout must be an array" });
    }
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute(
        `INSERT INTO user_dashboard_layout (user_id, layout_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json)`,
        [req.session.user.id, JSON.stringify(layout)]
      );
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Dashboard layout save error:", err.message);
      res.status(500).json({ error: "Failed to save layout" });
    } finally {
      await conn.end();
    }
  });

  // ── App settings (branding) table ─────────────────────────────────────────
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS app_settings (
            k          VARCHAR(64) NOT NULL PRIMARY KEY,
            v          LONGTEXT    NOT NULL,
            updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[Branding] app_settings table ready");
      } catch (e: any) { console.warn("[Branding] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Branding] DB not reachable on startup (settings table skipped):", e.message);
    }
  })();

  // GET /api/branding — org logo + site name (auth required, any role)
  app.get("/api/branding", corsMiddleware, requireAuth, async (_req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute(
        "SELECT k, v FROM app_settings WHERE k IN ('brand_site_name', 'brand_logo', 'brand_theme', 'brand_logo_bg') OR k LIKE 'company_logo_%'"
      )) as any;
      const map: Record<string, string> = {};
      const companyLogos: Record<string, string> = {};
      for (const r of rows as any[]) {
        if (typeof r.k === "string" && r.k.startsWith("company_logo_")) {
          const id = r.k.slice("company_logo_".length);
          if (r.v) companyLogos[id] = r.v;
        } else {
          map[r.k] = r.v;
        }
      }
      res.json({
        siteName: map.brand_site_name || "Liquidity Reports",
        logo: map.brand_logo || null,
        theme: map.brand_theme || "dark",
        logoBg: map.brand_logo_bg || "light",
        companyLogos,
      });
    } catch (err: any) {
      console.error("Branding load error:", err.message);
      res.json({ siteName: "Liquidity Reports", logo: null, theme: "dark", logoBg: "light", companyLogos: {} });
    } finally {
      await conn.end();
    }
  });

  // POST /api/branding — update logo and/or site name (Admin only)
  app.post("/api/branding", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const { siteName, logo, theme } = req.body || {};
    // Logo is stored as a data URL; cap size to keep the payload sane (~1MB base64).
    if (logo != null && (typeof logo !== "string" || logo.length > 1_400_000)) {
      return res.status(400).json({ error: "Logo too large or invalid (max ~1MB image)" });
    }
    if (siteName != null && (typeof siteName !== "string" || siteName.length > 120)) {
      return res.status(400).json({ error: "Site name invalid" });
    }
    if (theme != null && !["dark", "gray", "light"].includes(theme)) {
      return res.status(400).json({ error: "Theme invalid" });
    }
    const logoBg = req.body?.logoBg;
    if (logoBg != null && !["light", "dark", "none"].includes(logoBg)) {
      return res.status(400).json({ error: "Logo background invalid" });
    }
    const companyLogos = req.body?.companyLogos;
    if (companyLogos != null && (typeof companyLogos !== "object" || Array.isArray(companyLogos))) {
      return res.status(400).json({ error: "companyLogos must be an object" });
    }
    if (companyLogos) {
      for (const v of Object.values(companyLogos)) {
        if (v != null && (typeof v !== "string" || v.length > 1_400_000)) {
          return res.status(400).json({ error: "A company logo is too large or invalid (max ~1MB image)" });
        }
      }
    }
    const conn = await mysql.createConnection(dbConfig());
    try {
      const upsert = (k: string, v: string) => conn.execute(
        `INSERT INTO app_settings (k, v) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE v = VALUES(v)`,
        [k, v]
      );
      if (typeof siteName === "string") await upsert("brand_site_name", siteName);
      if (typeof logo === "string") await upsert("brand_logo", logo);
      if (typeof theme === "string") await upsert("brand_theme", theme);
      if (typeof logoBg === "string") await upsert("brand_logo_bg", logoBg);
      if (companyLogos) {
        for (const [id, v] of Object.entries(companyLogos)) {
          // empty string clears that company's logo
          await upsert(`company_logo_${id}`, typeof v === "string" ? v : "");
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Branding save error:", err.message);
      res.status(500).json({ error: "Failed to save branding" });
    } finally {
      await conn.end();
    }
  });

  // ── Roles table (custom roles + per-role company/bank access) ─────────────
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS app_roles (
            id               VARCHAR(64)  NOT NULL PRIMARY KEY,
            name             VARCHAR(120) NOT NULL,
            builtin          TINYINT      NOT NULL DEFAULT 0,
            permissions_json LONGTEXT     NOT NULL,
            updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        // Page-access column (added separately so existing installs upgrade in place).
        try { await conn.execute("ALTER TABLE app_roles ADD COLUMN pages_json LONGTEXT NOT NULL DEFAULT ('[]')"); }
        catch { /* column already exists */ }
        // Seed the built-in roles once.
        const [rows] = (await conn.execute("SELECT COUNT(*) AS n FROM app_roles")) as any;
        if (!rows[0].n) {
          for (const name of ["Admin", "Manager", "Viewer"]) {
            await conn.execute(
              "INSERT INTO app_roles (id, name, builtin, permissions_json) VALUES (?, ?, 1, '[]')",
              [name.toLowerCase(), name]
            );
          }
        }
        console.log("[Roles] app_roles table ready");
      } catch (e: any) { console.warn("[Roles] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Roles] DB not reachable on startup (roles table skipped):", e.message);
    }
  })();

  // GET /api/roles — list roles with parsed company/bank access
  app.get("/api/roles", corsMiddleware, requireAuth, async (_req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute("SELECT id, name, builtin, permissions_json, pages_json FROM app_roles ORDER BY builtin DESC, name")) as any;
      const roles = (rows as any[]).map(r => {
        let permissions = [], pages = [];
        try { permissions = JSON.parse(r.permissions_json); } catch { permissions = []; }
        try { pages = JSON.parse(r.pages_json || '[]'); } catch { pages = []; }
        return { id: r.id, name: r.name, builtin: !!r.builtin, pages, permissions };
      });
      res.json({ roles });
    } catch (err: any) {
      console.error("Roles load error:", err.message);
      res.status(500).json({ error: "Failed to load roles" });
    } finally { await conn.end(); }
  });

  // POST /api/roles — create a custom role (Admin only)
  app.post("/api/roles", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Role name is required" });
    if (name.length > 120) return res.status(400).json({ error: "Role name too long" });
    const id = `role_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute("INSERT INTO app_roles (id, name, builtin, permissions_json) VALUES (?, ?, 0, '[]')", [id, name]);
      res.json({ ok: true, id });
    } catch (err: any) {
      console.error("Role create error:", err.message);
      res.status(500).json({ error: "Failed to create role" });
    } finally { await conn.end(); }
  });

  // PUT /api/roles/:id — update a role's name and/or company/bank access (Admin only)
  app.put("/api/roles/:id", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const { name, permissions, pages } = req.body || {};
    if (permissions != null && !Array.isArray(permissions)) {
      return res.status(400).json({ error: "permissions must be an array" });
    }
    if (pages != null && !Array.isArray(pages)) {
      return res.status(400).json({ error: "pages must be an array" });
    }
    const conn = await mysql.createConnection(dbConfig());
    try {
      if (typeof name === "string" && name.trim()) {
        await conn.execute("UPDATE app_roles SET name = ? WHERE id = ?", [name.trim(), req.params.id]);
      }
      if (Array.isArray(permissions)) {
        await conn.execute("UPDATE app_roles SET permissions_json = ? WHERE id = ?", [JSON.stringify(permissions), req.params.id]);
      }
      if (Array.isArray(pages)) {
        await conn.execute("UPDATE app_roles SET pages_json = ? WHERE id = ?", [JSON.stringify(pages), req.params.id]);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Role update error:", err.message);
      res.status(500).json({ error: "Failed to update role" });
    } finally { await conn.end(); }
  });

  // DELETE /api/roles/:id — remove a custom role (built-in roles are protected)
  app.delete("/api/roles/:id", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute("SELECT builtin FROM app_roles WHERE id = ?", [req.params.id])) as any;
      if (rows.length && rows[0].builtin) return res.status(400).json({ error: "Built-in roles cannot be deleted" });
      await conn.execute("DELETE FROM app_roles WHERE id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Role delete error:", err.message);
      res.status(500).json({ error: "Failed to delete role" });
    } finally { await conn.end(); }
  });

  // GET /api/alerts — list all alerts
  app.get("/api/alerts", corsMiddleware, requireAuth, async (_req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = await conn.execute("SELECT * FROM wallet_alerts ORDER BY created_at DESC") as any;
      const alerts = (rows as any[]).map(r => ({
        id: r.id, companyId: r.company_id, bankId: r.bank_id, walletId: r.wallet_id,
        threshold: r.threshold, email: r.email, isEnabled: r.is_enabled === 1,
      }));
      res.json(alerts);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { conn.end(); }
  });

  // POST /api/alerts — create alert
  app.post("/api/alerts", corsMiddleware, requireAuth, async (req, res) => {
    const { id, companyId, bankId, walletId, threshold, email, isEnabled } = req.body;
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute(
        "INSERT INTO wallet_alerts (id, company_id, bank_id, wallet_id, threshold, email, is_enabled) VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE threshold=VALUES(threshold), email=VALUES(email), is_enabled=VALUES(is_enabled)",
        [id, companyId, bankId, walletId, threshold, email, isEnabled ? 1 : 0]
      );
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { conn.end(); }
  });

  // DELETE /api/alerts/:id — delete alert
  app.delete("/api/alerts/:id", corsMiddleware, requireAuth, async (req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute("DELETE FROM wallet_alerts WHERE id=?", [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { conn.end(); }
  });

  // PUT /api/alerts/:id/toggle — enable/disable
  app.put("/api/alerts/:id/toggle", corsMiddleware, requireAuth, async (req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute("UPDATE wallet_alerts SET is_enabled = NOT is_enabled WHERE id=?", [req.params.id]);
      const [rows] = await conn.execute("SELECT is_enabled FROM wallet_alerts WHERE id=?", [req.params.id]) as any;
      res.json({ isEnabled: (rows as any[])[0]?.is_enabled === 1 });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { conn.end(); }
  });

  // ── Server-side alert checker ─────────────────────────────────────────────
  async function checkAlerts() {
    const webhookUrl = process.env.ZAPIER_NOTIFY_WEBHOOK;
    if (!webhookUrl) return;
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [alertRows] = await conn.execute("SELECT * FROM wallet_alerts WHERE is_enabled=1") as any;
      if (!(alertRows as any[]).length) return;

      const rates = await getUsdRates();

      for (const alert of alertRows as any[]) {
        // Get current balance for this wallet
        const [wRows] = await conn.execute(
          "SELECT w.balance, w.currency, w.value_usd, b.name as bank_name, c.name as company_name FROM wallets w JOIN bank_accounts ba ON w.account_id=ba.id JOIN banks b ON ba.bank_id=b.id JOIN companies c ON b.company_id=c.id WHERE w.id=?",
          [alert.wallet_id]
        ) as any;
        const wallet = (wRows as any[])[0];
        if (!wallet) continue;

        const balance = Number(wallet.balance) || 0;
        if (balance <= alert.threshold) {
          // Atomic claim: only fire if last_fired_at is still NULL at the moment we update.
          // This prevents duplicate emails when two checkAlerts() calls run concurrently
          // (e.g. the 5-min interval and the on-create trigger overlapping).
          const [claimed] = await conn.execute(
            "UPDATE wallet_alerts SET last_fired_at=NOW(), is_enabled=0 WHERE id=? AND last_fired_at IS NULL AND is_enabled=1",
            [alert.id]
          ) as any;
          if ((claimed as any).affectedRows === 0) continue; // another process already fired it

          const usdVal = wallet.value_usd ?? (rates[wallet.currency] ? balance * rates[wallet.currency] : balance);
          const payload = {
            alert_id: alert.id,
            company: wallet.company_name,
            bank: wallet.bank_name,
            wallet_id: alert.wallet_id,
            currency: wallet.currency,
            amount: balance,
            usd_value: usdVal,
            threshold: alert.threshold,
            email_address: alert.email,
          };

          try {
            const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            console.log(`[Alert] Fired for wallet ${alert.wallet_id} — balance ${balance} ≤ threshold ${alert.threshold} (HTTP ${r.status}). Alert auto-disabled.`);
          } catch (e: any) {
            console.error(`[Alert] Webhook failed for ${alert.wallet_id}:`, e.message);
          }
        }
      }
    } catch (e: any) {
      console.warn("[Alerts] checkAlerts error:", e.message);
    } finally {
      conn.end();
    }
  }

  // Run alert check every 5 minutes
  setInterval(() => { checkAlerts().catch(e => console.error("[Alerts] checkAlerts error:", e.message)); }, 5 * 60 * 1000);

  // POST /api/alerts/check — manually trigger a check (called after sync)
  app.post("/api/alerts/check", corsMiddleware, requireAuth, async (_req, res) => {
    checkAlerts().catch(e => console.error("[Alerts] manual check error:", e.message));
    res.json({ ok: true, message: "Alert check triggered" });
  });

  // Alert rule saved → push to Zapier
  app.post("/api/alerts/trigger", corsMiddleware, requireAuth, async (req, res) => {
    const webhookUrl = process.env.ZAPIER_ALERTS_WEBHOOK;
    if (!webhookUrl)
      return res.status(503).json({ error: "ZAPIER_ALERTS_WEBHOOK not configured" });
    try {
      const { id, companyId, bankId, walletId, threshold, email, isEnabled } = req.body;
      const payload = { id, company_id: companyId, bank_id: bankId, wallet_id: walletId, threshold, email, is_enabled: isEnabled ? 1 : 0 };
      const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      res.json({ status: "Triggered", details: r.statusText });
    } catch (err: any) {
      console.error("alerts/trigger error:", err.message);
      res.status(500).json({ error: "Failed to trigger alert sync" });
    }
  });

  // Threshold breach notification → push to Zapier
  app.post("/api/alerts/notify", corsMiddleware, requireAuth, async (req, res) => {
    const webhookUrl = process.env.ZAPIER_NOTIFY_WEBHOOK;
    if (!webhookUrl)
      return res.status(503).json({ error: "ZAPIER_NOTIFY_WEBHOOK not configured" });
    try {
      const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      res.json({ status: "Triggered", details: r.statusText });
    } catch (err: any) {
      console.error("alerts/notify error:", err.message);
      res.status(500).json({ error: "Failed to trigger alert notification" });
    }
  });

  // 404 for unknown API routes
  app.use("/api/*", corsMiddleware, (req, res) => {
    res.status(404).json({ error: "Endpoint not found", path: req.originalUrl });
  });

  // ── Frontend serving ──────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: "all" },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) =>
      res.sendFile(path.join(distPath, "index.html"))
    );
  }

  // Ensure sessions table exists BEFORE the server accepts any requests
  await sessionStore._ensureTable().catch(e =>
    console.warn("[Session] Could not create sessions table — falling back to in-memory sessions:", e.message)
  );

  // Kick off DB data load (non-blocking — server starts immediately)
  queryDatabase().catch((err) => {
    const msg = err instanceof AggregateError
      ? err.errors?.map((e: any) => e.message).join(" | ")
      : err.message;
    console.error(`[STARTUP] DB sync failed: ${msg}`);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
