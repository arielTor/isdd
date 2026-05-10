import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fs from "fs";
import mysql from "mysql2/promise";
import session from "express-session";
import passport from "passport";
import { Strategy as SamlStrategy } from "@node-saml/passport-saml";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── SAML is only enforced when all three env vars are present.
// ── In local dev (no env vars) the app runs without authentication.
const SAML_ENABLED = !!(
  process.env.SAML_ENTRY_POINT &&
  process.env.SAML_CERT &&
  process.env.SAML_ISSUER
);

if (SAML_ENABLED) {
  console.log("🔐 SAML authentication: ENABLED");
} else {
  console.warn("⚠️  SAML_ENTRY_POINT / SAML_CERT / SAML_ISSUER not set — running WITHOUT authentication (dev mode)");
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ── CORS — restrict to explicit allowed origins ──────────────────────────
  // Set ALLOWED_ORIGINS=https://your-app.azurewebsites.net in Azure App Settings.
  // If not set, cross-origin requests are blocked entirely (same-origin SPA is fine).
  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim())
    : [];

  app.use(cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,  // required for session cookies
  }));

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // ── Session ───────────────────────────────────────────────────────────────
  // NOTE: Default in-memory store is fine for a single instance.
  // For multi-instance / Azure scale-out, replace with connect-redis + Azure Cache.
  app.use(session({
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",  // HTTPS only in prod
      httpOnly: true,                                  // not accessible from JS
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,                    // 8 hours
    },
  }));

  // ── Passport / SAML ───────────────────────────────────────────────────────
  app.use(passport.initialize());
  app.use(passport.session());

  if (SAML_ENABLED) {
    passport.use(new SamlStrategy(
      {
        entryPoint:  process.env.SAML_ENTRY_POINT!,   // Azure AD SAML endpoint
        issuer:      process.env.SAML_ISSUER!,         // App entity ID (URI)
        callbackUrl: process.env.SAML_CALLBACK_URL!,  // https://app/auth/callback
        cert:        process.env.SAML_CERT!,           // Azure AD signing cert (base64, no headers)
        wantAssertionsSigned: true,
        identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      },
      (profile: any, done: any) => {
        // Map Azure AD SAML claims to a simple user object
        const user = {
          id:    profile.nameID,
          email: profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"]
                 || profile.nameID,
          name:  profile["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/displayname"]
                 || profile.nameID,
        };
        return done(null, user);
      },
      // Second callback is for SLO (single logout) — not required
      (_profile: any, done: any) => done(null)
    ));
  }

  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));

  // ── Auth middleware ───────────────────────────────────────────────────────
  function requireAuth(req: any, res: any, next: any) {
    if (!SAML_ENABLED) return next();         // dev mode — skip auth
    if (req.isAuthenticated()) return next(); // session valid
    // API calls → 401 JSON; page requests → redirect to login
    if (req.path.startsWith("/api/")) {
      return res.status(401).json({ error: "Authentication required" });
    }
    res.redirect("/auth/login");
  }

  // Request logger
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // ── Auth routes ───────────────────────────────────────────────────────────
  if (SAML_ENABLED) {
    // Initiate SAML login — redirects browser to Azure AD
    app.get("/auth/login", passport.authenticate("saml"));

    // Azure AD posts the SAML assertion here after successful login
    app.post("/auth/callback",
      passport.authenticate("saml", { failureRedirect: "/auth/login" }),
      (_req, res) => res.redirect("/")
    );

    // Current user info (used by frontend to show name/email)
    app.get("/auth/me", requireAuth, (req, res) => {
      res.json({ user: req.user });
    });

    // Logout — destroy session and redirect to Azure AD logout
    app.get("/auth/logout", (req: any, res) => {
      req.logout(() => {
        req.session.destroy(() => {
          const azureLogoutUrl = process.env.SAML_LOGOUT_URL;
          res.redirect(azureLogoutUrl || "/");
        });
      });
    });
  }

  // ── In-memory data store ──────────────────────────────────────────────────

  const DATA_FILE = path.join(process.cwd(), "latest_liquidity_data.json");
  let latestData: any[] = [];
  let lastUpdateTime = Date.now();

  if (fs.existsSync(DATA_FILE)) {
    try {
      latestData = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
      lastUpdateTime = fs.statSync(DATA_FILE).mtimeMs;
      console.log(`Loaded ${latestData.length} companies from disk.`);
    } catch (e) {
      console.error("Failed to load persisted data:", e);
    }
  }

  // ── DB connection helper ──────────────────────────────────────────────────

  function dbConfig() {
    return {
      host:           process.env.DB_HOST,
      port:           Number(process.env.DB_PORT || 3306),
      user:           process.env.DB_USER,
      password:       process.env.DB_PASSWORD,
      database:       process.env.DB_NAME,
      // rejectUnauthorized: true in production — Azure MySQL uses trusted DigiCert CA.
      // Set DB_SSL_VERIFY=false only for local testing against non-Azure instances.
      ssl: { rejectUnauthorized: process.env.DB_SSL_VERIFY !== "false" },
      connectTimeout: 10000,
    };
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
      b.last_modified_date AS bank_last_modified,
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

  async function queryDatabase(): Promise<void> {
    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
    } catch (err: any) {
      throw new Error(`DB connection failed: ${err.message}`);
    }
    try {
      const [rows] = await conn.execute(SQL_QUERY) as [any[], any];

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
            id: row.bank_id, name: row.bank_name,
            country: row.bank_country, is_verified: row.bank_is_verified,
            last_modified: row.bank_last_modified, bank_accounts: new Map(),
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
        bank.bank_accounts.get(row.bank_account_id).wallets.push({
          id: row.wallet_id, currency: row.wallet_currency,
          balance: Number(row.wallet_balance ?? 0),
          value_usd: Number(row.wallet_value_usd ?? 0),
          updated_at: row.wallet_updated_at,
        });
      }

      const data = Array.from(companiesMap.values()).map((c: any) => ({
        ...c,
        banks: Array.from(c.banks.values()).map((b: any) => ({
          ...b,
          bank_accounts: Array.from(b.bank_accounts.values()),
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

  // Auto-sync on startup (non-blocking — never crashes the server)
  queryDatabase().catch(err => {
    const msg = err instanceof AggregateError
      ? err.errors?.map((e: any) => e.message).join(" | ")
      : err.message;
    console.error(`[STARTUP] DB sync failed (will retry on next /api/sync): ${msg}`);
  });

  // ── API Routes (all protected by requireAuth) ─────────────────────────────

  // Dashboard data
  app.get("/api/liquidity", requireAuth, (_req, res) => {
    res.json({ data: latestData, lastUpdateTime });
  });

  // Manual sync trigger
  app.post("/api/sync", requireAuth, async (_req, res) => {
    try {
      await queryDatabase();
      res.json({ status: "Synced", count: latestData.length, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error("DB sync error:", err.message); // full details server-side only
      res.status(500).json({ error: "Sync failed — check server logs" });
    }
  });

  // Manual wallet balance update
  app.post("/api/update-balances", requireAuth, async (req, res) => {
    const updates: { wallet_id: string; wallet_balance: number; wallet_value_usd: number | null }[] = req.body?.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: "No updates provided" });
    }

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
          ? `UPDATE wallets SET balance = ?, value_usd = ?, updated_at = NOW() WHERE id = ?`
          : `UPDATE wallets SET balance = ?, updated_at = NOW() WHERE id = ?`;
        const params = hasusd
          ? [u.wallet_balance, u.wallet_value_usd, u.wallet_id]
          : [u.wallet_balance, u.wallet_id];

        const [result] = await conn.execute(sql, params) as any[];
        if (result.affectedRows === 0) notFound.push(u.wallet_id);
        else updated++;
      }

      await queryDatabase().catch(err => console.warn("Post-update sync failed:", err.message));
      res.json({ updated, notFound });
    } catch (err: any) {
      console.error("Balance update error:", err.message); // full details server-side only
      res.status(500).json({ error: "Update failed — check server logs" });
    } finally {
      await conn.end();
    }
  });

  // Alert rule saved → push to Zapier
  app.post("/api/alerts/trigger", requireAuth, async (req, res) => {
    const webhookUrl = process.env.ZAPIER_ALERTS_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: "ZAPIER_ALERTS_WEBHOOK not configured" });
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

  // User saved → push to Zapier
  app.post("/api/users/trigger", requireAuth, async (req, res) => {
    const webhookUrl = process.env.ZAPIER_USERS_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: "ZAPIER_USERS_WEBHOOK not configured" });
    try {
      const user = req.body;
      const permissions = (user.permissions || []).flatMap((p: any) =>
        p.bankIds.length === 0
          ? [{ user_id: user.id, company_id: p.companyId, bank_id: "ALL" }]
          : p.bankIds.map((bankId: string) => ({ user_id: user.id, company_id: p.companyId, bank_id: bankId }))
      );
      const payload = { user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }, permissions };
      const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      res.json({ status: "Triggered", details: r.statusText });
    } catch (err: any) {
      console.error("users/trigger error:", err.message);
      res.status(500).json({ error: "Failed to trigger user sync" });
    }
  });

  // Threshold breach notification → push to Zapier
  app.post("/api/alerts/notify", requireAuth, async (req, res) => {
    const webhookUrl = process.env.ZAPIER_NOTIFY_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: "ZAPIER_NOTIFY_WEBHOOK not configured" });
    try {
      const r = await fetch(webhookUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(req.body) });
      res.json({ status: "Triggered", details: r.statusText });
    } catch (err: any) {
      console.error("alerts/notify error:", err.message);
      res.status(500).json({ error: "Failed to trigger alert notification" });
    }
  });

  // 404 for unknown API routes
  app.use("/api/*", (req, res) => {
    res.status(404).json({ error: "Endpoint not found", path: req.originalUrl });
  });

  // ── Frontend serving (protected — unauthenticated users are redirected to SAML login) ──

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: "all" },
      appType: "spa",
    });
    // In dev, protect the SPA with auth
    app.use(requireAuth, vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    // All non-API page requests check auth before serving the SPA
    app.get("*", requireAuth, (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
