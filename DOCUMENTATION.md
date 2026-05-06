# Project Documentation: Treasury Management Hub

## 1. Project Summary
The Treasury Management Hub is a professional-grade liquidity monitoring platform designed to provide real-time visibility into funds across multiple companies and global bank accounts. It supports both traditional FIAT and Crypto assets with automated valuation normalization.

## 2. Entity Relationship Diagram (ERD)

### Companies
*   **Definition:** The top-level legal entities.
*   **Fields:** `id`, `name`, `industry`, `status`.
    *   `industry`: Used for sector grouping (Fintech, Crypto, etc.)
    *   `status`: Operational state of the company (Active, Inactive).

### Banks
*   **Definition:** Financial institutions linked to a Company.
*   **Connections:** Belongs to `Company`.
*   **Fields:** `id`, `company_id`, `name`, `country`, `is_verified`, `last_modified_date` (Sync Timestamp).

### Bank Accounts
*   **Definition:** Specific Iban/Account numbers within a Bank.
*   **Connections:** Belongs to `Bank`.
*   **Fields:** `id`, `bank_id`, `account_number`.

### Wallets
*   **Definition:** Specific currency balances within an Account.
*   **Connections:** Belongs to `BankAccount`.
*   **Fields:** `id`, `account_id`, `balance`, `currency` (USD, EUR, BTC, etc).

### Exchange Rates
*   **Definition:** Utility table for converting various currencies to USD/USDT.
*   **Fields:** `base_currency`, `target_currency`, `rate`.

---

## 3. SQL DDL (Schema)

```sql
-- Companies Table
CREATE TABLE companies (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    industry VARCHAR(50), -- e.g., 'Fintech', 'Ecommerce', 'Crypto'
    status VARCHAR(20) DEFAULT 'Active' -- e.g., 'Active', 'Inactive', 'Onboarding'
);

-- Banks Table (Updated with last_modified_date)
CREATE TABLE banks (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id),
    name VARCHAR(100) NOT NULL,
    country VARCHAR(50),
    is_verified BOOLEAN DEFAULT FALSE,
    last_modified_date TIMESTAMP
);

-- Accounts Table
CREATE TABLE bank_accounts (
    id VARCHAR(50) PRIMARY KEY,
    bank_id VARCHAR(50) REFERENCES banks(id),
    account_number VARCHAR(100) NOT NULL
);

-- Wallets Table
CREATE TABLE wallets (
    id VARCHAR(50) PRIMARY KEY,
    account_id VARCHAR(50) REFERENCES bank_accounts(id),
    balance DECIMAL(18, 8) DEFAULT 0,
    currency VARCHAR(10) NOT NULL
);

-- Exchange Rates (Requirement: feed with data for USD/USDT conversion)
CREATE TABLE exchange_rates (
    base_currency VARCHAR(10),
    target_currency VARCHAR(10),
    rate DECIMAL(18, 8) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (base_currency, target_currency)
);

-- Alerts Table
CREATE TABLE wallet_alerts (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) REFERENCES companies(id),
    bank_id VARCHAR(50) REFERENCES banks(id),
    wallet_id VARCHAR(50) REFERENCES wallets(id),
    threshold DECIMAL(18, 8) NOT NULL,
    email VARCHAR(255) NOT NULL,
    is_enabled BOOLEAN DEFAULT TRUE
);

-- Users Table
CREATE TABLE users (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(20) NOT NULL, -- e.g., 'Admin', 'Viewer', 'Manager'
    status VARCHAR(20) DEFAULT 'Active'
);

-- User Permissions Table
CREATE TABLE user_permissions (
    user_id VARCHAR(50) REFERENCES users(id),
    company_id VARCHAR(50) REFERENCES companies(id),
    bank_id VARCHAR(50), -- Can be specific bank_id or 'ALL'
    PRIMARY KEY (user_id, company_id, bank_id)
);
```

---

## 4. Automation & Integrations
### Alert Synchronization (Zapier)
*   **Trigger:** Whenever an alert is **added** or **toggled** (enabled/disabled).
*   **Endpoint:** `https://hooks.zapier.com/hooks/catch/27155967/uvwemop/`
*   **Method:** `POST`
*   **Payload Format:**
```json
{
  "id": "string",
  "company_id": "string",
  "bank_id": "string",
  "wallet_id": "string",
  "threshold": number,
  "email": "string",
  "is_enabled": 1 | 0
}
```

### User Management Synchronization (Zapier)
*   **Trigger:** Whenever a user is **added** or **updated**.
*   **Endpoint:** `https://hooks.zapier.com/hooks/catch/27155967/uvlz6pi/`
*   **Method:** `POST`
*   **Payload Format:**
```json
{
  "user": {
    "id": "string",
    "name": "string",
    "email": "string",
    "role": "Admin | Viewer | Manager",
    "status": "Active | Inactive"
  },
  "permissions": [
    {
      "user_id": "string",
      "company_id": "string",
      "bank_id": "string | ALL"
    }
  ]
}
```

### Automated Threshold Alerts (Zapier)
*   **Trigger:** Automatically fired when any wallet's balance falls **below or equal to** its configured threshold.
*   **Safety:** Fires exactly **once** per threshold breach (resets if balance goes above threshold and then back below).
*   **Endpoint:** `https://hooks.zapier.com/hooks/catch/27155967/uvgyoyp/`
*   **Method:** `POST`
*   **Payload Format:**
```json
{
  "alert_id": "string",
  "company": "string",
  "bank": "string",
  "wallet_id": "string",
  "currency": "string",
  "amount": number,
  "threshold": number,
  "email_address": "string",
  "all_bank_wallets": [
    {
      "id": "string",
      "balance": number,
      "currency": "string"
    }
  ]
}
```

## 5. Key Logic Implemented
*   **Currency Conversion:** `LCY * Rate = Valuation`.
*   **Crypto Mapping:** BTC/ETH are mapped to `USDT` target currency; Fiat (GBP/EUR/ILS) are mapped to `USD`.
*   **UI Hierarchy:** Dashboard auto-scrolls to top when switching companies via `useRef` and `useEffect`.
*   **Alert Propagation:** If `wallet_id` triggers threshold, the parent `BankCard` and `AssetRow` apply red highlight states.
