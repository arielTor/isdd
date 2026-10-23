import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCcw, X, Download, ArrowUp, ArrowDown, ArrowUpDown, Filter } from 'lucide-react';
import { Company } from './types';

// ── Constants ─────────────────────────────────────────────────────────────────

const GEO_OPTIONS = ['GCC', 'LATAM', 'Mixed'] as const;
type Geo = typeof GEO_OPTIONS[number];

// Populated dynamically from /api/settings/classification-rules
const CATEGORY_OPTIONS_FALLBACK = [
  'ACC Service providers','Aff comp','BOP',"BTW ACC's","BTW CMP's",'CC','CC Upload',
  'Client Deposit','Client WD','Fee','internal','LEG License expenses','Leq','Management',
  'Management - C','Management - I','MRKT Services','MRKT Services Tools','MRKT Spend',
  'MRKT Tools','Return','SAL IT','SAL Management','SAL MKT','Settlement','TECH Platforms',
  'TECH Tools','TK IB','Uruguay Team','VOIP','Wire Settlement','Salary Israel',
  "G&A (Israel)",'Management - T','TAX','__blank__',
] as const;

const GEO_COLORS: Record<Geo, string> = {
  GCC:   'bg-sky-100 text-sky-700 border border-sky-200',
  LATAM: 'bg-amber-100 text-amber-700 border border-amber-200',
  Mixed: 'bg-violet-100 text-violet-700 border border-violet-200',
};

const CURRENCIES = ['ALL', 'EUR', 'GBP', 'USD', 'ILS', 'USDT'];

const curBadge = (c: string) =>
  c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
  c === 'BTC' || c === 'ETH'  ? 'bg-orange-100 text-orange-700'   : 'bg-blue-100 text-blue-700';


// ── Types ─────────────────────────────────────────────────────────────────────

type SortKey = 'date' | 'amount' | 'amount_usd';

interface Transaction {
  id: string;
  wallet_id: string;
  company_id: string;
  company_name: string;
  bank_id: string;
  bank_name: string;
  transaction_date: string;
  type: 'credit' | 'debit';
  amount: number;
  amount_usd: number | null;
  currency: string;
  other_party: string | null;
  reference: string | null;
  payment_scheme: string | null;
  balance_after: number | null;
  source: string;
  synced_at: string;
  geo: Geo | null;
  category: string | null;
}

interface ApiResponse {
  transactions: Transaction[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: { money_in: number; money_out: number; net_change: number; tx_count: number };
}

// Single source of truth for Payer/Recipient — used by both the table and CSV export
const getDisplayPayer = (tx: Transaction, labels: Record<string, string> = {}): string => {
  const raw = tx.type === 'credit' ? (tx.other_party || '') : tx.company_name;
  return labels[raw] ?? raw;
};

const getDisplayRecipient = (tx: Transaction, labels: Record<string, string> = {}): string => {
  let raw: string;
  if (tx.type === 'credit') {
    raw = tx.source === 'xbo' && tx.reference ? tx.reference : tx.company_name;
  } else if (tx.source === 'ifx' && tx.reference) {
    // IFX debit: actual beneficiary is the first segment of reference
    // (format: "Beneficiary Name - ref number - invoice number")
    raw = tx.reference.split(' - ')[0].trim() || tx.other_party || '';
  } else {
    raw = tx.other_party || '';
  }
  return labels[raw] ?? raw;
};

// ── Mock data (used when the API is unreachable / Stage has no DB) ────────────

const d = (daysAgo: number) => {
  const dt = new Date(); dt.setDate(dt.getDate() - daysAgo);
  return dt.toISOString().slice(0, 10);
};
const W = 'mock-wallet-0001'; const C = 'mock-co-0001'; const B = 'mock-bank-0001';

const MOCK_RATES: Record<string, number> = { USD: 1, USDT: 1, EUR: 1.08, GBP: 1.27, ILS: 0.27 };

const MOCK_TRANSACTIONS: Transaction[] = [
  { id:'mk01', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(1),  type:'credit', amount:48500,   currency:'USD', other_party:'Nexus Capital Ltd',        reference:'REF-NC-2026-0701',  payment_scheme:'SWIFT',           balance_after:289340, source:'ifx', synced_at:d(1),  geo:'GCC',   category:'Client Deposit', amount_usd:null },
  { id:'mk02', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(2),  type:'debit',  amount:12800,   currency:'USD', other_party:'Meta Payments Inc',         reference:'REF-MP-2026-0702',  payment_scheme:'WIRE',            balance_after:276540, source:'ifx', synced_at:d(2),  geo:'GCC',   category:'Fee', amount_usd:null },
  { id:'mk03', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(3),  type:'credit', amount:9200,    currency:'EUR', other_party:'Horizon Trade BV',          reference:'REF-HT-2026-0703',  payment_scheme:'SEPA',            balance_after:285740, source:'ifx', synced_at:d(3),  geo:'LATAM', category:'Settlement', amount_usd:null },
  { id:'mk04', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(4),  type:'debit',  amount:3500,    currency:'EUR', other_party:'CloudHost Services',        reference:'REF-CH-2026-0704',  payment_scheme:'SEPA',            balance_after:282240, source:'ifx', synced_at:d(4),  geo:'GCC',   category:'TECH Platforms', amount_usd:null },
  { id:'mk05', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(5),  type:'credit', amount:75000,   currency:'USD', other_party:'Apex Growth Fund',          reference:'REF-AG-2026-0705',  payment_scheme:'SWIFT',           balance_after:357240, source:'ifx', synced_at:d(5),  geo:null,    category:null, amount_usd:null },
  { id:'mk06', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(7),  type:'debit',  amount:8400,    currency:'GBP', other_party:'Payroll Direct UK',         reference:'REF-PD-2026-0707',  payment_scheme:'FASTER_PAYMENTS', balance_after:348840, source:'ifx', synced_at:d(7),  geo:'GCC',   category:'SAL Management', amount_usd:null },
  { id:'mk07', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(8),  type:'credit', amount:22000,   currency:'USD', other_party:'Blue Ridge Ventures',       reference:'REF-BR-2026-0708',  payment_scheme:'SWIFT',           balance_after:370840, source:'ifx', synced_at:d(8),  geo:'GCC',   category:'Wire Settlement', amount_usd:null },
  { id:'mk08', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(9),  type:'debit',  amount:5100,    currency:'USD', other_party:'Amazon Web Services',       reference:'INV-AWS-062026',    payment_scheme:'WIRE',            balance_after:365740, source:'ifx', synced_at:d(9),  geo:'GCC',   category:'TECH Tools', amount_usd:null },
  { id:'mk09', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(10), type:'credit', amount:18300,   currency:'ILS', other_party:'FinEdge IL',               reference:'REF-FE-2026-0710',  payment_scheme:'LOCAL_TRANSFER',  balance_after:384040, source:'ifx', synced_at:d(10), geo:null,    category:null, amount_usd:null },
  { id:'mk10', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(11), type:'debit',  amount:14200,   currency:'ILS', other_party:'HR Systems Israel',         reference:'SAL-JUL-2026',      payment_scheme:'LOCAL_TRANSFER',  balance_after:369840, source:'ifx', synced_at:d(11), geo:'GCC',   category:'Salary Israel', amount_usd:null },
  { id:'mk11', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(12), type:'credit', amount:35000,   currency:'USD', other_party:'Orion Digital Ltd',         reference:'REF-OD-2026-0712',  payment_scheme:'SWIFT',           balance_after:404840, source:'ifx', synced_at:d(12), geo:'LATAM', category:"BTW ACC's", amount_usd:null },
  { id:'mk12', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(13), type:'debit',  amount:2900,    currency:'EUR', other_party:'SaaS Tooling GmbH',         reference:'INV-ST-0623',       payment_scheme:'SEPA',            balance_after:401940, source:'ifx', synced_at:d(13), geo:'GCC',   category:'MRKT Tools', amount_usd:null },
  { id:'mk13', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(14), type:'credit', amount:61000,   currency:'USD', other_party:'Pacific Bridge Capital',    reference:'REF-PB-2026-0714',  payment_scheme:'SWIFT',           balance_after:462940, source:'ifx', synced_at:d(14), geo:null,    category:null, amount_usd:null },
  { id:'mk14', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(15), type:'debit',  amount:19500,   currency:'USD', other_party:'Affiliate Partners LLC',    reference:'PAY-AP-2026-0715',  payment_scheme:'WIRE',            balance_after:443440, source:'ifx', synced_at:d(15), geo:'GCC',   category:'Aff comp', amount_usd:null },
  { id:'mk15', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(16), type:'debit',  amount:4400,    currency:'EUR', other_party:'Marketing Cloud Pro',       reference:'INV-MCP-062026',    payment_scheme:'SEPA',            balance_after:439040, source:'ifx', synced_at:d(16), geo:'Mixed', category:'MRKT Spend', amount_usd:null },
  { id:'mk16', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(17), type:'credit', amount:27500,   currency:'USD', other_party:'Redwood Investments',       reference:'REF-RW-2026-0717',  payment_scheme:'SWIFT',           balance_after:466540, source:'ifx', synced_at:d(17), geo:'GCC',   category:'Management', amount_usd:null },
  { id:'mk17', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(18), type:'debit',  amount:6800,    currency:'GBP', other_party:'UK Compliance Office',      reference:'COMP-FEE-2026',     payment_scheme:'FASTER_PAYMENTS', balance_after:459740, source:'ifx', synced_at:d(18), geo:'GCC',   category:'LEG License expenses', amount_usd:null },
  { id:'mk18', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(19), type:'credit', amount:14700,   currency:'USD', other_party:'Sigma Clearing Corp',       reference:'CLR-SC-2026-0719',  payment_scheme:'SWIFT',           balance_after:474440, source:'ifx', synced_at:d(19), geo:'LATAM', category:'Settlement', amount_usd:null },
  { id:'mk19', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(20), type:'debit',  amount:3200,    currency:'USD', other_party:'Stripe Inc',               reference:'INV-STR-062026',    payment_scheme:'WIRE',            balance_after:471240, source:'ifx', synced_at:d(20), geo:null,    category:null, amount_usd:null },
  { id:'mk20', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(21), type:'credit', amount:52000,   currency:'EUR', other_party:'Euro Clearing BV',          reference:'ECB-TRF-2026-0721', payment_scheme:'SEPA',            balance_after:523240, source:'ifx', synced_at:d(21), geo:'GCC',   category:'CC Upload', amount_usd:null },
  { id:'mk21', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(22), type:'debit',  amount:11000,   currency:'EUR', other_party:'Zendesk Europe',            reference:'INV-ZD-062026',     payment_scheme:'SEPA',            balance_after:512240, source:'ifx', synced_at:d(22), geo:'GCC',   category:'TECH Platforms', amount_usd:null },
  { id:'mk22', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(23), type:'credit', amount:8900,    currency:'USD', other_party:'DataLayer Analytics',       reference:'REF-DL-2026-0723',  payment_scheme:'SWIFT',           balance_after:521140, source:'ifx', synced_at:d(23), geo:null,    category:null, amount_usd:null },
  { id:'mk23', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(24), type:'debit',  amount:7300,    currency:'ILS', other_party:'Leumi Bank Israel',         reference:'BANK-FEES-JUN26',   payment_scheme:'LOCAL_TRANSFER',  balance_after:513840, source:'ifx', synced_at:d(24), geo:'GCC',   category:'ACC Service providers', amount_usd:null },
  { id:'mk24', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(25), type:'credit', amount:33000,   currency:'USD', other_party:'Summit Bridge Fund',        reference:'SBF-WIRE-072026',   payment_scheme:'SWIFT',           balance_after:546840, source:'ifx', synced_at:d(25), geo:'LATAM', category:"BTW CMP's", amount_usd:null },
  { id:'mk25', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(26), type:'debit',  amount:9800,    currency:'USD', other_party:'Google Workspace',          reference:'INV-GWS-062026',    payment_scheme:'WIRE',            balance_after:537040, source:'ifx', synced_at:d(26), geo:'GCC',   category:'MRKT Services Tools', amount_usd:null },
  { id:'mk26', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(27), type:'credit', amount:44500,   currency:'GBP', other_party:'London Clearing House',     reference:'LCH-TRF-0726',      payment_scheme:'FASTER_PAYMENTS', balance_after:581540, source:'ifx', synced_at:d(27), geo:null,    category:null, amount_usd:null },
  { id:'mk27', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(28), type:'debit',  amount:16400,   currency:'GBP', other_party:'UK Payroll Services',       reference:'SAL-UK-JUL2026',    payment_scheme:'FASTER_PAYMENTS', balance_after:565140, source:'ifx', synced_at:d(28), geo:'GCC',   category:'SAL MKT', amount_usd:null },
  { id:'mk28', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(29), type:'credit', amount:27100,   currency:'USD', other_party:'Alpha Liquidity Partners',  reference:'ALP-IN-072026',     payment_scheme:'SWIFT',           balance_after:592240, source:'ifx', synced_at:d(29), geo:'Mixed', category:'Management - C', amount_usd:null },
  { id:'mk29', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(30), type:'debit',  amount:5500,    currency:'EUR', other_party:'VOIP Global Systems',       reference:'INV-VOIP-062026',   payment_scheme:'SEPA',            balance_after:586740, source:'ifx', synced_at:d(30), geo:'GCC',   category:'VOIP', amount_usd:null },
  { id:'mk30', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(32), type:'credit', amount:18000,   currency:'USD', other_party:'Verde Capital Group',       reference:'VCG-WIRE-0732',     payment_scheme:'SWIFT',           balance_after:604740, source:'ifx', synced_at:d(32), geo:null,    category:null, amount_usd:null },
  { id:'mk31', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(34), type:'debit',  amount:4100,    currency:'USD', other_party:'Twilio Communications',     reference:'INV-TW-062026',     payment_scheme:'WIRE',            balance_after:600640, source:'ifx', synced_at:d(34), geo:'GCC',   category:'TECH Tools', amount_usd:null },
  { id:'mk32', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(36), type:'credit', amount:67000,   currency:'USD', other_party:'Continental Bridge LLC',    reference:'CBL-IN-072026',     payment_scheme:'SWIFT',           balance_after:667640, source:'ifx', synced_at:d(36), geo:'LATAM', category:'Client Deposit', amount_usd:null },
  { id:'mk33', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(38), type:'debit',  amount:23000,   currency:'USD', other_party:'Global Affiliates Network', reference:'GAN-PAY-2026',      payment_scheme:'WIRE',            balance_after:644640, source:'ifx', synced_at:d(38), geo:'GCC',   category:'Aff comp', amount_usd:null },
  { id:'mk34', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(40), type:'credit', amount:12500,   currency:'EUR', other_party:'Adriatic Clearing BV',      reference:'ACB-SEPA-0740',     payment_scheme:'SEPA',            balance_after:657140, source:'ifx', synced_at:d(40), geo:'Mixed', category:'Settlement', amount_usd:null },
  { id:'mk35', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(42), type:'debit',  amount:8700,    currency:'EUR', other_party:'HubSpot Europe',            reference:'INV-HS-062026',     payment_scheme:'SEPA',            balance_after:648440, source:'ifx', synced_at:d(42), geo:'GCC',   category:'MRKT Services', amount_usd:null },
  { id:'mk36', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(44), type:'credit', amount:41000,   currency:'USD', other_party:'Pinnacle Asset Mgmt',       reference:'PAM-IN-0744',       payment_scheme:'SWIFT',           balance_after:689440, source:'ifx', synced_at:d(44), geo:null,    category:null, amount_usd:null },
  { id:'mk37', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(46), type:'debit',  amount:17600,   currency:'ILS', other_party:'Israel Tax Authority',      reference:'VAT-Q2-2026',       payment_scheme:'LOCAL_TRANSFER',  balance_after:671840, source:'ifx', synced_at:d(46), geo:'GCC',   category:'TAX', amount_usd:null },
  { id:'mk38', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(48), type:'credit', amount:29900,   currency:'USD', other_party:'Torino Capital Partners',   reference:'TCP-WIRE-0748',     payment_scheme:'SWIFT',           balance_after:701740, source:'ifx', synced_at:d(48), geo:'LATAM', category:"BTW ACC's", amount_usd:null },
  { id:'mk39', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(50), type:'debit',  amount:6200,    currency:'GBP', other_party:'Employment Rights Office',  reference:'PAYE-JUN2026',      payment_scheme:'FASTER_PAYMENTS', balance_after:695540, source:'ifx', synced_at:d(50), geo:null,    category:null, amount_usd:null },
  { id:'mk40', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(52), type:'credit', amount:55000,   currency:'USD', other_party:'Eastern Wealth Fund',       reference:'EWF-IN-0752',       payment_scheme:'SWIFT',           balance_after:750540, source:'ifx', synced_at:d(52), geo:null,    category:null, amount_usd:null },
  { id:'mk41', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(54), type:'debit',  amount:13300,   currency:'USD', other_party:'Klarna US',                reference:'INV-KL-062026',     payment_scheme:'WIRE',            balance_after:737240, source:'ifx', synced_at:d(54), geo:'GCC',   category:'CC', amount_usd:null },
  { id:'mk42', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(56), type:'credit', amount:38000,   currency:'EUR', other_party:'Frankfurt Bridge Bank',     reference:'FBB-SEPA-0756',     payment_scheme:'SEPA',            balance_after:775240, source:'ifx', synced_at:d(56), geo:'GCC',   category:'Wire Settlement', amount_usd:null },
  { id:'mk43', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(58), type:'debit',  amount:4800,    currency:'EUR', other_party:'Salesforce Europe',         reference:'INV-SF-062026',     payment_scheme:'SEPA',            balance_after:770440, source:'ifx', synced_at:d(58), geo:null,    category:null, amount_usd:null },
  { id:'mk44', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(60), type:'credit', amount:21000,   currency:'GBP', other_party:'Sterling Capital Trust',    reference:'SCT-WIRE-0760',     payment_scheme:'FASTER_PAYMENTS', balance_after:791440, source:'ifx', synced_at:d(60), geo:'Mixed', category:'Management - I', amount_usd:null },
  { id:'mk45', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(62), type:'debit',  amount:9100,    currency:'GBP', other_party:'UK Office Lease Ltd',       reference:'LEASE-JUN2026',     payment_scheme:'FASTER_PAYMENTS', balance_after:782340, source:'ifx', synced_at:d(62), geo:'GCC',   category:'Leq', amount_usd:null },
  { id:'mk46', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(64), type:'credit', amount:46000,   currency:'USD', other_party:'Quartz Digital Holdings',   reference:'QDH-IN-0764',       payment_scheme:'SWIFT',           balance_after:828340, source:'ifx', synced_at:d(64), geo:'LATAM', category:'Client Deposit', amount_usd:null },
  { id:'mk47', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(66), type:'debit',  amount:20500,   currency:'USD', other_party:'Uruguay IT Team',           reference:'SALARY-UY-062026',  payment_scheme:'WIRE',            balance_after:807840, source:'ifx', synced_at:d(66), geo:'LATAM', category:'Uruguay Team', amount_usd:null },
  { id:'mk48', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(68), type:'credit', amount:31500,   currency:'USD', other_party:'Meridian Investment Corp',  reference:'MIC-WIRE-0768',     payment_scheme:'SWIFT',           balance_after:839340, source:'ifx', synced_at:d(68), geo:null,    category:null, amount_usd:null },
  { id:'mk49', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(70), type:'debit',  amount:15700,   currency:'ILS', other_party:'IBI Brokerage IL',          reference:'IBI-FEE-Q2-2026',   payment_scheme:'LOCAL_TRANSFER',  balance_after:823640, source:'ifx', synced_at:d(70), geo:'GCC',   category:'TK IB', amount_usd:null },
  { id:'mk50', wallet_id:W, company_id:C, company_name:'BluePine Ltd', bank_id:B, bank_name:'IFX Bank', transaction_date:d(72), type:'credit', amount:82000,   currency:'USD', other_party:'Diamond Bridge Capital',    reference:'DBC-IN-0772',       payment_scheme:'SWIFT',           balance_after:905640, source:'ifx', synced_at:d(72), geo:'GCC',   category:'CC Upload', amount_usd:null },
];

function buildMockResponse(
  rows: Transaction[],
  { currency, filterCategories, txType, search, payerFilter, recipientFilter, dateFrom, dateTo, page, limit, sortBy, sortDir, labels }:
  { currency: string; filterCategories: string[] | null; txType: string; search: string; payerFilter?: string; recipientFilter?: string; dateFrom: string; dateTo: string; page: number; limit: number; sortBy: SortKey; sortDir: 'asc' | 'desc'; labels?: Record<string, string> }
): ApiResponse {
  const lbl = labels ?? {};
  // 1. Filter
  const filtered = rows.filter(tx => {
    if (currency && currency !== 'ALL' && tx.currency !== currency) return false;
    if (filterCategories !== null && filterCategories.length > 0) {
      const cat = tx.category ?? '';
      const matches = filterCategories.includes(cat) || (filterCategories.includes('__blank__') && cat === '');
      if (!matches) return false;
    }
    if (txType && txType !== 'all' && tx.type !== txType) return false;
    if (search) {
      const q = search.toLowerCase();
      const payer = getDisplayPayer(tx, lbl).toLowerCase();
      const recipient = getDisplayRecipient(tx, lbl).toLowerCase();
      if (!payer.includes(q) && !recipient.includes(q)) return false;
    }
    if (payerFilter) {
      const q = payerFilter.toLowerCase();
      if (!getDisplayPayer(tx, lbl).toLowerCase().includes(q)) return false;
    }
    if (recipientFilter) {
      const q = recipientFilter.toLowerCase();
      if (!getDisplayRecipient(tx, lbl).toLowerCase().includes(q)) return false;
    }
    if (dateFrom && tx.transaction_date < dateFrom) return false;
    if (dateTo   && tx.transaction_date > dateTo)   return false;
    return true;
  });

  // 2. Compute amount_usd on all filtered rows (needed for USD sort)
  const withUsd: Transaction[] = filtered.map(tx => {
    const rate = MOCK_RATES[tx.currency] ?? null;
    return { ...tx, amount_usd: rate !== null ? Math.round(tx.amount * rate * 100) / 100 : null };
  });

  // 3. Summary over all filtered rows
  const moneyIn  = withUsd.filter(t => t.type === 'credit').reduce((s, t) => s + t.amount, 0);
  const moneyOut = withUsd.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
  const total    = withUsd.length;

  // 4. Sort
  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...withUsd].sort((a, b) => {
    if (sortBy === 'amount')     return (a.amount - b.amount) * dir;
    if (sortBy === 'amount_usd') return ((a.amount_usd ?? 0) - (b.amount_usd ?? 0)) * dir;
    // default: date
    return a.transaction_date < b.transaction_date ? -dir : a.transaction_date > b.transaction_date ? dir : 0;
  });

  // 5. Paginate
  const offset = (page - 1) * limit;
  const slice  = sorted.slice(offset, offset + limit);

  return {
    transactions: slice,
    pagination: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
    summary: { money_in: moneyIn, money_out: moneyOut, net_change: moneyIn - moneyOut, tx_count: total },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const fmtAmount = (amount: number, currency: string, type: 'credit' | 'debit') => {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', USDT: '$' };
  const prefix = type === 'credit' ? '+' : '-';
  return `${prefix}${sym[currency] || ''}${Math.round(Math.abs(amount)).toLocaleString()}`;
};

const fmtMoney = (n: number) => `$${Math.round(Math.abs(n)).toLocaleString()}`;

const fmtUsd = (n: number | null, type?: 'credit' | 'debit') =>
  n == null ? null : `${type === 'credit' ? '+' : type === 'debit' ? '-' : ''}$${Math.round(Math.abs(n)).toLocaleString()}`;

// ── ColumnFilterPopover ───────────────────────────────────────────────────────

function ColumnFilterPopover({ value, onCommit, placeholder }: {
  value: string; onCommit: (v: string) => void; placeholder: string;
}) {
  const [open, setOpen]   = useState(false);
  const [input, setInput] = useState(value);
  const ref               = useRef<HTMLDivElement>(null);
  const timer             = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setInput(value); }, [value]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleChange = (v: string) => {
    setInput(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onCommit(v), 400);
  };

  const clear = () => { setInput(''); onCommit(''); };
  const isActive = value.length > 0;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className={`ml-1 p-0.5 rounded transition-colors ${
          isActive
            ? 'text-indigo-400 bg-indigo-500/20'
            : 'text-slate-500 hover:text-slate-300 hover:bg-slate-600/50'
        }`}
        title={isActive ? `Filtering: "${value}"` : `Filter ${placeholder}`}
      >
        <Filter size={9} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1.5 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2.5 w-48">
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1.5">{placeholder}</div>
          <input
            autoFocus
            type="text"
            value={input}
            onChange={e => handleChange(e.target.value)}
            onKeyDown={e => e.key === 'Escape' && setOpen(false)}
            placeholder={`Search ${placeholder.toLowerCase()}…`}
            className="w-full text-xs bg-slate-700 text-slate-200 border border-slate-600 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-500"
          />
          {input && (
            <button onClick={clear} className="mt-1.5 text-[10px] text-slate-500 hover:text-red-400 transition-colors flex items-center gap-1">
              <X size={9} /> Clear filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── ClassifyCell ──────────────────────────────────────────────────────────────

function ClassifyCell<T extends string>({
  txId, field, value, options, colorMap, placeholder, onUpdate, isMock,
}: {
  txId: string;
  field: 'geo' | 'category';
  value: T | null;
  options: readonly T[];
  colorMap?: Record<string, string>;
  placeholder: string;
  isMock?: boolean;
  onUpdate: (id: string, field: 'geo' | 'category', value: string | null) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery]   = useState('');
  const ref                 = useRef<HTMLDivElement>(null);
  const inputRef            = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setTimeout(() => inputRef.current?.focus(), 50);
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered   = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  const showSearch = options.length > 6;

  const handleSelect = async (next: string | null) => {
    setOpen(false);
    if (next === value) return;
    onUpdate(txId, field, next);
    if (isMock) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/transactions/${txId}/classify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!r.ok) onUpdate(txId, field, value);
    } catch {
      onUpdate(txId, field, value);
    } finally {
      setSaving(false);
    }
  };

  const chipClass = value && colorMap
    ? colorMap[value] ?? 'bg-slate-100 text-slate-600 border border-slate-200'
    : 'bg-slate-100 text-slate-600 border border-slate-200';

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(v => !v)}
          className={`px-2 py-0.5 rounded text-xs font-semibold transition-all whitespace-nowrap ${
            value ? chipClass : 'text-slate-400 hover:text-indigo-600'
          } ${saving ? 'opacity-40' : ''}`}
          title={value ? 'Click to change' : `Add ${placeholder}`}
        >
          {value ?? `+ ${placeholder}`}
        </button>
        {value && (
          <button
            onClick={e => { e.stopPropagation(); handleSelect(null); }}
            className="text-slate-400 hover:text-rose-500 transition-colors"
            title={`Clear ${field}`}
          >
            <X size={10} />
          </button>
        )}
      </div>

      {open && (
        <div className="absolute z-40 top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl w-52 overflow-hidden">
          {showSearch && (
            <div className="p-2 border-b border-slate-100">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-400 placeholder:text-slate-400"
                onKeyDown={e => e.key === 'Escape' && setOpen(false)}
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-slate-400 text-xs">No match</div>
            ) : filtered.map(opt => (
              <button
                key={opt}
                onClick={() => handleSelect(opt)}
                className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                  value === opt ? 'text-indigo-600 font-semibold bg-indigo-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
          {value && (
            <div className="border-t border-slate-100 py-1">
              <button
                onClick={() => handleSelect(null)}
                className="w-full text-left px-3 py-1.5 text-xs text-rose-500 hover:bg-rose-50 transition-colors"
              >
                ✕ Clear {field}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

const SummaryCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-col gap-1">
    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
    <span className={`text-xl font-bold ${color || 'text-slate-900'}`}>{value}</span>
    {sub && <span className="text-slate-500 text-xs">{sub}</span>}
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export default function TransactionsPage({ companies }: { companies: Company[] }) {
  const [companyId, setCompanyId]     = useState('');
  const [sourceKey, setSourceKey]     = useState('');
  const [sources, setSources]         = useState<{ label: string; source: string; bank_id: string | null }[]>([]);
  const [currency, setCurrency]       = useState('ALL');
  const [filterCategories, setFilterCategories] = useState<string[] | null>(null);
  const [catDropdownOpen, setCatDropdownOpen] = useState(false);
  const catDropdownRef = useRef<HTMLDivElement>(null);
  const [txType, setTxType]           = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch]                   = useState('');
  const [searchInput, setSearchInput]         = useState('');
  const [payerFilter, setPayerFilter]         = useState('');
  const [recipientFilter, setRecipientFilter] = useState('');
  const [dateFrom, setDateFrom]               = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo]                   = useState(() => new Date().toISOString().slice(0, 10));
  const [page, setPage]               = useState(1);
  const [sortBy, setSortBy]           = useState<SortKey>('date');
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('desc');
  const [data, setData]               = useState<ApiResponse | null>(null);
  const [loading, setLoading]         = useState(false);
  const [isMock, setIsMock]           = useState(false);
  const [showMgFees, setShowMgFees]   = useState(false);
  const [categoryOptions, setCategoryOptions] = useState<string[]>([...CATEGORY_OPTIONS_FALLBACK]);
  const [walletLabels, setWalletLabels]     = useState<Record<string, string>>({});
  const [walletIdLabels, setWalletIdLabels] = useState<Record<string, string>>({});
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch('/api/settings/wallet-labels', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { labels: [] })
      .then(({ labels }: { labels: { address: string; label: string }[] }) => {
        const map: Record<string, string> = {};
        labels.forEach(l => { map[l.address] = l.label; });
        setWalletLabels(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/wallet-id-labels', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { labels: [] })
      .then(({ labels }: { labels: { wallet_id: string; label: string }[] }) => {
        const map: Record<string, string> = {};
        labels.forEach(l => { map[l.wallet_id] = l.label; });
        setWalletIdLabels(map);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/settings/categories', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((cats: string[] | null) => {
        if (cats && cats.length > 0) setCategoryOptions([...cats, '__blank__']);
      })
      .catch(() => {});
  }, []);

  // Close category dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target as Node))
        setCatDropdownOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (companyId)          params.set('company_id', companyId);
      const selectedOpt = sources.find(s => s.label === sourceKey);
      if (selectedOpt) {
        if (selectedOpt.bank_id) params.set('bank_id', selectedOpt.bank_id);
        else                     params.set('source',  selectedOpt.source);
      }
      if (currency !== 'ALL')         params.set('currency', currency);
      if (filterCategories !== null && filterCategories.length > 0) params.set('category', filterCategories.join(','));
      if (txType !== 'all')           params.set('type', txType);
      if (search)             params.set('search', search);
      if (payerFilter)        params.set('payer_filter', payerFilter);
      if (recipientFilter)    params.set('recipient_filter', recipientFilter);
      if (showMgFees)         params.set('show_mg_fees', '1');
      if (sortBy !== 'amount_usd') { params.set('sort_by', sortBy); params.set('sort_dir', sortDir); }

      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) {
        const json = await res.json();
        if (sortBy === 'amount_usd') {
          const dir = sortDir === 'asc' ? 1 : -1;
          json.transactions = [...json.transactions].sort((a: Transaction, b: Transaction) =>
            ((a.amount_usd ?? 0) - (b.amount_usd ?? 0)) * dir
          );
        }
        setIsMock(false);
        setData(json);
      } else {
        throw new Error('api error');
      }
    } catch {
      setIsMock(true);
      setData(buildMockResponse(MOCK_TRANSACTIONS, { currency, filterCategories, txType, search, payerFilter, recipientFilter, dateFrom, dateTo, page, limit: 20, sortBy, sortDir, labels: walletLabels }));
    } finally {
      setLoading(false);
    }
  }, [page, companyId, sourceKey, sources, currency, filterCategories, txType, search, payerFilter, recipientFilter, dateFrom, dateTo, sortBy, sortDir, showMgFees]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    fetch('/api/transactions/sources')
      .then(r => r.ok ? r.json() : [])
      .then(setSources)
      .catch(() => {});
  }, []);


  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };


  const handleSort = (key: SortKey) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('desc'); }
    setPage(1);
  };

  const handleClassify = useCallback((id: string, field: 'geo' | 'category', value: string | null) => {
    setData(prev => {
      if (!prev) return prev;
      return { ...prev, transactions: prev.transactions.map(tx => tx.id === id ? { ...tx, [field]: value } : tx) };
    });
  }, []);

  const [exportLoading, setExportLoading] = useState(false);

  const exportCsv = useCallback(async () => {
    let rows: Transaction[];

    if (isMock) {
      rows = buildMockResponse(MOCK_TRANSACTIONS, { currency, filterCategories, txType, search, payerFilter, recipientFilter, dateFrom, dateTo, page: 1, limit: 9999, sortBy, sortDir, labels: walletLabels }).transactions;
    } else {
      setExportLoading(true);
      try {
        const params = new URLSearchParams({ page: '1', limit: '9999', date_from: dateFrom, date_to: dateTo });
        if (companyId) params.set('company_id', companyId);
        const selectedOpt = sources.find(s => s.label === sourceKey);
        if (selectedOpt) {
          if (selectedOpt.bank_id) params.set('bank_id', selectedOpt.bank_id);
          else                     params.set('source',  selectedOpt.source);
        }
        if (currency !== 'ALL')          params.set('currency', currency);
        if (filterCategories !== null && filterCategories.length > 0) params.set('category', filterCategories.join(','));
        if (txType !== 'all')            params.set('type', txType);
        if (search)                      params.set('search', search);
        if (payerFilter)                 params.set('payer_filter', payerFilter);
        if (recipientFilter)             params.set('recipient_filter', recipientFilter);
        if (showMgFees)                  params.set('show_mg_fees', '1');
        if (sortBy !== 'amount_usd') { params.set('sort_by', sortBy); params.set('sort_dir', sortDir); }

        const res = await fetch(`/api/transactions?${params}`);
        if (!res.ok) throw new Error('api error');
        const json = await res.json();
        rows = json.transactions ?? [];

        if (sortBy === 'amount_usd') {
          const dir = sortDir === 'asc' ? 1 : -1;
          rows = [...rows].sort((a, b) => ((a.amount_usd ?? 0) - (b.amount_usd ?? 0)) * dir);
        }
      } catch {
        rows = data?.transactions ?? [];
      } finally {
        setExportLoading(false);
      }
    }

    const headers = ['Date', 'Payer', 'Recipient', 'Currency', 'Category', 'Total Amount', 'Amount USD', 'In/Out'];
    const csvRows = rows.map(tx => [
      tx.transaction_date,
      getDisplayPayer(tx, walletLabels),
      getDisplayRecipient(tx, walletLabels),
      tx.currency,
      tx.category ?? '',
      tx.type === 'credit' ? tx.amount : -tx.amount,
      tx.amount_usd != null ? (tx.type === 'credit' ? tx.amount_usd : -tx.amount_usd) : '',
      tx.type === 'credit' ? 'In' : 'Out',
    ]);

    const csv = [headers, ...csvRows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `transactions_${dateFrom}_to_${dateTo}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [isMock, data, companyId, sourceKey, sources, currency, filterCategories, txType, search, payerFilter, recipientFilter, dateFrom, dateTo, sortBy, sortDir, showMgFees]);

  const resetPage = () => setPage(1);
  const inputCls  = "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";
  const labelCls  = "text-slate-400 text-xs font-semibold uppercase tracking-wider";
  const { transactions = [], pagination, summary } = data || {};

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortBy === k
      ? sortDir === 'asc' ? <ArrowUp size={10} className="text-indigo-500" /> : <ArrowDown size={10} className="text-indigo-500" />
      : <ArrowUpDown size={10} className="opacity-25" />;

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Company</label>
          <select value={companyId} onChange={e => { setCompanyId(e.target.value); resetPage(); }} className={`${inputCls} min-w-[140px]`}>
            <option value="">All Companies</option>
            {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {sources.length > 0 && (
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Source</label>
            <select value={sourceKey} onChange={e => { setSourceKey(e.target.value); resetPage(); }} className={`${inputCls} min-w-[120px]`}>
              <option value="">All Sources</option>
              {sources.map(s => <option key={s.label} value={s.label}>{s.label}</option>)}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className={labelCls}>Currency</label>
          <select value={currency} onChange={e => { setCurrency(e.target.value); resetPage(); }} className={inputCls}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1 relative" ref={catDropdownRef}>
          <label className={labelCls}>Category</label>
          <button
            type="button"
            onClick={() => setCatDropdownOpen(o => !o)}
            className={`${inputCls} min-w-[160px] text-left flex items-center justify-between gap-2`}
          >
            <span className="truncate">
              {filterCategories === null || filterCategories.length === 0 ? 'All Categories' :
               filterCategories.length === 1 ? (filterCategories[0] === '__blank__' ? '(No category)' : filterCategories[0]) :
               `${filterCategories.length} selected`}
            </span>
            <span className="text-slate-400 text-xs">▾</span>
          </button>
          {catDropdownOpen && (
            <div className="absolute top-full left-0 z-50 mt-1 w-64 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg py-1">
              <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm font-medium">
                <input type="checkbox"
                  checked={filterCategories === null}
                  onChange={() => {
                    // null → [] (uncheck all so user can pick specific ones)
                    // anything else → null (reset to all)
                    setFilterCategories(filterCategories === null ? [] : null);
                    resetPage();
                  }} />
                <span className="text-slate-600">All Categories</span>
              </label>
              <div className="border-t border-slate-100 my-1" />
              {categoryOptions.map(c => (
                <label key={c} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50 cursor-pointer text-sm">
                  <input type="checkbox"
                    checked={filterCategories === null || filterCategories.includes(c)}
                    onChange={() => {
                      if (filterCategories === null) {
                        // All shown — uncheck one → switch to "all except this one"
                        setFilterCategories(categoryOptions.filter(x => x !== c));
                      } else if (filterCategories.includes(c)) {
                        const next = filterCategories.filter(x => x !== c);
                        // If all unchecked → reset to all
                        setFilterCategories(next.length === 0 ? null : next);
                      } else {
                        const next = [...filterCategories, c];
                        // If all checked again → reset to null (clean all state)
                        setFilterCategories(next.length >= categoryOptions.length ? null : next);
                      }
                      resetPage();
                    }} />
                  <span className="text-slate-700">{c === '__blank__' ? '(No category)' : c}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>From</label>
          <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); resetPage(); }} className={inputCls} />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelCls}>To</label>
          <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); resetPage(); }} className={inputCls} />
        </div>

        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label className={labelCls}>Search</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" placeholder="Party name or reference…" value={searchInput}
              onChange={e => handleSearchInput(e.target.value)}
              className={`${inputCls} w-full pl-8`}
            />
          </div>
        </div>

        <div className="flex gap-1">
          {(['all', 'credit', 'debit'] as const).map(t => (
            <button
              key={t}
              onClick={() => { setTxType(t); resetPage(); }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                txType === t
                  ? t === 'credit' ? 'bg-emerald-600 text-white' : t === 'debit' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white'
                  : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              {t === 'all' ? 'All' : t === 'credit' ? '↙ In' : '↗ Out'}
            </button>
          ))}
        </div>

        <button
          onClick={fetchData} disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors"
        >
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>


      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryCard label="Money In"    value={fmtMoney(summary.money_in)}    sub={`${dateFrom} → ${dateTo}`} color="text-emerald-600" />
          <SummaryCard label="Money Out"   value={fmtMoney(summary.money_out)}   sub={`${dateFrom} → ${dateTo}`} color="text-red-600" />
          <SummaryCard label="Net Change"  value={(summary.net_change >= 0 ? '+' : '') + fmtMoney(summary.net_change)} color={summary.net_change >= 0 ? 'text-emerald-600' : 'text-red-600'} />
          <SummaryCard label="Transactions" value={summary.tx_count.toLocaleString()} sub="matching filters" />
        </div>
      )}

      {/* Table */}
      <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">

        {/* Table toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
          <span className="text-xs text-slate-400">
            {pagination ? `${pagination.total.toLocaleString()} transaction${pagination.total !== 1 ? 's' : ''}` : ''}
            {isMock ? ' (demo)' : ''}
          </span>
          <div className="flex items-center gap-3">
            {/* MoneyGate Fee toggle */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">MG Fees</span>
              <button
                role="switch"
                aria-checked={showMgFees}
                onClick={() => { setShowMgFees(v => !v); setPage(1); }}
                className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 ${
                  showMgFees ? 'bg-indigo-500' : 'bg-slate-600'
                }`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-200 ${showMgFees ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </label>
            <button
              onClick={exportCsv}
              disabled={transactions.length === 0 || exportLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 rounded-lg text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download size={13} />
              {exportLoading ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>

        {loading && !data ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading transactions…</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-800/50 border-b border-slate-700/50">
                  <th
                    onClick={() => handleSort('date')}
                    className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-slate-300 select-none"
                  >
                    <div className="flex items-center gap-1">Date <SortIcon k="date" /></div>
                  </th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center">Payer
                      <ColumnFilterPopover value={payerFilter} onCommit={v => { setPayerFilter(v); setPage(1); }} placeholder="Payer" />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                    <div className="flex items-center">Recipient
                      <ColumnFilterPopover value={recipientFilter} onCommit={v => { setRecipientFilter(v); setPage(1); }} placeholder="Recipient" />
                    </div>
                  </th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">Currency</th>
                  <th
                    onClick={() => handleSort('amount')}
                    className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-slate-300 select-none"
                  >
                    <div className="flex items-center gap-1">Total Amount <SortIcon k="amount" /></div>
                  </th>
                  <th
                    onClick={() => handleSort('amount_usd')}
                    className="px-4 py-2 text-left text-[10px] font-bold text-indigo-400 uppercase tracking-wider whitespace-nowrap cursor-pointer hover:text-indigo-300 select-none"
                  >
                    <div className="flex items-center gap-1">Amount USD <SortIcon k="amount_usd" /></div>
                  </th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-indigo-400 whitespace-nowrap">Category</th>
                  <th className="px-4 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">In/Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-500 text-sm">
                      No transactions found for the selected filters.
                    </td>
                  </tr>
                )}
                {transactions.map(tx => (
                  <tr key={tx.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-1.5 text-slate-400 whitespace-nowrap text-xs">{fmtDate(tx.transaction_date)}</td>
                    <td className="px-4 py-1.5 text-slate-200 max-w-[160px] text-xs">
                      <div className="truncate" title={getDisplayPayer(tx, walletLabels)}>
                        {getDisplayPayer(tx, walletLabels) || <span className="text-slate-600">—</span>}
                      </div>
                      {tx.type === 'debit' && walletIdLabels[tx.wallet_id] && (
                        <div className="text-[10px] text-slate-500 truncate">{walletIdLabels[tx.wallet_id]}</div>
                      )}
                    </td>
                    <td className="px-4 py-1.5 text-slate-200 max-w-[160px] text-xs">
                      <div className="truncate" title={getDisplayRecipient(tx, walletLabels)}>
                        {getDisplayRecipient(tx, walletLabels) || <span className="text-slate-600">—</span>}
                      </div>
                      {tx.type === 'credit' && walletIdLabels[tx.wallet_id] && (
                        <div className="text-[10px] text-slate-500 truncate">{walletIdLabels[tx.wallet_id]}</div>
                      )}
                    </td>
                    <td className="px-4 py-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${curBadge(tx.currency)}`}>
                        {tx.currency}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 font-mono text-xs text-slate-500 whitespace-nowrap">
                      {fmtAmount(tx.amount, tx.currency, tx.type)}
                    </td>
                    <td className={`px-4 py-1.5 font-mono font-semibold whitespace-nowrap text-xs ${
                      tx.type === 'credit' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {fmtUsd(tx.amount_usd, tx.type) ?? <span className="text-slate-600">—</span>}
                    </td>
                    <td className="px-4 py-1">
                      <ClassifyCell
                        txId={tx.id} field="category" value={tx.category as any}
                        options={categoryOptions as any} placeholder="Category"
                        onUpdate={handleClassify} isMock={isMock}
                      />
                    </td>
                    <td className="px-4 py-1.5">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        tx.type === 'credit' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-red-500/15 text-red-400'
                      }`}>
                        {tx.type === 'credit' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                        {tx.type === 'credit' ? 'In' : 'Out'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-700/50 text-xs text-slate-500">
            <span>
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} transactions
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ChevronLeft size={13} /> Prev
              </button>
              <span className="flex items-center px-3 py-1.5 text-slate-600">{pagination.page} / {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page >= pagination.pages}
                className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Next <ChevronRight size={13} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
