-- Migration: add geo + category classification columns to wallet_transactions
-- Run once on your Azure MySQL database.

ALTER TABLE wallet_transactions
  ADD COLUMN geo      VARCHAR(20)  NULL AFTER source,
  ADD COLUMN category VARCHAR(100) NULL AFTER geo;

-- Seed fake classifications on the 2026-07-08 test batch so the UI has data to show.
UPDATE wallet_transactions SET geo = 'GCC',   category = 'Settlement'         WHERE id = '90048dfb-4d75-5167-a7a2-088a7fd920f7';
UPDATE wallet_transactions SET geo = 'GCC',   category = 'Fee'                WHERE id = '94486c00-138b-58f5-a0d7-43638c0f15a1';
UPDATE wallet_transactions SET geo = 'GCC',   category = 'CC Upload'          WHERE id = '6fe8259b-2a8b-5ae8-9454-e226b622807c';
UPDATE wallet_transactions SET geo = 'LATAM', category = 'BTW ACC\'s'         WHERE id = 'fc50cb88-c363-5aa4-9a1a-9e8059db97bb';
UPDATE wallet_transactions SET geo = 'LATAM', category = 'BTW CMP\'s'         WHERE id = '81b57b93-3a9c-5c63-bb62-f9172c51a34f';
UPDATE wallet_transactions SET geo = 'Mixed', category = 'Management'         WHERE id = '646f7bf5-af8d-5b3a-b0f5-475aef836968';
UPDATE wallet_transactions SET geo = 'Mixed', category = 'Management - C'     WHERE id = '16c2b724-2c20-5d69-920a-e55676372679';
UPDATE wallet_transactions SET geo = 'GCC',   category = 'Client Deposit'     WHERE id = '762cb852-5052-5fb8-b757-b9d8a2adc4fc';
UPDATE wallet_transactions SET geo = 'GCC',   category = 'Wire Settlement'    WHERE id = '169dd5c0-efbf-5805-835a-4532127afd7c';
-- Leave 4 rows unclassified so the "+ Add" state is visible in the UI.
