-- ─────────────────────────────────────────────────────────────────────────────
-- Fake transaction seed for the Transactions screen
-- Run AFTER add_classification_columns.sql.
-- Safe to re-run (ON DUPLICATE KEY UPDATE is a no-op when nothing changes).
--
-- Strategy: pull one valid (wallet_id, company_id, bank_id) combo that already
-- exists in your DB, then cross-join 50 fake rows onto it.  This guarantees
-- no FK violations even in a brand-new environment.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO wallet_transactions
  (id, wallet_id, company_id, bank_id,
   transaction_date, type, amount, currency,
   other_party, reference, payment_scheme, balance_after,
   source, synced_at, geo, category)

SELECT
  fake.id,
  ref.wallet_id,
  ref.company_id,
  ref.bank_id,
  fake.transaction_date,
  fake.type,
  fake.amount,
  fake.currency,
  fake.other_party,
  fake.reference,
  fake.payment_scheme,
  fake.balance_after,
  'ifx',
  NOW(),
  fake.geo,
  fake.category
FROM (
  SELECT wallet_id, company_id, bank_id
  FROM wallet_transactions
  WHERE source = 'ifx'
  LIMIT 1
) ref
CROSS JOIN (
  -- 50 fake rows: mix of currencies, types, parties, dates
  -- ~35 pre-classified (geo + category), ~15 left unclassified for testing + Add
  SELECT '11fk0001-0000-0000-0000-000000000001' AS id, DATE_SUB(CURDATE(), INTERVAL  1 DAY) AS transaction_date, 'credit' AS type,  48500.00 AS amount, 'USD' AS currency, 'Nexus Capital Ltd'         AS other_party, 'REF-NC-2026-0701'    AS reference, 'SWIFT'           AS payment_scheme,  289340.50 AS balance_after, 'GCC'   AS geo, 'Client Deposit'       AS category UNION ALL
  SELECT '11fk0002-0000-0000-0000-000000000002', DATE_SUB(CURDATE(), INTERVAL  2 DAY), 'debit',   12800.00, 'USD', 'Meta Payments Inc',             'REF-MP-2026-0702',    'WIRE',             276540.50, 'GCC',   'Fee'                  UNION ALL
  SELECT '11fk0003-0000-0000-0000-000000000003', DATE_SUB(CURDATE(), INTERVAL  3 DAY), 'credit',   9200.00, 'EUR', 'Horizon Trade BV',              'REF-HT-2026-0703',    'SEPA',             285740.50, 'LATAM', 'Settlement'           UNION ALL
  SELECT '11fk0004-0000-0000-0000-000000000004', DATE_SUB(CURDATE(), INTERVAL  4 DAY), 'debit',    3500.00, 'EUR', 'CloudHost Services',            'REF-CH-2026-0704',    'SEPA',             282240.50, 'GCC',   'TECH Platforms'       UNION ALL
  SELECT '11fk0005-0000-0000-0000-000000000005', DATE_SUB(CURDATE(), INTERVAL  5 DAY), 'credit',  75000.00, 'USD', 'Apex Growth Fund',              'REF-AG-2026-0705',    'SWIFT',            357240.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0006-0000-0000-0000-000000000006', DATE_SUB(CURDATE(), INTERVAL  7 DAY), 'debit',    8400.00, 'GBP', 'Payroll Direct UK',             'REF-PD-2026-0707',    'FASTER_PAYMENTS',  348840.50, 'GCC',   'SAL Management'       UNION ALL
  SELECT '11fk0007-0000-0000-0000-000000000007', DATE_SUB(CURDATE(), INTERVAL  8 DAY), 'credit',  22000.00, 'USD', 'Blue Ridge Ventures',           'REF-BR-2026-0708',    'SWIFT',            370840.50, 'GCC',   'Wire Settlement'      UNION ALL
  SELECT '11fk0008-0000-0000-0000-000000000008', DATE_SUB(CURDATE(), INTERVAL  9 DAY), 'debit',    5100.00, 'USD', 'Amazon Web Services',           'INV-AWS-062026',      'WIRE',             365740.50, 'GCC',   'TECH Tools'           UNION ALL
  SELECT '11fk0009-0000-0000-0000-000000000009', DATE_SUB(CURDATE(), INTERVAL 10 DAY), 'credit',  18300.00, 'ILS', 'FinEdge IL',                   'REF-FE-2026-0710',    'LOCAL_TRANSFER',   384040.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0010-0000-0000-0000-000000000010', DATE_SUB(CURDATE(), INTERVAL 11 DAY), 'debit',   14200.00, 'ILS', 'HR Systems Israel',             'SAL-JUL-2026',        'LOCAL_TRANSFER',   369840.50, 'GCC',   'Salary Israel'        UNION ALL
  SELECT '11fk0011-0000-0000-0000-000000000011', DATE_SUB(CURDATE(), INTERVAL 12 DAY), 'credit',  35000.00, 'USD', 'Orion Digital Ltd',             'REF-OD-2026-0712',    'SWIFT',            404840.50, 'LATAM', "BTW ACC's"            UNION ALL
  SELECT '11fk0012-0000-0000-0000-000000000012', DATE_SUB(CURDATE(), INTERVAL 13 DAY), 'debit',    2900.00, 'EUR', 'SaaS Tooling GmbH',             'INV-ST-0623',         'SEPA',             401940.50, 'GCC',   'MRKT Tools'           UNION ALL
  SELECT '11fk0013-0000-0000-0000-000000000013', DATE_SUB(CURDATE(), INTERVAL 14 DAY), 'credit',  61000.00, 'USD', 'Pacific Bridge Capital',        'REF-PB-2026-0714',    'SWIFT',            462940.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0014-0000-0000-0000-000000000014', DATE_SUB(CURDATE(), INTERVAL 15 DAY), 'debit',   19500.00, 'USD', 'Affiliate Partners LLC',        'PAY-AP-2026-0715',    'WIRE',             443440.50, 'GCC',   'Aff comp'             UNION ALL
  SELECT '11fk0015-0000-0000-0000-000000000015', DATE_SUB(CURDATE(), INTERVAL 16 DAY), 'debit',    4400.00, 'EUR', 'Marketing Cloud Pro',           'INV-MCP-062026',      'SEPA',             439040.50, 'Mixed', 'MRKT Spend'           UNION ALL
  SELECT '11fk0016-0000-0000-0000-000000000016', DATE_SUB(CURDATE(), INTERVAL 17 DAY), 'credit',  27500.00, 'USD', 'Redwood Investments',           'REF-RW-2026-0717',    'SWIFT',            466540.50, 'GCC',   'Management'           UNION ALL
  SELECT '11fk0017-0000-0000-0000-000000000017', DATE_SUB(CURDATE(), INTERVAL 18 DAY), 'debit',    6800.00, 'GBP', 'UK Compliance Office',          'COMP-FEE-2026',       'FASTER_PAYMENTS',  459740.50, 'GCC',   'LEG License expenses' UNION ALL
  SELECT '11fk0018-0000-0000-0000-000000000018', DATE_SUB(CURDATE(), INTERVAL 19 DAY), 'credit',  14700.00, 'USD', 'Sigma Clearing Corp',           'CLR-SC-2026-0719',    'SWIFT',            474440.50, 'LATAM', 'Settlement'           UNION ALL
  SELECT '11fk0019-0000-0000-0000-000000000019', DATE_SUB(CURDATE(), INTERVAL 20 DAY), 'debit',    3200.00, 'USD', 'Stripe Inc',                   'INV-STR-062026',      'WIRE',             471240.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0020-0000-0000-0000-000000000020', DATE_SUB(CURDATE(), INTERVAL 21 DAY), 'credit',  52000.00, 'EUR', 'Euro Clearing BV',              'ECB-TRF-2026-0721',   'SEPA',             523240.50, 'GCC',   'CC Upload'            UNION ALL
  SELECT '11fk0021-0000-0000-0000-000000000021', DATE_SUB(CURDATE(), INTERVAL 22 DAY), 'debit',   11000.00, 'EUR', 'Zendesk Europe',                'INV-ZD-062026',       'SEPA',             512240.50, 'GCC',   'TECH Platforms'       UNION ALL
  SELECT '11fk0022-0000-0000-0000-000000000022', DATE_SUB(CURDATE(), INTERVAL 23 DAY), 'credit',   8900.00, 'USD', 'DataLayer Analytics',           'REF-DL-2026-0723',    'SWIFT',            521140.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0023-0000-0000-0000-000000000023', DATE_SUB(CURDATE(), INTERVAL 24 DAY), 'debit',    7300.00, 'ILS', 'Leumi Bank Israel',             'BANK-FEES-JUN26',     'LOCAL_TRANSFER',   513840.50, 'GCC',   'ACC Service providers' UNION ALL
  SELECT '11fk0024-0000-0000-0000-000000000024', DATE_SUB(CURDATE(), INTERVAL 25 DAY), 'credit',  33000.00, 'USD', 'Summit Bridge Fund',            'SBF-WIRE-072026',     'SWIFT',            546840.50, 'LATAM', "BTW CMP's"            UNION ALL
  SELECT '11fk0025-0000-0000-0000-000000000025', DATE_SUB(CURDATE(), INTERVAL 26 DAY), 'debit',    9800.00, 'USD', 'Google Workspace',              'INV-GWS-062026',      'WIRE',             537040.50, 'GCC',   'MRKT Services Tools'  UNION ALL
  SELECT '11fk0026-0000-0000-0000-000000000026', DATE_SUB(CURDATE(), INTERVAL 27 DAY), 'credit',  44500.00, 'GBP', 'London Clearing House',         'LCH-TRF-0726',        'FASTER_PAYMENTS',  581540.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0027-0000-0000-0000-000000000027', DATE_SUB(CURDATE(), INTERVAL 28 DAY), 'debit',   16400.00, 'GBP', 'UK Payroll Services',           'SAL-UK-JUL2026',      'FASTER_PAYMENTS',  565140.50, 'GCC',   'SAL MKT'              UNION ALL
  SELECT '11fk0028-0000-0000-0000-000000000028', DATE_SUB(CURDATE(), INTERVAL 29 DAY), 'credit',  27100.00, 'USD', 'Alpha Liquidity Partners',      'ALP-IN-072026',       'SWIFT',            592240.50, 'Mixed', 'Management - C'       UNION ALL
  SELECT '11fk0029-0000-0000-0000-000000000029', DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'debit',    5500.00, 'EUR', 'VOIP Global Systems',           'INV-VOIP-062026',     'SEPA',             586740.50, 'GCC',   'VOIP'                 UNION ALL
  SELECT '11fk0030-0000-0000-0000-000000000030', DATE_SUB(CURDATE(), INTERVAL 32 DAY), 'credit',  18000.00, 'USD', 'Verde Capital Group',           'VCG-WIRE-0732',       'SWIFT',            604740.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0031-0000-0000-0000-000000000031', DATE_SUB(CURDATE(), INTERVAL 34 DAY), 'debit',    4100.00, 'USD', 'Twilio Communications',         'INV-TW-062026',       'WIRE',             600640.50, 'GCC',   'TECH Tools'           UNION ALL
  SELECT '11fk0032-0000-0000-0000-000000000032', DATE_SUB(CURDATE(), INTERVAL 36 DAY), 'credit',  67000.00, 'USD', 'Continental Bridge LLC',        'CBL-IN-072026',       'SWIFT',            667640.50, 'LATAM', 'Client Deposit'       UNION ALL
  SELECT '11fk0033-0000-0000-0000-000000000033', DATE_SUB(CURDATE(), INTERVAL 38 DAY), 'debit',   23000.00, 'USD', 'Global Affiliates Network',     'GAN-PAY-2026',        'WIRE',             644640.50, 'GCC',   'Aff comp'             UNION ALL
  SELECT '11fk0034-0000-0000-0000-000000000034', DATE_SUB(CURDATE(), INTERVAL 40 DAY), 'credit',  12500.00, 'EUR', 'Adriatic Clearing BV',          'ACB-SEPA-0740',       'SEPA',             657140.50, 'Mixed', 'Settlement'           UNION ALL
  SELECT '11fk0035-0000-0000-0000-000000000035', DATE_SUB(CURDATE(), INTERVAL 42 DAY), 'debit',    8700.00, 'EUR', 'HubSpot Europe',                'INV-HS-062026',       'SEPA',             648440.50, 'GCC',   'MRKT Services'        UNION ALL
  SELECT '11fk0036-0000-0000-0000-000000000036', DATE_SUB(CURDATE(), INTERVAL 44 DAY), 'credit',  41000.00, 'USD', 'Pinnacle Asset Mgmt',           'PAM-IN-0744',         'SWIFT',            689440.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0037-0000-0000-0000-000000000037', DATE_SUB(CURDATE(), INTERVAL 46 DAY), 'debit',   17600.00, 'ILS', 'Israel Tax Authority',          'VAT-Q2-2026',         'LOCAL_TRANSFER',   671840.50, 'GCC',   'TAX'                  UNION ALL
  SELECT '11fk0038-0000-0000-0000-000000000038', DATE_SUB(CURDATE(), INTERVAL 48 DAY), 'credit',  29900.00, 'USD', 'Torino Capital Partners',       'TCP-WIRE-0748',       'SWIFT',            701740.50, 'LATAM', "BTW ACC's"            UNION ALL
  SELECT '11fk0039-0000-0000-0000-000000000039', DATE_SUB(CURDATE(), INTERVAL 50 DAY), 'debit',    6200.00, 'GBP', 'Employment Rights Office',      'PAYE-JUN2026',        'FASTER_PAYMENTS',  695540.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0040-0000-0000-0000-000000000040', DATE_SUB(CURDATE(), INTERVAL 52 DAY), 'credit',  55000.00, 'USD', 'Eastern Wealth Fund',           'EWF-IN-0752',         'SWIFT',            750540.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0041-0000-0000-0000-000000000041', DATE_SUB(CURDATE(), INTERVAL 54 DAY), 'debit',   13300.00, 'USD', 'Klarna US',                     'INV-KL-062026',       'WIRE',             737240.50, 'GCC',   'CC'                   UNION ALL
  SELECT '11fk0042-0000-0000-0000-000000000042', DATE_SUB(CURDATE(), INTERVAL 56 DAY), 'credit',  38000.00, 'EUR', 'Frankfurt Bridge Bank',         'FBB-SEPA-0756',       'SEPA',             775240.50, 'GCC',   'Wire Settlement'      UNION ALL
  SELECT '11fk0043-0000-0000-0000-000000000043', DATE_SUB(CURDATE(), INTERVAL 58 DAY), 'debit',    4800.00, 'EUR', 'Salesforce Europe',             'INV-SF-062026',       'SEPA',             770440.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0044-0000-0000-0000-000000000044', DATE_SUB(CURDATE(), INTERVAL 60 DAY), 'credit',  21000.00, 'GBP', 'Sterling Capital Trust',        'SCT-WIRE-0760',       'FASTER_PAYMENTS',  791440.50, 'Mixed', 'Management - I'       UNION ALL
  SELECT '11fk0045-0000-0000-0000-000000000045', DATE_SUB(CURDATE(), INTERVAL 62 DAY), 'debit',    9100.00, 'GBP', 'UK Office Lease Ltd',           'LEASE-JUN2026',       'FASTER_PAYMENTS',  782340.50, 'GCC',   'Leq'                  UNION ALL
  SELECT '11fk0046-0000-0000-0000-000000000046', DATE_SUB(CURDATE(), INTERVAL 64 DAY), 'credit',  46000.00, 'USD', 'Quartz Digital Holdings',       'QDH-IN-0764',         'SWIFT',            828340.50, 'LATAM', 'Client Deposit'       UNION ALL
  SELECT '11fk0047-0000-0000-0000-000000000047', DATE_SUB(CURDATE(), INTERVAL 66 DAY), 'debit',   20500.00, 'USD', 'Uruguay IT Team',               'SALARY-UY-062026',    'WIRE',             807840.50, 'LATAM', 'Uruguay Team'         UNION ALL
  SELECT '11fk0048-0000-0000-0000-000000000048', DATE_SUB(CURDATE(), INTERVAL 68 DAY), 'credit',  31500.00, 'USD', 'Meridian Investment Corp',      'MIC-WIRE-0768',       'SWIFT',            839340.50, NULL,    NULL                   UNION ALL
  SELECT '11fk0049-0000-0000-0000-000000000049', DATE_SUB(CURDATE(), INTERVAL 70 DAY), 'debit',   15700.00, 'ILS', 'IBI Brokerage IL',              'IBI-FEE-Q2-2026',     'LOCAL_TRANSFER',   823640.50, 'GCC',   'TK IB'                UNION ALL
  SELECT '11fk0050-0000-0000-0000-000000000050', DATE_SUB(CURDATE(), INTERVAL 72 DAY), 'credit',  82000.00, 'USD', 'Diamond Bridge Capital',        'DBC-IN-0772',         'SWIFT',            905640.50, 'GCC',   'CC Upload'
) fake

ON DUPLICATE KEY UPDATE
  amount        = VALUES(amount),
  synced_at     = VALUES(synced_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- What you'll see in the UI
-- ─────────────────────────────────────────────────────────────────────────────
-- Default 30-day filter (rows 1-29):  opens immediately, no filter change needed
-- Rows 30-50 visible by: expand date range or set From = 90 days ago
-- Already classified (geo + category): rows 1-4, 6-8, 10-12, 14-18, 20-21, 23-25, 27-29, 31-35, 37-38, 41-42, 44-47, 49-50
-- Unclassified (+ Add shows):         rows 5, 9, 13, 19, 22, 26, 30, 36, 39, 40, 43, 48
-- Currencies: USD, EUR, GBP, ILS (mix for currency filter testing)
-- Types: mix of credit/debit (In/Out filter testing)
-- Schemes: SWIFT, SEPA, WIRE, FASTER_PAYMENTS, LOCAL_TRANSFER
