export interface Wallet {
  id: string;
  currency: string;
  balance: number;
  value_usd?: number; // Normalized USD value from user spec
  updated_at?: string; // Standard updated_at from user spec
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
}

export interface Company {
  id: string;
  name: string;
  industry?: string;
  status?: 'Active' | 'Inactive' | 'Onboarding';
  banks: Bank[];
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
