import { useState } from 'react';
import { CreditCard, ChevronDown, Clock, Building2, CheckCircle2 } from 'lucide-react';
import { Company, PspProvider, PspSettlement, PspWalletBalance } from './types';

export const fmtUsd = (n: number) => {
  const neg = n < 0;
  return (neg ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtAmount = (n: number, currency: string) => {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}${s} ${currency}`;
};

const fmt2 = (n: number) => {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return neg ? `(${s})` : s;
};

const currencyBadgeClass = (c: string) =>
  c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
  c === 'BTC' || c === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

// Balance = balance + received_balance + on_hold_balance + reserve_balance (all 4 fields).
// Transactions = balance + received_balance + on_hold_balance (everything not held in reserve).
// Rolling Reserve = reserve_balance alone. Balance = Transactions + Rolling Reserve always holds.
export const walletBalance = (w: PspWalletBalance) =>
  (w.balance || 0) + (w.reserve_balance || 0) + (w.received_balance || 0) + (w.on_hold_balance || 0);

export const walletTransactions = (w: PspWalletBalance) =>
  (w.balance || 0) + (w.received_balance || 0) + (w.on_hold_balance || 0);

export const walletRollingReserve = (w: PspWalletBalance) => w.reserve_balance || 0;

// value_usd is the USD value of `balance` only, so the per-unit FX rate is derived
// from it and applied to the other fields (psp_wallet_accounts has no value_usd of its own).
export const walletRate = (w: PspWalletBalance) => (w.balance !== 0 ? (w.value_usd || 0) / w.balance : 1);

export const walletTotalUsd = (w: PspWalletBalance) => walletBalance(w) * walletRate(w);

// Settlements have no stored FX rate, so approximate one from a same-currency wallet.
export function buildCurrencyRateMap(companies: Company[]): Record<string, number> {
  const rates: Record<string, number> = {};
  companies.forEach(c => (c.psp_providers || []).forEach(p => p.ewallets.forEach(ew => ew.wallets.forEach(w => {
    if (w.balance !== 0 && rates[w.currency] === undefined) rates[w.currency] = walletRate(w);
  }))));
  return rates;
}

export const settlementUsd = (amount: number, currency: string, rates: Record<string, number>) =>
  amount * (rates[currency] ?? 1);

// Sum of PENDING settlement amounts for one ewallet, in its native currency.
export function pendingSettlementSum(settlements: PspSettlement[], ewalletId: string, currency: string) {
  return settlements
    .filter(s => s.ewalletId === ewalletId && s.currency === currency && s.status === 'PENDING')
    .reduce((sum, s) => sum + s.amount, 0);
}

type GroupBy = 'date' | 'account';
type Tab = 'next' | 'history';

function groupSettlements(rows: PspSettlement[], groupBy: GroupBy): [string, PspSettlement[]][] {
  const map = new Map<string, PspSettlement[]>();
  for (const s of rows) {
    const key = groupBy === 'date'
      ? (s.paymentDate || s.paidAt || 'Unknown date')
      : (s.bankAccountName || s.bankAccountRef || 'N/A');
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return Array.from(map.entries());
}

const SettlementsPanel = ({ settlements }: { settlements: PspSettlement[] }) => {
  const [tab, setTab] = useState<Tab>('next');
  const [groupBy, setGroupBy] = useState<GroupBy>('date');

  const nextPayments = settlements
    .filter(s => s.status === 'PENDING')
    .sort((a, b) => (a.paymentDate || '').localeCompare(b.paymentDate || ''));
  const history = settlements
    .filter(s => s.status !== 'PENDING')
    .sort((a, b) => (b.paidAt || b.paymentDate || '').localeCompare(a.paidAt || a.paymentDate || ''));

  const rows = tab === 'next' ? nextPayments : history;
  const groups = groupSettlements(rows, groupBy);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100 flex-wrap gap-3">
        <div className="flex items-center gap-5">
          <button
            onClick={() => setTab('next')}
            className={`text-sm font-bold pb-1 border-b-2 transition-colors ${tab === 'next' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}
          >
            Next payments
          </button>
          <button
            onClick={() => setTab('history')}
            className={`text-sm font-bold pb-1 border-b-2 transition-colors ${tab === 'history' ? 'text-indigo-600 border-indigo-600' : 'text-slate-400 border-transparent'}`}
          >
            History
          </button>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
          <button
            onClick={() => setGroupBy('date')}
            className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${groupBy === 'date' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
          >
            Date
          </button>
          <button
            onClick={() => setGroupBy('account')}
            className={`text-xs font-bold px-3 py-1 rounded-full transition-colors ${groupBy === 'account' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400'}`}
          >
            Account
          </button>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="p-8 text-center">
          <p className="text-sm text-slate-400">
            {tab === 'next' ? 'No upcoming settlements scheduled.' : 'No settlement history yet.'}
          </p>
        </div>
      ) : (
        <div className="p-5 space-y-5">
          {groups.map(([key, groupRows]) => (
            <div key={key}>
              <div className={`flex items-center gap-2 mb-2 ${tab === 'history' ? 'text-slate-400' : 'text-slate-500'}`}>
                {groupBy === 'date' ? <Clock size={13} /> : <Building2 size={13} />}
                <span className="text-xs font-bold">
                  {groupBy === 'date'
                    ? (tab === 'next' ? `Scheduled for ${key}` : `Paid ${key}`)
                    : key}
                </span>
              </div>
              <div className={`border border-slate-100 rounded-lg divide-y divide-slate-100 ${tab === 'history' ? 'opacity-70' : ''}`}>
                {groupRows.map(s => (
                  <div key={s.id} className="grid grid-cols-3 gap-4 px-4 py-2.5">
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">{groupBy === 'date' ? 'Bank' : (tab === 'next' ? 'Scheduled' : 'Paid')}</div>
                      <div className="text-sm text-slate-700">
                        {groupBy === 'date' ? (s.bankAccountName || 'N/A') : (tab === 'next' ? (s.paymentDate || 'N/A') : (s.paidAt || s.paymentDate || 'N/A'))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Bank account</div>
                      <div className="text-sm text-slate-400">{s.bankAccountRef || 'N/A'}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] font-bold text-slate-400 uppercase">Settlement amount</div>
                      <div className="text-sm font-mono font-bold text-slate-900">{fmtAmount(s.amount, s.currency)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProviderRow = ({ provider, settlements }: { provider: PspProvider; settlements: PspSettlement[] }) => {
  const [expanded, setExpanded] = useState(true);

  const allWallets = provider.ewallets.flatMap(ew => ew.wallets.map(w => ({
    ...w,
    ewalletId: ew.id,
    ewalletLabel: ew.reference_id || ew.id,
    ewalletMeta: [ew.category, ew.status].filter(Boolean).join(' · '),
  })));
  const totalUsd = allWallets.reduce((sum, w) => sum + walletTotalUsd(w), 0);
  const providerSettlements = settlements.filter(s => provider.ewallets.some(ew => ew.id === s.ewalletId));

  return (
    <div className={provider.isActive ? '' : 'opacity-60 grayscale'}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-violet-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-violet-600/20">
            {provider.name.charAt(0).toUpperCase()}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900">{provider.name}</span>
              {provider.isActive && <CheckCircle2 size={12} className="text-emerald-500" />}
            </div>
            <span className="text-[10px] text-slate-400 font-mono">{provider.ewallets.length} eWallet{provider.ewallets.length === 1 ? '' : 's'} · {provider.slug}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider ${provider.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {provider.isActive ? 'Active' : 'Inactive'}
          </span>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Balance (USD)</span>
          <span className="font-mono font-bold text-slate-900">{fmtUsd(totalUsd)}</span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {allWallets.length > 0 && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-sm min-w-[680px]">
                <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-5 py-3 border-b border-slate-100">Account</th>
                    <th className="px-3 py-3 border-b border-slate-100 text-right">Balance</th>
                    <th className="px-3 py-3 border-b border-slate-100 text-right">Currency</th>
                    <th className="px-3 py-3 border-b border-slate-100 text-right">Transactions</th>
                    <th className="px-3 py-3 border-b border-slate-100 text-right">Rolling Reserves</th>
                    <th className="px-3 py-3 border-b border-slate-100 text-right">Settlement</th>
                    <th className="px-5 py-3 border-b border-slate-100 text-right">Valuation (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {allWallets.map(w => {
                    const balance = walletBalance(w);
                    const transactions = walletTransactions(w);
                    const reserve = walletRollingReserve(w);
                    const settlement = pendingSettlementSum(settlements, w.ewalletId, w.currency);
                    const valuationUsd = walletTotalUsd(w);
                    return (
                      <tr key={w.id} className="hover:bg-slate-50/50 border-b border-slate-50 last:border-b-0">
                        <td className="px-5 py-3">
                          <div className="font-bold text-slate-900">{w.ewalletLabel}</div>
                          {w.ewalletMeta && <div className="text-[10px] text-slate-400 font-mono">{w.ewalletMeta}</div>}
                        </td>
                        <td className={`px-3 py-3 text-right font-mono font-bold ${balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmt2(balance)}</td>
                        <td className="px-3 py-3 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${currencyBadgeClass(w.currency)}`}>{w.currency}</span></td>
                        <td className={`px-3 py-3 text-right font-mono ${transactions < 0 ? 'text-red-600' : 'text-slate-600'}`}>{fmt2(transactions)}</td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600">{fmt2(reserve)}</td>
                        <td className={`px-3 py-3 text-right font-mono ${settlement === 0 ? 'text-slate-400' : 'text-emerald-600'}`}>{fmt2(settlement)}</td>
                        <td className={`px-5 py-3 text-right font-mono font-bold ${valuationUsd < 0 ? 'text-red-600' : 'text-slate-900'}`}>{fmtUsd(valuationUsd)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-indigo-50 border-t-2 border-indigo-100">
                    <td colSpan={6} className="px-5 py-3 font-bold text-indigo-700 uppercase text-[11px] tracking-widest">Total ({provider.name})</td>
                    <td className="px-5 py-3 text-right font-mono font-bold text-sm text-indigo-700">{fmtUsd(totalUsd)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <SettlementsPanel settlements={providerSettlements} />
        </div>
      )}
    </div>
  );
};

const PSPSection = ({ company }: { company: Company }) => {
  const providers = company.psp_providers || [];
  if (providers.length === 0) return null;

  const settlements = company.psp_settlements || [];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
          <CreditCard size={18} className="text-indigo-600" />
          <h3 className="text-xl font-bold text-slate-800 tracking-tight">{company.name}</h3>
          {company.industry && (
            <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              {company.industry}
            </span>
          )}
        </div>
        <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
          {providers.length} Provider{providers.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="divide-y divide-slate-100">
        {providers.map(provider => (
          <ProviderRow key={provider.id} provider={provider} settlements={settlements} />
        ))}
      </div>
    </div>
  );
};

export default PSPSection;
