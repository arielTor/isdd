# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install          # Install dependencies
npm run dev          # Start dev server (Express + Vite HMR) on port 3000
npm run build        # Build production bundle
npm run preview      # Preview production build
npm run lint         # TypeScript type-check (no emit)
npm run clean        # Remove dist/
```

No test suite is configured.

## Environment Setup

Create `.env.local` before running:
```
GEMINI_API_KEY=...          # Required — Gemini AI integration
GOOGLE_ACCESS_TOKEN=...     # Optional — Bearer token for /api/update-data auth
APP_URL=...                 # Optional — hosting URL for self-referential links
```

## Architecture

### Server (`server.ts`)
Express server that also serves the Vite dev server (HMR integrated). Key endpoints:
- `GET /api/liquidity` — returns cached company/bank/wallet data
- `POST /api/update-data` — ingests payload from Zapier, requires Bearer token auth
- `POST /api/sync` — triggers a Zapier webhook or accepts a direct data update

Data persistence: in-memory `latestData` array backed by `latest_liquidity_data.json` on disk (auto-loaded at startup). A normalization layer in `server.ts` handles multiple field-naming conventions from different Zapier payload formats.

Logs are written to: `access.log`, `raw_requests.log`, `sync_history.log`, `debug_payload_log.json`.

### Frontend (`src/App.tsx`)
Single large React 19 component (~96KB) containing all UI logic — no component split currently. Uses:
- Vite + Tailwind CSS 4 (`@tailwindcss/vite`)
- Motion for animations, Lucide for icons
- `@google/genai` SDK for AI features

Pages: Dashboard, Users, Alerts — rendered via sidebar nav with company filtering.

### Data Model
```
Company
  └── Banks[]
        └── Bank Accounts[]
              └── Wallets[]  (id, currency, balance, value_usd, updated_at)
```
Defined in `src/types.ts`. Exchange rates (fiat → USD, crypto → USDT) are hardcoded in `App.tsx`.

### Data flow
Zapier/external system → `POST /api/update-data` → normalization → `latest_liquidity_data.json` + memory cache → frontend polls `GET /api/liquidity` → React state update.

### Other reference files
- `SCHEMA.md` — expected payload structure for `/api/update-data`
- `DOCUMENTATION.md` — ERD, SQL DDL, Zapier integration details, alert logic
- `AGENTS.md` — rules for the financial dashboard AI assistant
