import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fs from "fs";
import mysql from "mysql2/promise";
import session from "express-session";
import bcrypt from "bcryptjs";
import passport from "passport";
import { Strategy as SamlStrategy, Profile as SamlProfile } from "@node-saml/passport-saml";
import crypto from "crypto";

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
      // Optional profile fields populated from Entra SSO claims (password logins omit them).
      upn?: string;
      department?: string;
      jobTitle?: string;
    };
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ── CORS - applied only to /api/* routes ─────────────────────────────────
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

  // ── Custom MySQL session store (pure mysql2 - ESM compatible) ─────────────
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

  // ── SAML SSO (optional - active only when the SAML_* env vars are set) ────
  // Lets a customer's employees sign in via their Microsoft Entra ID tenant.
  // Runs alongside email/password login (hybrid), never instead of it. All
  // The tenant, our SP entity id (issuer), the reply URL and the IdP login URL are all
  // non-secret and stable, so they are baked in below (each still overridable via env).
  // The ONLY thing to configure is the IdP signing certificate: set SAML_METADATA_URL to
  // the "App Federation Metadata Url" from Entra and we fetch the cert from it at startup
  // (SAML_IDP_CERT can still be used to paste a raw cert instead).
  const ENTRA_TENANT_ID = "318030de-752f-42b3-9848-abd6ec3809e3";
  const APP_BASE_URL = process.env.APP_URL || "https://stage-finboard.corp-domain.com";
  const SAML_ENTRY_POINT = process.env.SAML_ENTRY_POINT || `https://login.microsoftonline.com/${ENTRA_TENANT_ID}/saml2`;
  const SAML_ISSUER = process.env.SAML_ISSUER || APP_BASE_URL;
  const SAML_CALLBACK_URL = process.env.SAML_CALLBACK_URL || `${APP_BASE_URL}/api/auth/saml/callback`;
  const SAML_METADATA_URL = process.env.SAML_METADATA_URL || "";

  // Resolve the IdP signing certificate(s): an explicit SAML_IDP_CERT wins; otherwise
  // fetch the App Federation Metadata XML and pull out the <X509Certificate> value(s)
  // (Entra can publish more than one during a signing-cert rollover).
  const resolveIdpCerts = async (): Promise<string[]> => {
    if (process.env.SAML_IDP_CERT) return [process.env.SAML_IDP_CERT];
    if (!SAML_METADATA_URL) return [];
    try {
      const xml = await fetch(SAML_METADATA_URL).then(r => r.text());
      const certs = [...xml.matchAll(/<(?:\w+:)?X509Certificate>([\s\S]*?)<\/(?:\w+:)?X509Certificate>/g)]
        .map(m => m[1].replace(/\s+/g, ""))
        .filter(Boolean);
      return [...new Set(certs)];
    } catch (e: any) {
      console.warn("[SAML] federation metadata fetch failed:", e.message);
      return [];
    }
  };
  const rawCerts = await resolveIdpCerts();
  // Normalize each cert to a well-formed PEM (headers + 64-char-wrapped body). node-saml's
  // signature check fails ("Invalid document signature") if the key is malformed PEM, even
  // when the certificate itself is the correct one.
  const toPem = (raw: string): string => {
    const body = (raw.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "").match(/.{1,64}/g) || []).join("\n");
    return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
  };
  const idpCerts = rawCerts.map(toPem);
  // SHA-1 fingerprints (Entra "Thumbprint" format) to confirm the loaded signing cert.
  const idpCertFingerprints = rawCerts.map(c => {
    const der = c.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
    try { return crypto.createHash("sha1").update(Buffer.from(der, "base64")).digest("hex").toUpperCase(); }
    catch { return "?"; }
  });
  const SAML_ENABLED = idpCerts.length > 0;
  let samlStrategy: SamlStrategy | null = null;
  if (SAML_ENABLED) {
    samlStrategy = new SamlStrategy(
      {
        entryPoint: SAML_ENTRY_POINT,
        issuer: SAML_ISSUER,
        callbackUrl: SAML_CALLBACK_URL,
        idpCert: idpCerts.length === 1 ? idpCerts[0] : idpCerts,
        // Entra signs the ASSERTION by default, not the Response envelope. @node-saml v5
        // requires a signed response by default, which caused "Invalid document signature".
        // Require the assertion signature (which Entra provides) and not the response.
        wantAssertionsSigned: true,
        wantAuthnResponseSigned: false,
        identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      (profile: SamlProfile | null, done: any) => done(null, profile ?? false),
      (profile: SamlProfile | null, done: any) => done(null, profile ?? false)
    );
    passport.use("saml", samlStrategy);
    console.log(`🔐 SAML SSO: ENABLED (issuer ${SAML_ISSUER}, certs ${idpCertFingerprints.join(", ") || "none"})`);
  }
  app.use(passport.initialize());

  // Read a SAML claim by its env-overridable name, falling back to the common
  // Entra claim URIs. Returns the first non-empty match, or "".
  const claim = (profile: any, envName: string, ...uris: string[]): string => {
    const keys = [process.env[envName], ...uris].filter(Boolean) as string[];
    for (const k of keys) {
      const v = profile?.[k];
      if (v != null && v !== "") return Array.isArray(v) ? String(v[0]) : String(v);
    }
    return "";
  };
  // Groups claim is multi-valued (array of Object IDs); normalize to string[].
  const claimList = (profile: any, envName: string, ...uris: string[]): string[] => {
    const keys = [process.env[envName], ...uris].filter(Boolean) as string[];
    for (const k of keys) {
      const v = profile?.[k];
      if (v == null || v === "") continue;
      return Array.isArray(v) ? v.map(String) : [String(v)];
    }
    return [];
  };

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

  // Delete stale JSON cache on startup - always fetch fresh from DB so
  // last_modified_date and balances are never served from a stale file.
  if (fs.existsSync(DATA_FILE)) {
    try { fs.unlinkSync(DATA_FILE); } catch (_) {}
    console.log("Cleared stale data cache - will fetch fresh from DB.");
  }

  // ── Live exchange-rate engine ─────────────────────────────────────────────
  // Rates are fetched at most once every 5 minutes and cached in memory.
  // value_usd from integrations is always authoritative - rates only fill in
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

  // ── PSP query - providers / eWallets / live wallet accounts ───────────────
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

  // ── PSP query - settlements (next payments + history) ─────────────────────
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
      // Fetch live rates before building the dataset - wallets without a
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

        // Use DB value when present (non-null and non-zero with real balance);
        // value_usd=0 on a non-zero balance means the field was never populated —
        // fall back to live rate so newly-added wallets price correctly.
        // Negative balances are valid (overdrafts) and must not be discarded.
        const hasDbValue      = dbValueUsd !== null && !(dbValueUsd === 0 && balance !== 0);
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
  // AUTH ROUTES  (no requireAuth - these are the login endpoints)
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
      // DB unreachable - surface setup page so admin can diagnose
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
      res.status(500).json({ error: "Setup failed - check server logs" });
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
      // SSO-merged accounts sign in with Microsoft only until an admin reverts them.
      if (user.auth_source === "sso")
        return res
          .status(403)
          .json({ error: "This account uses Microsoft sign-in. Please use \"Sign in with Microsoft\"." });
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
          return res.status(500).json({ error: "Session error - please try again" });
        }
        res.json({ user: req.session.user });
      });
    } catch (err: any) {
      console.error("Login error:", err.message);
      res.status(500).json({ error: "Login failed - check server logs" });
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

  // Login screen uses this to decide whether to show "Sign in with Microsoft".
  app.get("/api/auth/sso-status", corsMiddleware, (_req, res) => {
    res.json({ samlEnabled: SAML_ENABLED });
  });

  if (SAML_ENABLED && samlStrategy) {
    // Initiate SSO - redirect the browser to the customer's Entra login.
    app.get("/api/auth/saml/login", passport.authenticate("saml", { session: false }));

    // SP metadata - hand this to the Entra admin when registering the app.
    app.get("/api/auth/saml/metadata", (_req, res) => {
      res.type("application/xml");
      res.send(samlStrategy!.generateServiceProviderMetadata(null, null));
    });

    // Entra POSTs the signed assertion here after the employee authenticates.
    app.post(
      "/api/auth/saml/callback",
      express.urlencoded({ extended: false }),
      // Custom callback so a validation *error* (bad signature, audience mismatch, …)
      // is logged and surfaced instead of bubbling up as a bare 500.
      (req: any, res: any, next: any) => {
        passport.authenticate("saml", { session: false }, (err: any, profile: any) => {
          if (err) {
            console.error("SAML auth error:", err?.message || err, "\n", err?.stack || "");
            return res.status(500).type("text/plain").send(
              `SSO error: ${err?.message || err}\n\nLoaded IdP signing cert SHA-1: ${idpCertFingerprints.join(", ") || "none"}\nExpected (Entra portal Thumbprint): compare this to your Token signing certificate.`
            );
          }
          if (!profile) return res.redirect("/?sso=failed");
          req.user = profile;
          next();
        })(req, res, next);
      },
      async (req: any, res: any) => {
        const profile: any = req.user;
        if (!profile) return res.redirect("/?sso=failed");

        // Extract claims (env-overridable names, common Entra URIs as fallback).
        const oid = claim(profile, "SAML_CLAIM_OID", "http://schemas.microsoft.com/identity/claims/objectidentifier");
        const upn = claim(profile, "SAML_CLAIM_UPN", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn", "upn") || profile.nameID || "";
        const email = claim(profile, "SAML_CLAIM_EMAIL", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress", "mail", "email") || upn;
        const name = claim(profile, "SAML_CLAIM_NAME", "http://schemas.microsoft.com/identity/claims/displayname", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name", "displayName") || upn || email;
        const department = claim(profile, "SAML_CLAIM_DEPARTMENT", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/department", "department");
        const jobTitle = claim(profile, "SAML_CLAIM_JOBTITLE", "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/jobtitle", "jobTitle", "title");
        const groups = claimList(profile, "SAML_CLAIM_GROUPS", "http://schemas.microsoft.com/ws/2008/06/identity/claims/groups", "groups");

        if (!upn && !email) return res.redirect("/?sso=failed");

        let conn: any;
        try {
          conn = await mysql.createConnection(dbConfig());

          // 1) Record every group we saw (auto-discovery for the admin UI).
          for (const g of groups) {
            await conn.execute(
              "INSERT INTO entra_groups (group_id) VALUES (?) ON DUPLICATE KEY UPDATE last_seen = CURRENT_TIMESTAMP",
              [g]
            );
          }

          // 2) Roles mapped from this user's groups - this is the access gate.
          let mappedRoleIds: string[] = [];
          if (groups.length) {
            const ph = groups.map(() => "?").join(",");
            const [mr] = (await conn.execute(
              `SELECT DISTINCT role_id FROM entra_group_roles WHERE group_id IN (${ph})`,
              groups
            )) as any;
            mappedRoleIds = (mr as any[]).map(r => r.role_id);
          }
          if (!mappedRoleIds.length) {
            console.warn(`SAML login denied - ${upn || email} groups=[${groups.join(", ")}]`);
            // Temporary (staging): show what the token actually carried so group mapping
            // can be verified. Remove once SSO is confirmed working.
            const claimKeys = Object.keys(profile || {}).filter(k => k !== "getAssertionXml" && typeof (profile as any)[k] !== "function");
            return res.status(403).type("text/plain").send(
              `SSO not authorized: none of your groups are mapped to a role.\n\n` +
              `Groups in the token (${groups.length}): ${groups.join(", ") || "(none - the groups claim was not sent)"}\n` +
              `UPN: ${upn}\nEmail: ${email}\nName: ${name}\n\n` +
              `All claim keys present: ${claimKeys.join(", ")}\n\n` +
              `Map one of the group IDs above to a role in User Management → Entra Groups, then sign in again.`
            );
          }

          // 3) Find or create the user (match by oid → upn → email).
          const [found] = (await conn.execute(
            "SELECT * FROM users WHERE (? <> '' AND entra_oid = ?) OR upn = ? OR email = ? LIMIT 1",
            [oid, oid, upn, email]
          )) as any;
          let user = found[0];
          if (!user) {
            const id = oid ? `entra_${oid}` : `entra_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
            await conn.execute(
              "INSERT INTO users (id, name, email, role, status, entra_oid, upn, department, job_title, auth_source) VALUES (?, ?, ?, 'Viewer', 'Active', ?, ?, ?, ?, 'sso')",
              [id, name, email, oid || null, upn || null, department || null, jobTitle || null]
            );
            const [u2] = (await conn.execute("SELECT * FROM users WHERE id = ?", [id])) as any;
            user = u2[0];
          } else {
            if (user.status && String(user.status).toLowerCase() !== "active") {
              console.warn(`SAML login denied - account ${user.email} status=${user.status}`);
              return res.status(403).type("text/plain").send(
                `SSO not authorized: your account "${user.email}" (id ${user.id}) has status "${user.status}", not Active. An admin can re-activate it in User Management.`
              );
            }
            // First SAML login merges a local account into SSO: from now on this user
            // signs in with Microsoft only (password login is blocked) until an admin
            // reverts them to a local account.
            await conn.execute(
              "UPDATE users SET name = ?, email = ?, entra_oid = COALESCE(NULLIF(?, ''), entra_oid), upn = ?, department = ?, job_title = ?, auth_source = 'sso' WHERE id = ?",
              [name, email, oid, upn || null, department || null, jobTitle || null, user.id]
            );
          }

          // 4) Sync group-derived roles; preserve admin-assigned (manual) ones.
          await conn.execute("DELETE FROM user_roles WHERE user_id = ? AND source = 'group'", [user.id]);
          for (const rid of mappedRoleIds) {
            await conn.execute(
              "INSERT INTO user_roles (user_id, role_id, source) VALUES (?, ?, 'group') ON DUPLICATE KEY UPDATE source = 'group'",
              [user.id, rid]
            );
          }

          // 5) Effective access = union of all assigned roles (group + manual).
          const [urows] = (await conn.execute(
            "SELECT ar.id, ar.permissions_json FROM user_roles ur JOIN app_roles ar ON ar.id = ur.role_id WHERE ur.user_id = ?",
            [user.id]
          )) as any;
          const roleIds = (urows as any[]).map(r => String(r.id));
          // Legacy single role drives requireAdmin + nav gating: admin > manager > viewer.
          const sessionRole = roleIds.includes("admin") ? "Admin" : roleIds.includes("manager") ? "Manager" : "Viewer";

          // Company/bank scope = union of the roles' permissions. Admin ⇒ all.
          // A role with empty permissions means "all companies" (app convention),
          // so union with any such role ⇒ all ([]).
          let permissions: { company_id: string; bank_id: string | null }[] = [];
          if (sessionRole !== "Admin") {
            let grantsAll = false;
            const perms: { company_id: string; bank_id: string | null }[] = [];
            for (const r of urows as any[]) {
              let parsed: any[] = [];
              try { parsed = JSON.parse(r.permissions_json || "[]"); } catch { parsed = []; }
              if (!parsed.length) { grantsAll = true; break; }
              for (const p of parsed) {
                const cid = p.companyId ?? p.company_id;
                const banks: string[] = p.bankIds ?? p.bank_ids ?? [];
                if (!cid) continue;
                if (!banks.length) perms.push({ company_id: String(cid), bank_id: null });
                else for (const b of banks) perms.push({ company_id: String(cid), bank_id: String(b) });
              }
            }
            permissions = grantsAll ? [] : perms;
          }

          // Keep the legacy role column in sync with the derived role.
          await conn.execute("UPDATE users SET role = ? WHERE id = ?", [sessionRole, user.id]);

          req.session.user = {
            id: user.id,
            name,
            email,
            role: sessionRole,
            permissions,
            upn: upn || undefined,
            department: department || undefined,
            jobTitle: jobTitle || undefined,
          };
          req.session.save((err: any) => {
            if (err) { console.error("SAML session save error:", err.message); return res.redirect("/?sso=error"); }
            res.redirect("/");
          });
        } catch (err: any) {
          console.error("SAML callback error:", err.message);
          res.redirect("/?sso=error");
        } finally {
          conn?.end();
        }
      }
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // USER MANAGEMENT ROUTES  (require auth + admin)
  // ════════════════════════════════════════════════════════════════════════

  // List all users with their permissions
  app.get("/api/users", corsMiddleware, requireAuth, requireAdmin, async (_req, res) => {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      const [users] = (await conn.execute(
        "SELECT id, name, email, role, status, auth_source FROM users ORDER BY name"
      )) as [any[], any];
      const [perms] = (await conn.execute(
        "SELECT user_id, company_id, bank_id FROM user_permissions"
      )) as [any[], any];
      const [userRoles] = (await conn.execute(
        "SELECT user_id, role_id FROM user_roles"
      )) as [any[], any];

      const result = users.map((u: any) => ({
        ...u,
        authSource: u.auth_source || "password",
        permissions: (perms as any[])
          .filter((p: any) => p.user_id === u.id)
          .map((p: any) => ({
            companyId: p.company_id,
            bankIds: p.bank_id ? [p.bank_id] : [],
          })),
        roleIds: (userRoles as any[]).filter((r: any) => r.user_id === u.id).map((r: any) => r.role_id),
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
    const { name, email, role, status, password, permissions, roleIds } = req.body;
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

      if (Array.isArray(roleIds)) {
        for (const rid of roleIds) {
          if (rid) await conn.execute("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", [id, rid]);
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
    const { name, email, role, status, password, permissions, roleIds } = req.body;

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

      // Replace role assignments
      if (Array.isArray(roleIds)) {
        await conn.execute("DELETE FROM user_roles WHERE user_id = ?", [id]);
        for (const rid of roleIds) {
          if (rid) await conn.execute("INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)", [id, rid]);
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
      await conn.execute("DELETE FROM user_roles WHERE user_id = ?", [id]);
      await conn.execute("DELETE FROM users WHERE id = ?", [id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("DELETE /api/users/:id error:", err.message);
      res.status(500).json({ error: "Failed to delete user" });
    } finally {
      conn?.end();
    }
  });

  // Toggle a user between SSO and local (password) - admin only. Reverting an SSO
  // account to 'password' re-enables password login and makes it editable again.
  app.put("/api/users/:id/auth-source", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const { authSource } = req.body || {};
    if (!["password", "sso"].includes(authSource))
      return res.status(400).json({ error: "authSource must be 'password' or 'sso'" });
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      await conn.execute("UPDATE users SET auth_source = ? WHERE id = ?", [authSource, req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("PUT /api/users/:id/auth-source error:", err.message);
      res.status(500).json({ error: "Failed to update account type" });
    } finally {
      conn?.end();
    }
  });

  // ════════════════════════════════════════════════════════════════════════
  // DATA ROUTES  (require auth - data filtered by permissions)
  // ════════════════════════════════════════════════════════════════════════

  // Dashboard data - filtered per logged-in user's permissions
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
      res.status(500).json({ error: "Sync failed - check server logs" });
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
      console.error("Balance update - DB connection failed:", err.message);
      return res.status(500).json({ error: "Database unavailable - check server logs" });
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
      res.status(500).json({ error: "Update failed - check server logs" });
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

  // GET /api/dashboard-layout - the current user's saved widget layout (null if none)
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

  // POST /api/dashboard-layout - upsert the current user's widget layout
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

  // ── Multiple named dashboards per user ────────────────────────────────────
  // Each user can keep several dashboards and mark one as their main (default).
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS user_dashboards (
            id          VARCHAR(64)  NOT NULL PRIMARY KEY,
            user_id     VARCHAR(64)  NOT NULL,
            name        VARCHAR(120) NOT NULL,
            layout_json LONGTEXT     NOT NULL,
            is_default  TINYINT      NOT NULL DEFAULT 0,
            sort_order  INT          NOT NULL DEFAULT 0,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_user (user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        // One-time migration: seed each user's existing single layout as their default dashboard.
        try {
          await conn.execute(`
            INSERT INTO user_dashboards (id, user_id, name, layout_json, is_default, sort_order)
            SELECT CONCAT('dash_', udl.user_id), udl.user_id, 'My Dashboard', udl.layout_json, 1, 0
            FROM user_dashboard_layout udl
            WHERE NOT EXISTS (SELECT 1 FROM user_dashboards ud WHERE ud.user_id = udl.user_id)
          `);
        } catch (e: any) { console.warn("[Dashboards] legacy migration skipped:", e.message); }
        console.log("[Dashboards] user_dashboards table ready");
      } catch (e: any) { console.warn("[Dashboards] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Dashboards] DB not reachable on startup (user_dashboards skipped):", e.message);
    }
  })();

  const newDashId = () => `dash_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

  // GET /api/dashboards - all of the current user's dashboards (ordered; default first).
  app.get("/api/dashboards", corsMiddleware, requireAuth, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute(
        "SELECT id, name, layout_json, is_default, sort_order FROM user_dashboards WHERE user_id = ? ORDER BY is_default DESC, sort_order ASC, created_at ASC",
        [req.session.user.id]
      )) as any;
      const dashboards = (rows as any[]).map(r => {
        let layout = [];
        try { layout = JSON.parse(r.layout_json); } catch { layout = []; }
        return { id: r.id, name: r.name, isDefault: !!r.is_default, sortOrder: r.sort_order, layout };
      });
      res.json({ dashboards });
    } catch (err: any) {
      console.error("Dashboards load error:", err.message);
      res.status(500).json({ error: "Failed to load dashboards" });
    } finally {
      await conn.end();
    }
  });

  // POST /api/dashboards - create a dashboard. First one (or makeDefault) becomes the main.
  app.post("/api/dashboards", corsMiddleware, requireAuth, async (req: any, res) => {
    const { name, layout, makeDefault } = req.body || {};
    if (typeof name !== "string" || !name.trim() || name.length > 120) {
      return res.status(400).json({ error: "Name required (max 120 chars)" });
    }
    if (!Array.isArray(layout)) return res.status(400).json({ error: "layout must be an array" });
    const conn = await mysql.createConnection(dbConfig());
    try {
      const uid = req.session.user.id;
      // A new dashboard only becomes the main view when explicitly requested - the
      // built-in "All Companies" dashboard remains the default otherwise.
      const makeMain = !!makeDefault;
      if (makeMain) await conn.execute("UPDATE user_dashboards SET is_default = 0 WHERE user_id = ?", [uid]);
      const id = newDashId();
      await conn.execute(
        "INSERT INTO user_dashboards (id, user_id, name, layout_json, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?)",
        [id, uid, name.trim(), JSON.stringify(layout), makeMain ? 1 : 0, Date.now() % 2147483647]
      );
      res.json({ id, isDefault: makeMain });
    } catch (err: any) {
      console.error("Dashboard create error:", err.message);
      res.status(500).json({ error: "Failed to create dashboard" });
    } finally {
      await conn.end();
    }
  });

  // POST /api/dashboards/clear-default - unset any custom main so the built-in
  // "All Companies" dashboard becomes the landing view again.
  app.post("/api/dashboards/clear-default", corsMiddleware, requireAuth, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute("UPDATE user_dashboards SET is_default = 0 WHERE user_id = ?", [req.session.user.id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Dashboard clear-default error:", err.message);
      res.status(500).json({ error: "Failed to update dashboards" });
    } finally {
      await conn.end();
    }
  });

  // PUT /api/dashboards/:id - rename, update layout, and/or set as main.
  app.put("/api/dashboards/:id", corsMiddleware, requireAuth, async (req: any, res) => {
    const { name, layout, makeDefault } = req.body || {};
    if (name != null && (typeof name !== "string" || !name.trim() || name.length > 120)) {
      return res.status(400).json({ error: "Name invalid (max 120 chars)" });
    }
    if (layout != null && !Array.isArray(layout)) return res.status(400).json({ error: "layout must be an array" });
    const conn = await mysql.createConnection(dbConfig());
    try {
      const uid = req.session.user.id;
      const [own] = (await conn.execute("SELECT id FROM user_dashboards WHERE id = ? AND user_id = ?", [req.params.id, uid])) as any;
      if (!own.length) return res.status(404).json({ error: "Dashboard not found" });
      if (typeof name === "string") await conn.execute("UPDATE user_dashboards SET name = ? WHERE id = ? AND user_id = ?", [name.trim(), req.params.id, uid]);
      if (Array.isArray(layout)) await conn.execute("UPDATE user_dashboards SET layout_json = ? WHERE id = ? AND user_id = ?", [JSON.stringify(layout), req.params.id, uid]);
      if (makeDefault) {
        await conn.execute("UPDATE user_dashboards SET is_default = 0 WHERE user_id = ?", [uid]);
        await conn.execute("UPDATE user_dashboards SET is_default = 1 WHERE id = ? AND user_id = ?", [req.params.id, uid]);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Dashboard update error:", err.message);
      res.status(500).json({ error: "Failed to update dashboard" });
    } finally {
      await conn.end();
    }
  });

  // DELETE /api/dashboards/:id - remove; if it was the main, promote the next one.
  app.delete("/api/dashboards/:id", corsMiddleware, requireAuth, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const uid = req.session.user.id;
      const [rows] = (await conn.execute("SELECT is_default FROM user_dashboards WHERE id = ? AND user_id = ?", [req.params.id, uid])) as any;
      if (!rows.length) return res.status(404).json({ error: "Dashboard not found" });
      const wasDefault = !!rows[0].is_default;
      await conn.execute("DELETE FROM user_dashboards WHERE id = ? AND user_id = ?", [req.params.id, uid]);
      if (wasDefault) {
        const [next] = (await conn.execute("SELECT id FROM user_dashboards WHERE user_id = ? ORDER BY sort_order ASC, created_at ASC LIMIT 1", [uid])) as any;
        if (next.length) await conn.execute("UPDATE user_dashboards SET is_default = 1 WHERE id = ?", [next[0].id]);
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Dashboard delete error:", err.message);
      res.status(500).json({ error: "Failed to delete dashboard" });
    } finally {
      await conn.end();
    }
  });

  // ── Per-user settings table (theme / personal appearance) ────────────────
  // Appearance splits in two: personal preferences (the portal theme) live here,
  // keyed per user; org-wide branding (logo, site name, company logos) stays in
  // app_settings below and remains Admin-managed.
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS user_settings (
            user_id    VARCHAR(64) NOT NULL,
            k          VARCHAR(64) NOT NULL,
            v          LONGTEXT    NOT NULL,
            updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, k)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[Settings] user_settings table ready");
      } catch (e: any) { console.warn("[Settings] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Settings] DB not reachable on startup (user_settings skipped):", e.message);
    }
  })();

  // GET /api/my-settings - the current user's personal preferences (theme + notifications).
  app.get("/api/my-settings", corsMiddleware, requireAuth, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute(
        "SELECT k, v FROM user_settings WHERE user_id = ?",
        [req.session.user.id]
      )) as any;
      const map: Record<string, string> = {};
      for (const r of rows as any[]) map[r.k] = r.v;
      res.json({
        theme: ["dark", "gray", "light"].includes(map.theme) ? map.theme : null,
        notifyPush: map.notify_push === "1",
        notifyEmail: map.notify_email === "1",
      });
    } catch (err: any) {
      console.error("My-settings load error:", err.message);
      res.json({ theme: null, notifyPush: false, notifyEmail: false });
    } finally {
      await conn.end();
    }
  });

  // POST /api/my-settings - upsert the current user's preferences (any authenticated user).
  app.post("/api/my-settings", corsMiddleware, requireAuth, async (req: any, res) => {
    const { theme, notifyPush, notifyEmail } = req.body || {};
    if (theme != null && !["dark", "gray", "light"].includes(theme)) {
      return res.status(400).json({ error: "Theme invalid" });
    }
    const conn = await mysql.createConnection(dbConfig());
    try {
      const uid = req.session.user.id;
      const upsert = (k: string, v: string) => conn.execute(
        `INSERT INTO user_settings (user_id, k, v) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE v = VALUES(v)`,
        [uid, k, v]
      );
      if (typeof theme === "string") await upsert("theme", theme);
      if (typeof notifyPush === "boolean") await upsert("notify_push", notifyPush ? "1" : "0");
      if (typeof notifyEmail === "boolean") await upsert("notify_email", notifyEmail ? "1" : "0");
      res.json({ ok: true });
    } catch (err: any) {
      console.error("My-settings save error:", err.message);
      res.status(500).json({ error: "Failed to save settings" });
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

  // GET /api/branding - org logo + site name (auth required, any role)
  // GET /api/branding/public - logo + site name only, no auth (used by the login screen).
  // Deliberately excludes company logos and any other data.
  app.get("/api/branding/public", corsMiddleware, async (_req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute(
        "SELECT k, v FROM app_settings WHERE k IN ('brand_site_name', 'brand_logo', 'brand_logo_bg')"
      )) as any;
      const map: Record<string, string> = {};
      for (const r of rows as any[]) map[r.k] = r.v;
      res.json({
        siteName: map.brand_site_name || "Liquidity Reports",
        logo: map.brand_logo || null,
        logoBg: map.brand_logo_bg || "light",
      });
    } catch {
      res.json({ siteName: "Liquidity Reports", logo: null, logoBg: "light" });
    } finally {
      await conn.end();
    }
  });

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

  // POST /api/branding - update logo and/or site name (Admin only)
  app.post("/api/branding", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const { siteName, logo } = req.body || {};
    // Logo is stored as a data URL; cap size to keep the payload sane (~1MB base64).
    if (logo != null && (typeof logo !== "string" || logo.length > 1_400_000)) {
      return res.status(400).json({ error: "Logo too large or invalid (max ~1MB image)" });
    }
    if (siteName != null && (typeof siteName !== "string" || siteName.length > 120)) {
      return res.status(400).json({ error: "Site name invalid" });
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
      // Theme is a per-user preference now (see /api/my-settings); not stored here.
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
        // user ↔ roles mapping (a user can hold several roles)
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS user_roles (
            user_id VARCHAR(64) NOT NULL,
            role_id VARCHAR(64) NOT NULL,
            PRIMARY KEY (user_id, role_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        // Track how a role was assigned so SSO can re-sync group-derived roles
        // ('group') on each login without wiping admin-assigned ('manual') ones.
        try { await conn.execute("ALTER TABLE user_roles ADD COLUMN source VARCHAR(16) NOT NULL DEFAULT 'manual'"); }
        catch { /* column already exists */ }
        // One-time migration: map each existing user to their current enum role and
        // give the built-in roles sensible default page access (preserves behaviour).
        const [ur] = (await conn.execute("SELECT COUNT(*) AS n FROM user_roles")) as any;
        if (!ur[0].n) {
          await conn.execute("UPDATE app_roles SET pages_json = ? WHERE id = 'manager' AND (pages_json = '[]' OR pages_json IS NULL)", [JSON.stringify(['dashboard', 'companies', 'psp', 'alerts', 'upload'])]);
          await conn.execute("UPDATE app_roles SET pages_json = ? WHERE id = 'viewer' AND (pages_json = '[]' OR pages_json IS NULL)", [JSON.stringify(['dashboard', 'companies', 'psp'])]);
          try { await conn.execute("INSERT IGNORE INTO user_roles (user_id, role_id) SELECT id, LOWER(role) FROM users WHERE role IS NOT NULL"); } catch (e: any) { console.warn("[Roles] user_roles seed:", e.message); }
        }
        console.log("[Roles] app_roles + user_roles tables ready");
      } catch (e: any) { console.warn("[Roles] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[Roles] DB not reachable on startup (roles table skipped):", e.message);
    }
  })();

  // ── Entra SSO: profile columns + discovered groups + group→role mapping ────
  (async () => {
    try {
      const conn = await mysql.createConnection(dbConfig());
      try {
        // Profile columns on the pre-existing users table (each guarded for in-place upgrade).
        for (const col of [
          "ADD COLUMN entra_oid VARCHAR(64) NULL",
          "ADD COLUMN upn VARCHAR(255) NULL",
          "ADD COLUMN department VARCHAR(255) NULL",
          "ADD COLUMN job_title VARCHAR(255) NULL",
          "ADD COLUMN auth_source VARCHAR(16) NOT NULL DEFAULT 'password'",
        ]) {
          try { await conn.execute(`ALTER TABLE users ${col}`); } catch { /* exists */ }
        }
        // Entra groups seen at login (Object IDs); label is an admin-friendly name.
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS entra_groups (
            group_id   VARCHAR(64)  NOT NULL PRIMARY KEY,
            label      VARCHAR(255) NULL,
            first_seen DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_seen  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        // Group → role mapping (a group can grant several roles).
        await conn.execute(`
          CREATE TABLE IF NOT EXISTS entra_group_roles (
            group_id VARCHAR(64) NOT NULL,
            role_id  VARCHAR(64) NOT NULL,
            PRIMARY KEY (group_id, role_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);
        console.log("[SSO] Entra tables ready");
      } catch (e: any) { console.warn("[SSO] table init:", e.message); }
      finally { conn.end(); }
    } catch (e: any) {
      console.warn("[SSO] DB not reachable on startup (Entra tables skipped):", e.message);
    }
  })();

  // GET /api/roles - list roles with parsed company/bank access
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

  // POST /api/roles - create a custom role (Admin only)
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

  // PUT /api/roles/:id - update a role's name and/or company/bank access (Admin only)
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

  // DELETE /api/roles/:id - remove a custom role (built-in roles are protected)
  app.delete("/api/roles/:id", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [rows] = (await conn.execute("SELECT builtin FROM app_roles WHERE id = ?", [req.params.id])) as any;
      if (rows.length && rows[0].builtin) return res.status(400).json({ error: "Built-in roles cannot be deleted" });
      await conn.execute("DELETE FROM app_roles WHERE id = ?", [req.params.id]);
      // clean up any group mappings that referenced this role
      await conn.execute("DELETE FROM entra_group_roles WHERE role_id = ?", [req.params.id]);
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Role delete error:", err.message);
      res.status(500).json({ error: "Failed to delete role" });
    } finally { await conn.end(); }
  });

  // ── Entra group → role mapping (Admin only) ───────────────────────────────
  // GET /api/entra/groups - discovered Entra groups with their label + mapped roles.
  app.get("/api/entra/groups", corsMiddleware, requireAuth, requireAdmin, async (_req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      const [groups] = (await conn.execute(
        "SELECT group_id, label, first_seen, last_seen FROM entra_groups ORDER BY last_seen DESC"
      )) as any;
      const [maps] = (await conn.execute("SELECT group_id, role_id FROM entra_group_roles")) as any;
      const byGroup: Record<string, string[]> = {};
      for (const m of maps as any[]) (byGroup[m.group_id] ||= []).push(String(m.role_id));
      res.json({
        groups: (groups as any[]).map(g => ({
          groupId: g.group_id,
          label: g.label || null,
          firstSeen: g.first_seen,
          lastSeen: g.last_seen,
          roleIds: byGroup[g.group_id] || [],
        })),
        samlEnabled: SAML_ENABLED,
      });
    } catch (err: any) {
      console.error("Entra groups load error:", err.message);
      res.status(500).json({ error: "Failed to load groups" });
    } finally { await conn.end(); }
  });

  // PUT /api/entra/groups/:groupId - set an admin label and/or the mapped roles.
  // Also used to register a group by Object ID before it has been seen at login.
  app.put("/api/entra/groups/:groupId", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const groupId = String(req.params.groupId || "").trim();
    if (!groupId || groupId.length > 64) return res.status(400).json({ error: "Invalid group id" });
    const { label, roleIds } = req.body || {};
    if (label != null && (typeof label !== "string" || label.length > 255)) return res.status(400).json({ error: "Invalid label" });
    if (roleIds != null && (!Array.isArray(roleIds) || roleIds.some((r: any) => typeof r !== "string"))) {
      return res.status(400).json({ error: "roleIds must be an array of role ids" });
    }
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute(
        "INSERT INTO entra_groups (group_id, label) VALUES (?, ?) ON DUPLICATE KEY UPDATE label = VALUES(label)",
        [groupId, typeof label === "string" ? label : null]
      );
      if (Array.isArray(roleIds)) {
        await conn.execute("DELETE FROM entra_group_roles WHERE group_id = ?", [groupId]);
        for (const rid of roleIds) {
          await conn.execute("INSERT IGNORE INTO entra_group_roles (group_id, role_id) VALUES (?, ?)", [groupId, rid]);
        }
      }
      res.json({ ok: true });
    } catch (err: any) {
      console.error("Entra group save error:", err.message);
      res.status(500).json({ error: "Failed to save group mapping" });
    } finally { await conn.end(); }
  });

  // GET /api/alerts - list all alerts
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

  // POST /api/alerts - create alert
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

  // DELETE /api/alerts/:id - delete alert
  app.delete("/api/alerts/:id", corsMiddleware, requireAuth, async (req, res) => {
    const conn = await mysql.createConnection(dbConfig());
    try {
      await conn.execute("DELETE FROM wallet_alerts WHERE id=?", [req.params.id]);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ error: e.message }); }
    finally { conn.end(); }
  });

  // PUT /api/alerts/:id/toggle - enable/disable
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
            console.log(`[Alert] Fired for wallet ${alert.wallet_id} - balance ${balance} ≤ threshold ${alert.threshold} (HTTP ${r.status}). Alert auto-disabled.`);
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

  // POST /api/alerts/check - manually trigger a check (called after sync)
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

  // ── TRANSACTIONS ROUTES ───────────────────────────────────────────────────

  // GET /api/transactions
  app.get("/api/transactions", corsMiddleware, requireAuth, async (req: any, res) => {
    const {
      company_id, wallet_id, currency,
      date_from, date_to,
      type: txType,
      search,
      source = 'ifx',
      page = '1',
      limit: limitStr = '20',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limitStr, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const today         = new Date().toISOString().slice(0, 10);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const dateFrom      = date_from || thirtyDaysAgo;
    const dateTo        = date_to   || today;

    const conditions: string[] = ['wt.transaction_date BETWEEN ? AND ?'];
    const baseParams: any[]    = [dateFrom, dateTo];

    if (source)                          { conditions.push('wt.source = ?');                              baseParams.push(source); }
    if (company_id)                      { conditions.push('wt.company_id = ?');                          baseParams.push(company_id); }
    if (wallet_id)                       { conditions.push('wt.wallet_id = ?');                           baseParams.push(wallet_id); }
    if (currency && currency !== 'ALL')  { conditions.push('wt.currency = ?');                            baseParams.push(currency); }
    if (txType && txType !== 'all')      { conditions.push('wt.type = ?');                                baseParams.push(txType); }
    if (search)                          { conditions.push('(wt.other_party LIKE ? OR wt.reference LIKE ?)'); baseParams.push(`%${search}%`, `%${search}%`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      const [[summaryRow]] = await conn.execute(`
        SELECT
          COALESCE(SUM(CASE WHEN wt.type = 'credit' THEN wt.amount ELSE 0 END), 0) AS money_in,
          COALESCE(SUM(CASE WHEN wt.type = 'debit'  THEN wt.amount ELSE 0 END), 0) AS money_out,
          COUNT(*) AS tx_count
        FROM wallet_transactions wt ${where}
      `, baseParams) as [any[], any];

      const [[countRow]] = await conn.execute(
        `SELECT COUNT(*) AS total FROM wallet_transactions wt ${where}`, baseParams
      ) as [any[], any];

      const total    = Number(countRow.total)    || 0;
      const moneyIn  = Number(summaryRow.money_in)  || 0;
      const moneyOut = Number(summaryRow.money_out) || 0;

      const [rows] = await conn.execute(`
        SELECT
          wt.id, wt.wallet_id, wt.company_id, wt.bank_id,
          wt.transaction_date, wt.type, wt.amount, wt.currency,
          wt.other_party, wt.reference, wt.payment_scheme,
          wt.balance_after, wt.source, wt.synced_at,
          c.name AS company_name,
          b.name AS bank_name
        FROM wallet_transactions wt
        LEFT JOIN companies c ON c.id = wt.company_id
        LEFT JOIN banks     b ON b.id = wt.bank_id
        ${where}
        ORDER BY wt.transaction_date DESC, wt.id DESC
        LIMIT ? OFFSET ?
      `, [...baseParams, limitNum, offset]) as [any[], any];

      res.json({
        transactions: rows,
        pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        summary: { money_in: moneyIn, money_out: moneyOut, net_change: moneyIn - moneyOut, tx_count: total },
      });
    } catch (err: any) {
      console.error(`[transactions] query error:`, err.message);
      res.status(500).json({ error: "Query failed", detail: err.message });
    } finally {
      if (conn) conn.end();
    }
  });

  // ── API LOGGING (for API Monitor screen) ─────────────────────────────────────

  async function logApiCall(entry: {
    direction: string; source: string; endpoint: string; method: string;
    status_code: number; request_body: string | null; response_body: string | null;
    duration_ms: number; ip_address: string;
  }): Promise<void> {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      await conn.execute(
        `INSERT INTO api_call_logs
           (direction, source, endpoint, method, status_code, request_body, response_body, duration_ms, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [entry.direction, entry.source, entry.endpoint, entry.method,
         entry.status_code, entry.request_body, entry.response_body,
         entry.duration_ms, entry.ip_address]
      );
    } catch {
      // Silently ignore — table may not exist yet; logging must never break the main endpoint
    } finally {
      if (conn) conn.end();
    }
  }

  // GET /api/admin/api-logs
  app.get("/api/admin/api-logs", corsMiddleware, requireAuth, requireAdmin, async (req: any, res) => {
    const {
      direction, source, status,
      date_from, date_to,
      page = '1',
      limit: limitStr = '50',
    } = req.query as Record<string, string>;

    const pageNum  = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(200, Math.max(1, parseInt(limitStr, 10)));
    const offset   = (pageNum - 1) * limitNum;

    const today     = new Date().toISOString().slice(0, 10);
    const dateFrom  = date_from || today;
    const dateTo    = date_to   || today;

    const conditions: string[] = ['DATE(created_at) BETWEEN ? AND ?'];
    const params: any[]        = [dateFrom, dateTo];

    if (direction && direction !== 'all') { conditions.push('direction = ?');      params.push(direction); }
    if (source     && source     !== 'all') { conditions.push('source = ?');         params.push(source); }
    if (status === '2xx') { conditions.push('status_code BETWEEN 200 AND 299'); }
    if (status === 'err') { conditions.push('status_code >= 400'); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());

      const [[summaryRow]] = await conn.execute(`
        SELECT
          COUNT(*)                                                    AS total_calls,
          COALESCE(AVG(duration_ms), 0)                              AS avg_duration,
          SUM(CASE WHEN status_code BETWEEN 200 AND 299 THEN 1 ELSE 0 END) AS success_count,
          SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)        AS error_count
        FROM api_call_logs ${where}
      `, params) as [any[], any];

      const [[countRow]] = await conn.execute(
        `SELECT COUNT(*) AS total FROM api_call_logs ${where}`, params
      ) as [any[], any];

      const [rows] = await conn.execute(`
        SELECT id, direction, source, endpoint, method, status_code,
               request_body, response_body, duration_ms, ip_address, created_at
        FROM api_call_logs ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `, [...params, limitNum, offset]) as [any[], any];

      const total = Number(countRow.total) || 0;
      res.json({
        logs: rows,
        pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) },
        summary: {
          total_calls:   Number(summaryRow.total_calls)   || 0,
          avg_duration:  Math.round(Number(summaryRow.avg_duration) || 0),
          success_count: Number(summaryRow.success_count) || 0,
          error_count:   Number(summaryRow.error_count)   || 0,
        },
      });
    } catch (err: any) {
      res.status(500).json({ error: "Query failed", detail: err.message });
    } finally {
      if (conn) conn.end();
    }
  });

  // ── INTERNAL ROUTES  (API-key auth, no user session required) ───────────────

  // POST /api/internal/sync-transactions
  // Called by Zapier every hour with a batch of bank transactions from IFX/ibanq.
  // Upserts: re-sent transactions update mutable fields (amount, reference, etc.).
  app.post("/api/internal/sync-transactions", async (req: any, res) => {
    const expectedKey = process.env.INTERNAL_SYNC_API_KEY;
    if (!expectedKey || req.headers["x-api-key"] !== expectedKey) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { transactions } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: "transactions array is required and must be non-empty" });
    }

    const placeholders = transactions.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(", ");
    const values: any[] = [];
    for (const t of transactions) {
      values.push(
        t.id,
        t.wallet_id,
        t.company_id,
        t.bank_id,
        t.transaction_date,
        t.type,
        t.amount,
        t.currency,
        t.other_party   ?? null,
        t.reference     ?? null,
        t.payment_scheme ?? null,
        t.balance_after ?? null,
        t.source        ?? "ifx",
        t.synced_at,
      );
    }

    const startMs = Date.now();
    const ip = (req.headers['x-forwarded-for'] as string || req.socket?.remoteAddress || '').split(',')[0].trim();
    let statusCode = 200;
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
      await conn.execute(
        `INSERT INTO wallet_transactions
          (id, wallet_id, company_id, bank_id, transaction_date, type, amount,
           currency, other_party, reference, payment_scheme, balance_after, source, synced_at)
         VALUES ${placeholders} AS new_row
         ON DUPLICATE KEY UPDATE
           amount         = new_row.amount,
           balance_after  = new_row.balance_after,
           reference      = new_row.reference,
           other_party    = new_row.other_party,
           payment_scheme = new_row.payment_scheme,
           synced_at      = new_row.synced_at`,
        values
      );
      console.log(`[${new Date().toISOString()}] [sync-transactions] upserted batch of ${transactions.length}`);
      const responseBody = { inserted: transactions.length, skipped: 0 };
      res.json(responseBody);
      logApiCall({
        direction: 'inbound', source: 'zapier',
        endpoint: '/api/internal/sync-transactions', method: 'POST',
        status_code: 200,
        request_body: JSON.stringify({ batch_size: transactions.length }),
        response_body: JSON.stringify(responseBody),
        duration_ms: Date.now() - startMs, ip_address: ip,
      });
    } catch (err: any) {
      statusCode = 500;
      console.error(`[${new Date().toISOString()}] [sync-transactions] DB error:`, err.message);
      res.status(500).json({ error: "DB insert failed", detail: err.message });
      logApiCall({
        direction: 'inbound', source: 'zapier',
        endpoint: '/api/internal/sync-transactions', method: 'POST',
        status_code: 500,
        request_body: JSON.stringify({ batch_size: transactions.length }),
        response_body: JSON.stringify({ error: err.message }),
        duration_ms: Date.now() - startMs, ip_address: ip,
      });
    } finally {
      if (conn) conn.end();
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
    console.warn("[Session] Could not create sessions table - falling back to in-memory sessions:", e.message)
  );

  // Kick off DB data load (non-blocking - server starts immediately)
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
