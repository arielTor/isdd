import { useState } from 'react';
import { CreditCard, ChevronDown, Clock, Building2, CheckCircle2 } from 'lucide-react';
import { Company, PspProvider, PspSettlement, PspWalletBalance, CURRENCY_SYMBOLS } from './types';

export const fmtUsd = (n: number) => {
  const neg = n < 0;
  return (neg ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const fmtAmount = (n: number, currency: string) => {
  const neg = n < 0;
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${neg ? '-' : ''}${s} ${currency}`;
};

const currencyBadgeClass = (c: string) =>
  c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
  c === 'BTC' || c === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

// Headline balance = Available + Reserved + Received + Pending (matches the PSP's own UI).
// value_usd is the USD value of `balance` (Available) only, so the per-unit rate is
// derived from it and applied to the full headline for a USD total.
export const walletHeadline = (w: PspWalletBalance) =>
  (w.balance || 0) + (w.reserve_balance || 0) + (w.received_balance || 0) + (w.on_hold_balance || 0);

export const walletTotalUsd = (w: PspWalletBalance) => {
  const rate = w.balance !== 0 ? (w.value_usd || 0) / w.balance : 1;
  return walletHeadline(w) * rate;
};

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

const CurrencyBalanceCard = ({ wallet, ewalletLabel }: { wallet: PspWalletBalance; ewalletLabel: string }) => {
  const available = wallet.balance || 0;
  const reserved = wallet.reserve_balance || 0;
  const received = wallet.received_balance || 0;
  const pending = wallet.on_hold_balance || 0;
  const headline = walletHeadline(wallet);
  const fmt2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-1">
        <span className={`font-mono font-bold text-lg ${headline < 0 ? 'text-red-600' : 'text-slate-900'}`}>
          {fmt2(headline)} {wallet.currency}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase shrink-0 ${currencyBadgeClass(wallet.currency)}`}>{wallet.currency}</span>
      </div>
      <div className="text-[10px] text-slate-400 font-mono mb-3">{ewalletLabel}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-slate-100">
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Available</div>
          <div className={`font-mono text-sm font-bold ${available < 0 ? 'text-red-600' : 'text-slate-800'}`}>{fmt2(available)} {wallet.currency}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Reserved</div>
          <div className={`font-mono text-sm font-bold ${reserved === 0 ? 'text-slate-400' : 'text-slate-800'}`}>{fmt2(reserved)} {wallet.currency}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Received</div>
          <div className={`font-mono text-sm font-bold ${received === 0 ? 'text-slate-400' : 'text-slate-800'}`}>{fmt2(received)} {wallet.currency}</div>
        </div>
        <div>
          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Pending</div>
          <div className={`font-mono text-sm font-bold ${pending === 0 ? 'text-slate-400' : 'text-slate-800'}`}>{fmt2(pending)} {wallet.currency}</div>
        </div>
      </div>
    </div>
  );
};

const ProviderRow = ({ provider, settlements }: { provider: PspProvider; settlements: PspSettlement[] }) => {
  const [expanded, setExpanded] = useState(true);

  const allWallets = provider.ewallets.flatMap(ew => ew.wallets.map(w => ({ ...w, ewalletLabel: ew.reference_id || ew.id })));
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
          <span className="font-mono font-bold text-slate-900">{fmtUsd(totalUsd)}</span>
          <ChevronDown size={16} className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {allWallets.length > 0 && (
            <div className="space-y-3">
              {allWallets.map(w => (
                <CurrencyBalanceCard key={w.id} wallet={w} ewalletLabel={w.ewalletLabel} />
              ))}
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
