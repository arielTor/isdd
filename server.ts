import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import cors from "cors";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  // ULTRA-EARLY LOGGER (No middleware, no parsing)
  app.use((req, res, next) => {
    const logEntry = `${new Date().toISOString()} [RAW] ${req.method} ${req.url} | Content-Type: ${req.headers['content-type']}\n`;
    fs.appendFileSync('raw_requests.log', logEntry);
    next();
  });

  app.use(cors());
  
  // 2. Add error handling for JSON parsing
  app.use((req, res, next) => {
    express.json({ limit: '10mb' })(req, res, (err) => {
      if (err) {
        fs.appendFileSync('access.log', `${new Date().toISOString()} ERROR: JSON Parsing failed: ${err.message}\n`);
        return res.status(400).json({ error: 'Malformed JSON payload' });
      }
      next();
    });
  });

  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 1. Access Logger (Now after body parsers)
  app.use((req, res, next) => {
    try {
      const log = `${new Date().toISOString()} ${req.method} ${req.url} (Body Keys: ${req.body ? Object.keys(req.body).join(',') : 'none'})\n`;
      fs.appendFileSync('access.log', log);
      console.log(log.trim());
    } catch (e) {}
    next();
  });

  // In-memory store for the latest synced data, initialized from file if available
  const DATA_FILE = path.join(process.cwd(), 'latest_liquidity_data.json');
  let latestData: any[] = [];
  let lastUpdateTime = Date.now();
  let lastSyncTriggerTime = 0;
  
  if (fs.existsSync(DATA_FILE)) {
    try {
      latestData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
      const stats = fs.statSync(DATA_FILE);
      lastUpdateTime = stats.mtimeMs;
      console.log(`Loaded ${latestData.length} companies from disk. Last modified: ${new Date(lastUpdateTime).toISOString()}`);
    } catch (e) {
      console.error('Failed to load persisted data:', e);
    }
  }

  // Helper to extract company array from any object/string
  const extractCompanies = (input: any): any[] | null => {
    if (!input) return null;
    
    // If it's a string, try to parse it
    if (typeof input === 'string') {
      try {
        const parsed = JSON.parse(input);
        return extractCompanies(parsed);
      } catch (e) {
        return null;
      }
    }

    // If it's an array, it's the target
    if (Array.isArray(input)) {
      // Normalize the array items (companies)
      return input.map((company: any) => {
        if (company && typeof company === 'object' && company.banks) {
          // Keep existing normalization logic
          company.banks = Array.isArray(company.banks) ? company.banks.map((bank: any) => {
            if (bank.isVerified !== undefined) bank.is_verified = bank.isVerified;
            if (bank.last_modified_date !== undefined) bank.last_modified = bank.last_modified_date;
            
            const rawAccounts = bank.bank_accounts || bank.accounts || [];
            bank.bank_accounts = rawAccounts.map((acc: any) => {
              if (acc.accountNumber !== undefined) acc.account_number = acc.accountNumber;
              
              // Handle wallets being a string or array
              let rawWallets = acc.wallets || [];
              if (typeof rawWallets === 'string') {
                try { rawWallets = JSON.parse(rawWallets); } catch(e) { rawWallets = []; }
              }
              if (!Array.isArray(rawWallets)) rawWallets = [];

              acc.wallets = rawWallets.map((wallet: any) => {
                if (typeof wallet.balance === 'string') {
                  const cleaned = wallet.balance.replace(/,/g, '');
                  const parsed = parseFloat(cleaned);
                  wallet.balance = isNaN(parsed) ? 0 : parsed;
                } else if (wallet.balance === undefined || wallet.balance === null) {
                  wallet.balance = 0;
                } else {
                  wallet.balance = Number(wallet.balance);
                }
                
                // Normalization for value_usd
                if (wallet.value_usd !== undefined) wallet.value_usd = Number(wallet.value_usd);
                if (wallet.usd_value !== undefined) wallet.value_usd = Number(wallet.usd_value);
                if (wallet.valueUsd !== undefined) wallet.value_usd = Number(wallet.valueUsd);
                if (wallet.usdValue !== undefined) wallet.value_usd = Number(wallet.usdValue);
                
                if (wallet.value_usd !== undefined) {
                  const now = new Date().toISOString();
                  console.log(`[${now}]   Wallet ${wallet.id}: Balance=${wallet.balance}, Val=${wallet.value_usd}`);
                }
                
                if (wallet.updatedAt !== undefined) wallet.updated_at = wallet.updatedAt;
                return wallet;
              });
              return acc;
            });
            bank.accounts = bank.bank_accounts;
            return bank;
          }) : [];
        }
        return company;
      });
    }

    // If it's an object, search inside
    if (typeof input === 'object') {
      // Check known wrapping keys
      if (input.dashboard_data) return extractCompanies(input.dashboard_data);
      if (input.payload) return extractCompanies(input.payload);
      if (input.records) return extractCompanies(input.records);
      if (input.data) return extractCompanies(input.data);
      
      // If it looks like a company itself
      if (input.id && (input.banks || input.bank_accounts)) {
        return extractCompanies([input]);
      }
      
      // If it's an object with numeric keys (sometimes arrays get turned into objects)
      const keys = Object.keys(input);
      if (keys.length > 0 && keys.every(k => !isNaN(Number(k)))) {
        return extractCompanies(Object.values(input));
      }
    }

    return null;
  };

  // API Route: This is what the dashboard will call to get the latest data
  app.get("/api/liquidity", (req, res) => {
    res.json({
      data: latestData,
      lastUpdateTime,
      lastSyncTriggerTime
    });
  });

  // API Route: This is what Zapier calls at the end of the Zap
  app.get("/api/update-data", (req, res) => {
    res.json({ message: "Ready for POST requests from Zapier", method: "GET" });
  });

  app.post("/api/update-data", (req, res) => {
    const timestamp = new Date().toISOString();
    
    // Auth Check: Bearer Token
    const authHeader = req.headers['authorization'];
    const expectedToken = process.env.GOOGLE_ACCESS_TOKEN;
    
    if (expectedToken) {
      if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
        console.warn(`[${timestamp}] ⚠️ UNAUTHORIZED: Invalid or missing bearer token.`);
        return res.status(401).json({ error: 'Unauthorized', message: 'Invalid bearer token' });
      }
      console.log(`[${timestamp}] 🔐 Authenticated via Bearer Token`);
    }

    console.log(`[${timestamp}] --- DATA UPDATE ATTEMPT ---`);
    console.log(`[${timestamp}] Content-Type:`, req.headers['content-type']);
    console.log(`[${timestamp}] Body Keys:`, Object.keys(req.body));
    
    // Log to a permanent file for inspection
    try {
      const logLine = JSON.stringify({
        timestamp,
        headers: req.headers,
        body: req.body
      }) + "\n";
      fs.appendFileSync('sync_history.log', logLine);
    } catch (e) {}

    const dataToStore = extractCompanies(req.body);
    
    if (dataToStore && Array.isArray(dataToStore)) {
      latestData = dataToStore;
      lastUpdateTime = Date.now();
      
      try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(latestData, null, 2));
        console.log(`[${timestamp}] ✅ SUCCESS: Saved ${latestData.length} companies.`);
      } catch (e) {
        console.error(`[${timestamp}] Failed to persist latest data:`, e);
      }

      res.json({ 
        status: 'Updated', 
        count: latestData.length,
        timestamp: new Date().toISOString()
      });
    } else {
      console.error(`[${timestamp}] ❌ FAILURE: Valid data not found.`);
      res.status(400).json({ 
        error: 'Invalid format', 
        keys: Object.keys(req.body)
      });
    }
  });

  app.post("/api/sync", async (req, res) => {
    const timestamp = new Date().toISOString();
    
    try {
      // Check if this is a data update via /api/sync
      // We look for common payload keys or if it's the specific 'data' field the user mentioned
      const isDataUpdate = req.body && (
        req.body.data || 
        req.body.payload || 
        req.body.dashboard_data || 
        Array.isArray(req.body)
      );

      if (isDataUpdate) {
        console.log(`[${timestamp}] Received data update via /api/sync`);
        
        // Auth check for external requests (if token is configured)
        const authHeader = req.headers['authorization'];
        const expectedToken = process.env.GOOGLE_ACCESS_TOKEN;
        if (expectedToken && authHeader === `Bearer ${expectedToken}`) {
           console.log(`[${timestamp}] 🔐 Authenticated via Bearer Token on /api/sync`);
        }

        const dataToStore = extractCompanies(req.body);
        if (dataToStore && Array.isArray(dataToStore)) {
          latestData = dataToStore;
          lastUpdateTime = Date.now();
          
          try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(latestData, null, 2));
            console.log(`[${timestamp}] ✅ SUCCESS: Saved ${latestData.length} companies via /api/sync.`);
            return res.json({ 
              status: 'Updated', 
              count: latestData.length,
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            console.error(`[${timestamp}] Failed to persist latest data via /api/sync:`, e);
          }
        }
      }

      // If not handled as a data update, or if data extraction failed, proceed with trigger logic
      lastSyncTriggerTime = Date.now();
      
      // Server-side trigger to Zapier (avoids CORS issues)
      const zapierResponse = await fetch('https://hooks.zapier.com/hooks/catch/27155967/uv3omz3/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestedAt: new Date().toISOString(),
          source: 'SmartTool Backend'
        })
      });
      
      res.json({ status: 'Triggered', details: zapierResponse.statusText });
    } catch (error) {
      console.error(`[${timestamp}] Sync/Update Error:`, error);
      res.status(500).json({ error: 'System processing error' });
    }
  });

  // API Route: Send Alert changes to Zapier
  app.post("/api/alerts/trigger", async (req, res) => {
    try {
      const alert = req.body;
      
      // Map to the format requested by user (snake_case as per screenshot)
      const payload = {
        id: alert.id,
        company_id: alert.companyId,
        bank_id: alert.bankId,
        wallet_id: alert.walletId,
        threshold: alert.threshold,
        email: alert.email,
        is_enabled: alert.isEnabled ? 1 : 0 // Using 1/0 or true/false as needed for the DB, usually 1/0 for boolean in many SQL setups if that's what represents is_enabled in the screenshot
      };

      console.log('Pushing Alert to Zapier:', JSON.stringify(payload));

      const zapierResponse = await fetch('https://hooks.zapier.com/hooks/catch/27155967/uvwemop/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      res.json({ status: 'Triggered', details: zapierResponse.statusText });
    } catch (error) {
      console.error('Alert Sync Error:', error);
      res.status(500).json({ error: 'Failed to trigger Alert Sync' });
    }
  });

  // API Route: Send User changes to Zapier
  app.post("/api/users/trigger", async (req, res) => {
    try {
      const user = req.body;
      console.log('Received User Sync Request:', JSON.stringify(user));
      
      // Flatten permissions for the payload
      const permissions = user.permissions || [];
      const flattenedPermissions = permissions.flatMap((p: any) => {
        // If bankIds is empty, it means "All Banks" - we can send it as '*' or expand it if we had the context
        // But for now, we'll send it as specified in the UI structure
        if (p.bankIds.length === 0) {
          return [{
            user_id: user.id,
            company_id: p.companyId,
            bank_id: 'ALL'
          }];
        }
        return p.bankIds.map((bankId: string) => ({
          user_id: user.id,
          company_id: p.companyId,
          bank_id: bankId
        }));
      });

      const payload = {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status
        },
        permissions: flattenedPermissions
      };

      console.log('Pushing User to Zapier:', JSON.stringify(payload));

      const zapierResponse = await fetch('https://hooks.zapier.com/hooks/catch/27155967/uvlz6pi/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      res.json({ status: 'Triggered', details: zapierResponse.statusText });
    } catch (error) {
      console.error('User Sync Error:', error);
      res.status(500).json({ error: 'Failed to trigger User Sync' });
    }
  });

  // API Route: Send Threshold Alert Notification to Zapier
  app.post("/api/alerts/notify", async (req, res) => {
    try {
      const payload = req.body;
      console.log('Pushing Threshold Alert Notification to Zapier:', JSON.stringify(payload));

      const zapierResponse = await fetch('https://hooks.zapier.com/hooks/catch/27155967/uvgyoyp/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      res.json({ status: 'Triggered', details: zapierResponse.statusText });
    } catch (error) {
      console.error('Threshold Alert Notification Error:', error);
      res.status(500).json({ error: 'Failed to trigger Threshold Alert Notification' });
    }
  });

  // Proxy endpoint to push data to external ngrok URL from server-side (bypasses CORS)
  app.post("/api/external-proxy-sync", async (req, res) => {
    const timestamp = new Date().toISOString();
    try {
      console.log(`[${timestamp}] Routing sync request to external service via server proxy...`);
      
      const externalUrl = 'https://smarttool-dash-795899735826.europe-west2.run.app/api/update-data';
      
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (process.env.GOOGLE_ACCESS_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GOOGLE_ACCESS_TOKEN}`;
      }

      const response = await fetch(externalUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        throw new Error(`External service responded with ${response.status}: ${response.statusText}`);
      }

      // ALSO update local state if valid data is present in this request
      const dataToStore = extractCompanies(req.body);
      if (dataToStore && Array.isArray(dataToStore)) {
        latestData = dataToStore;
        lastUpdateTime = Date.now();
        try {
          fs.writeFileSync(DATA_FILE, JSON.stringify(latestData, null, 2));
          console.log(`[${timestamp}] ✅ Local data updated via proxy endpoint.`);
        } catch (e) {
          console.error('Failed to persist local data in proxy:', e);
        }
      }

      console.log(`[${timestamp}] ✅ Successfully pushed to external service.`);
      res.json({ 
        status: 'Success', 
        detail: 'Data pushed via server proxy and updated locally',
        count: dataToStore ? dataToStore.length : 0 
      });
    } catch (error) {
      console.error(`[${timestamp}] Proxy Sync Error:`, error);
      res.status(500).json({ error: 'Failed to push data to external service via server proxy', message: error instanceof Error ? error.message : String(error) });
    }
  });

  // 404 Handler for APIs (BEFORE Vite/Statics catch-all)
  app.use('/api/*', (req, res) => {
    const msg = `404 Not Found: ${req.method} ${req.originalUrl}`;
    console.warn(msg);
    fs.appendFileSync('access.log', `${new Date().toISOString()} ${msg}\n`);
    res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
