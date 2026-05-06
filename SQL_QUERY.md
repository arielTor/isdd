# Dashboard Data SQL Query

Use this query to fetch all companies, banks, accounts, and wallets from your database in the format the dashboard expects.

### MySQL / MariaDB Query

```sql
SELECT 
    JSON_ARRAYAGG(
        JSON_OBJECT(
            'id', c.id,
            'name', c.name,
            'industry', c.industry,
            'status', c.status,
            'banks', (
                SELECT JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', b.id,
                        'name', b.name,
                        'country', b.country,
                        'isVerified', b.is_verified,
                        'last_modified_date', NOW(),
                        'accounts', COALESCE((
                            SELECT JSON_ARRAYAGG(
                                JSON_OBJECT(
                                    'id', acc.id,
                                    'accountNumber', acc.account_number,
                                    'wallets', COALESCE((
                                        SELECT JSON_ARRAYAGG(
                                            JSON_OBJECT(
                                                'id', w.id,
                                                'balance', w.balance,
                                                'currency', w.currency
                                            )
                                        )
                                        FROM wallets w
                                        WHERE w.account_id = acc.id
                                    ), JSON_ARRAY())
                                )
                            )
                            FROM bank_accounts acc
                            WHERE acc.bank_id = b.id
                        ), JSON_ARRAY())
                    )
                )
                FROM banks b
                WHERE b.company_id = c.id
            ), JSON_ARRAY())
        )
    ) as dashboard_data
FROM companies c;
```

### Integration Steps
1. **Run the query** in your MySQL environment.
2. **Retrieve the JSON result** from the `dashboard_data` column.
3. **POST the JSON** to your development endpoint:
   `https://ais-dev-t3lezpihmtgozwihcf22mw-241113500221.europe-west1.run.app/api/update-data`

The dashboard will automatically display the new data upon the next refresh or manual sync trigger.
