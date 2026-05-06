# Dashboard Data JSON Schema

The `/api/update-data` endpoint expects an array of companies with nested banks, accounts, and wallets.
Alternatively, it can receive an object with a `dashboard_data` field (string or array) containing this structure.

### Structure

```json
[
  {
    "id": "company_id",
    "name": "Company Name",
    "industry": "Fintech",
    "status": "Active",
    "banks": [
      {
        "id": "bank_id",
        "name": "Bank Name",
        "country": "UK",
        "isVerified": true,
        "last_modified_date": "2026-05-02 10:30",
        "accounts": [
          {
            "id": "account_id",
            "accountNumber": "ACC-123-456",
            "wallets": [
              {
                "id": "wallet_id",
                "balance": 150000.50,
                "currency": "EUR"
              },
              {
                "id": "wallet_id_2",
                "balance": 85000.00,
                "currency": "USD"
              }
            ]
          }
        ]
      }
    ]
  }
]
```

### Key Rules
- **Wallets** must be inside **Accounts**.
- **Accounts** must be inside **Banks**.
- **Banks** must be inside **Companies**.
- The dashboard is built to iterate through this nested structure.
- Currency labels (USD, EUR, ILS, BTC, ETH, USDT) are used for icon/color branding and conversion logic.
