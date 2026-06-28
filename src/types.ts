export interface Wallet {
  id: string;
  currency: string;
  balance: number;
  value_usd?: number;           // Authoritative USD value from integration
  value_usd_estimated?: boolean; // true = computed from live rate, not from DB
  updated_at?: string;
}

export interface BankAccount {
  id: string;
  accountNumber: string;
  account_number?: string; // Standard account_number from user spec
  wallets: Wallet[];
}

export interface Bank {
  id: string;
  name: string;
  country: string;
  isVerified: boolean;
  is_verified?: number | boolean | string; // Supporting DB payloads
  accounts: BankAccount[];
  bank_accounts?: BankAccount[]; // Standard bank_accounts from user spec
  last_modified_date?: string;
}

export interface ExchangeRate {
  base_currency: string;
  target_currency: string;
  rate: number;
}

export interface PspWalletBalance {
  id: string;
  currency: string;
  balance: number;
  received_balance?: number;
  on_hold_balance?: number;
  reserve_balance?: number;
  value_usd: number;
  value_usd_estimated?: boolean;
  updated_at?: string;
}

export interface PspEwallet {
  id: string; // external ewallet_id (e.g. Rapyd ewallet_...)
  reference_id?: string | null;
  type?: string | null;
  category?: string | null;
  status: string;
  wallets: PspWalletBalance[];
}

export interface PspProvider {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  ewallets: PspEwallet[];
}

export interface PspSettlement {
  id: string;
  ewalletId: string;
  pspProviderName: string;
  currency: string;
  amount: number;
  status: string;
  paymentDate: string | null;
  paidAt: string | null;
  bankAccountName: string | null;
  bankAccountRef: string | null;
  notes?: string | null;
}

export type UserRole = 'Admin' | 'Viewer' | 'Manager';

export interface UserPermission {
  companyId: string;
  bankIds: string[]; // empty means all banks in company
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: 'Active' | 'Inactive';
  lastActive: string;
  permissions: UserPermission[];
  password?: string; // only used when creating/updating — never returned by API
}

export interface Company {
  id: string;
  name: string;
  industry?: string;
  status?: 'Active' | 'Inactive' | 'Onboarding';
  banks: Bank[];
  psp_providers?: PspProvider[];
  psp_settlements?: PspSettlement[];
}

export interface WalletAlert {
  id: string;
  companyId: string;
  bankId: string;
  walletId: string;
  threshold: number;
  email: string;
  isEnabled: boolean;
}

export type CurrencySymbol = {
  [key: string]: string;
};

export const CURRENCY_SYMBOLS: CurrencySymbol = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  BTC: "₿",
  ETH: "Ξ",
  ILS: "₪",
};

// ── Customizable dashboard ──────────────────────────────────────────────────
// A single point of the global portfolio history series (used by sparklines).
export interface PortfolioPoint {
  date: string;
  fiat: number;
  crypto: number;
  total: number;
}

// The kinds of widget a user can place on their personal dashboard.
export type WidgetType =
  | 'asset-breakdown'
  | 'total-portfolio'
  | 'summary-by-bank'
  | 'summary-by-company'
  | 'summary-by-currency'
  | 'portfolio-table'
  | 'company-detail'
  | 'chart-trend'
  | 'chart-by-bank'
  | 'chart-by-company'
  | 'chart-by-currency';

// One placed widget instance. Position/size are in 12-column grid units;
// `h` is measured in row units (see GRID_ROW_PX in the canvas).
export interface DashboardWidget {
  i: string;                 // unique instance id
  type: WidgetType;
  companyIds: string[];      // [] = every company the user can see
  x: number;
  y: number;
  w: number;
  h: number;
}

export type DashboardLayout = DashboardWidget[];
