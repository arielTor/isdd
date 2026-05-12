import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fs from "fs";
import mysql from "mysql2/promise";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ── CORS — restrict to APP_URL and localhost ──────────────────────────────
  // Set APP_URL=https://finboard.corp-domain.com in Azure App Settings.
  const allowedOrigins = [
    process.env.APP_URL,
    'http://localhost:3000',
    'http://localhost:5173',
  ].filter(Boolean) as string[];

  app.use(cors({
    origin: (origin, callback) => {
      // Allow server-to-server requests (no origin) and allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Request logger (console only — no log files in production)
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
  });

  // ── In-memory data store ──────────────────────────────────────────────────

  const DATA_FILE = path.join(process.cwd(), 'latest_liquidity_data.json');
  let latestData: any[] = [];
  let lastUpdateTime = Date.now();

  if (fs.existsSync(DATA_FILE)) {
    try {
      latestData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      lastUpdateTime = fs.statSync(DATA_FILE).mtimeMs;
      console.log(`Loaded ${latestData.length} companies from disk.`);
    } catch (e) {
      console.error('Failed to load persisted data:', e);
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
      // rejectUnauthorized: true in production (Azure MySQL uses DigiCert CA trusted by Node.js).
      // Set DB_SSL_VERIFY=false only for local testing against non-Azure MySQL instances.
      ssl:            { rejectUnauthorized: process.env.DB_SSL_VERIFY !== 'false' },
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
      ? err.errors?.map((e: any) => e.message).join(' | ')
      : err.message;
    console.error(`[STARTUP] DB sync failed (will retry on next /api/sync): ${msg}`);
  });

  // ── API Routes ────────────────────────────────────────────────────────────

  // Dashboard data
  app.get('/api/liquidity', (_req, res) => {
    res.json({ data: latestData, lastUpdateTime });
  });

  // Manual sync trigger — re-queries DB and updates in-memory store
  app.post('/api/sync', async (_req, res) => {
    try {
      await queryDatabase();
      res.json({ status: 'Synced', count: latestData.length, timestamp: new Date().toISOString() });
    } catch (err: any) {
      console.error('DB sync error:', err.message); // full details server-side only
      res.status(500).json({ error: 'Sync failed — check server logs' });
    }
  });

  // Manual wallet balance update
  app.post('/api/update-balances', async (req, res) => {
    const updates: { wallet_id: string; wallet_balance: number; wallet_value_usd: number | null }[] = req.body?.updates;

    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    let conn: any;
    try {
      conn = await mysql.createConnection(dbConfig());
    } catch (err: any) {
      console.error('Balance update — DB connection failed:', err.message);
      return res.status(500).json({ error: 'Database unavailable — check server logs' });
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

      await queryDatabase().catch(err => console.warn('Post-update sync failed:', err.message));
      res.json({ updated, notFound });
    } catch (err: any) {
      console.error('Balance update error:', err.message); // full details server-side only
      res.status(500).json({ error: 'Update failed — check server logs' });
    } finally {
      await conn.end();
    }
  });

  // Alert rule saved → push to Zapier
  app.post('/api/alerts/trigger', async (req, res) => {
    const webhookUrl = process.env.ZAPIER_ALERTS_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: 'ZAPIER_ALERTS_WEBHOOK not configured' });
    try {
      const { id, companyId, bankId, walletId, threshold, email, isEnabled } = req.body;
      const payload = { id, company_id: companyId, bank_id: bankId, wallet_id: walletId, threshold, email, is_enabled: isEnabled ? 1 : 0 };
      const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      res.json({ status: 'Triggered', details: r.statusText });
    } catch (err: any) {
      console.error('alerts/trigger error:', err.message);
      res.status(500).json({ error: 'Failed to trigger alert sync' });
    }
  });

  // User saved → push to Zapier
  app.post('/api/users/trigger', async (req, res) => {
    const webhookUrl = process.env.ZAPIER_USERS_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: 'ZAPIER_USERS_WEBHOOK not configured' });
    try {
      const user = req.body;
      const permissions = (user.permissions || []).flatMap((p: any) =>
        p.bankIds.length === 0
          ? [{ user_id: user.id, company_id: p.companyId, bank_id: 'ALL' }]
          : p.bankIds.map((bankId: string) => ({ user_id: user.id, company_id: p.companyId, bank_id: bankId }))
      );
      const payload = { user: { id: user.id, name: user.name, email: user.email, role: user.role, status: user.status }, permissions };
      const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      res.json({ status: 'Triggered', details: r.statusText });
    } catch (err: any) {
      console.error('users/trigger error:', err.message);
      res.status(500).json({ error: 'Failed to trigger user sync' });
    }
  });

  // Threshold breach notification → push to Zapier
  app.post('/api/alerts/notify', async (req, res) => {
    const webhookUrl = process.env.ZAPIER_NOTIFY_WEBHOOK;
    if (!webhookUrl) return res.status(503).json({ error: 'ZAPIER_NOTIFY_WEBHOOK not configured' });
    try {
      const r = await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body) });
      res.json({ status: 'Triggered', details: r.statusText });
    } catch (err: any) {
      console.error('alerts/notify error:', err.message);
      res.status(500).json({ error: 'Failed to trigger alert notification' });
    }
  });

  // 404 for unknown API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
  });

  // ── Frontend serving ──────────────────────────────────────────────────────

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: 'all' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
