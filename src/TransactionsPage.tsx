import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCcw } from 'lucide-react';
import { Company } from './types';

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
  currency: string;
  other_party: string | null;
  reference: string | null;
  payment_scheme: string | null;
  balance_after: number | null;
  source: string;
  synced_at: string;
}

interface ApiResponse {
  transactions: Transaction[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: { money_in: number; money_out: number; net_change: number; tx_count: number };
}

const CURRENCIES = ['ALL', 'EUR', 'GBP', 'USD', 'ILS', 'USDT'];

const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

const fmtAmount = (amount: number, currency: string, type: 'credit' | 'debit') => {
  const sym: Record<string, string> = { USD: '$', EUR: '€', GBP: '£', ILS: '₪', USDT: '$' };
  const prefix = type === 'credit' ? '+' : '-';
  return `${prefix}${sym[currency] || ''}${Math.abs(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const fmtMoney = (n: number) =>
  `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const SummaryCard = ({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-1">
    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
    <span className={`text-xl font-bold ${color || 'text-white'}`}>{value}</span>
    {sub && <span className="text-slate-500 text-xs">{sub}</span>}
  </div>
);

export default function TransactionsPage({ companies }: { companies: Company[] }) {
  const [tab, setTab] = useState<'banks' | 'psp'>('banks');
  const [companyId, setCompanyId] = useState('');
  const [currency, setCurrency] = useState('ALL');
  const [txType, setTxType] = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = tab === 'banks' ? 'ifx' : 'rapyd';

  const fetchData = useCallback(async () => {
    if (tab === 'psp') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        source,
        page: String(page),
        limit: '20',
        date_from: dateFrom,
        date_to: dateTo,
      });
      if (companyId) params.set('company_id', companyId);
      if (currency !== 'ALL') params.set('currency', currency);
      if (txType !== 'all') params.set('type', txType);
      if (search) params.set('search', search);

      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tab, source, page, companyId, currency, txType, search, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Debounce search input
  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  const resetPage = () => setPage(1);

  const { transactions = [], pagination, summary } = data || {};

  return (
    <div className="space-y-5">
      {/* Tabs */}
      <div className="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 w-fit">
        {(['banks', 'psp'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); setData(null); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {t === 'banks' ? 'Banks' : 'Payment Providers'}
          </button>
        ))}
      </div>

      {tab === 'psp' ? (
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-12 text-center space-y-3">
          <div className="text-4xl">🔌</div>
          <p className="text-white font-semibold text-lg">Payment provider transactions coming soon.</p>
          <p className="text-slate-400 text-sm">PSP integration is currently being configured.</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-wrap gap-3 items-end">
            {/* Company */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Company</label>
              <select
                value={companyId}
                onChange={e => { setCompanyId(e.target.value); resetPage(); }}
                className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 min-w-[140px]"
              >
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            {/* Currency */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Currency</label>
              <select
                value={currency}
                onChange={e => { setCurrency(e.target.value); resetPage(); }}
                className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date from */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={e => { setDateFrom(e.target.value); resetPage(); }}
                className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Date to */}
            <div className="flex flex-col gap-1">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={e => { setDateTo(e.target.value); resetPage(); }}
                className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Search */}
            <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
              <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Search</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Party name or reference…"
                  value={searchInput}
                  onChange={e => handleSearchInput(e.target.value)}
                  className="w-full bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg pl-8 pr-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Type filter */}
            <div className="flex gap-1">
              {(['all', 'credit', 'debit'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setTxType(t); resetPage(); }}
                  className={`px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                    txType === t
                      ? t === 'credit' ? 'bg-emerald-600 text-white' : t === 'debit' ? 'bg-rose-600 text-white' : 'bg-indigo-600 text-white'
                      : 'bg-slate-700/60 text-slate-400 hover:text-white border border-slate-600/50'
                  }`}
                >
                  {t === 'all' ? 'All' : t === 'credit' ? '↙ In' : '↗ Out'}
                </button>
              ))}
            </div>

            <button
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
            >
              <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard
                label="Money In"
                value={fmtMoney(summary.money_in)}
                sub={`${dateFrom} → ${dateTo}`}
                color="text-emerald-400"
              />
              <SummaryCard
                label="Money Out"
                value={fmtMoney(summary.money_out)}
                sub={`${dateFrom} → ${dateTo}`}
                color="text-rose-400"
              />
              <SummaryCard
                label="Net Change"
                value={(summary.net_change >= 0 ? '+' : '') + fmtMoney(summary.net_change)}
                color={summary.net_change >= 0 ? 'text-emerald-400' : 'text-rose-400'}
              />
              <SummaryCard
                label="Transactions"
                value={summary.tx_count.toLocaleString()}
                sub="matching filters"
              />
            </div>
          )}

          {/* Table */}
          <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
            {loading && !data ? (
              <div className="p-12 text-center text-slate-500 text-sm">Loading transactions…</div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">No transactions found for the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-700/50 border-b border-slate-700/50">
                      {['Date', 'Description', 'Reference', 'Type', 'Amount', 'Currency', 'Scheme'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/30">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-700/20 transition-colors">
                        <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{fmtDate(tx.transaction_date)}</td>
                        <td className="px-4 py-3 text-slate-200 max-w-[200px] truncate" title={tx.other_party || ''}>
                          {tx.other_party || <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-400 max-w-[240px]">
                          {tx.reference ? (
                            <span title={tx.reference} className="cursor-default">
                              {tx.reference.length > 60 ? tx.reference.slice(0, 60) + '…' : tx.reference}
                            </span>
                          ) : <span className="text-slate-600">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            tx.type === 'credit'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : 'bg-rose-500/20 text-rose-400'
                          }`}>
                            {tx.type === 'credit'
                              ? <ArrowDownLeft size={11} />
                              : <ArrowUpRight size={11} />}
                            {tx.type === 'credit' ? 'In' : 'Out'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-mono font-semibold whitespace-nowrap ${
                          tx.type === 'credit' ? 'text-emerald-400' : 'text-rose-400'
                        }`}>
                          {fmtAmount(tx.amount, tx.currency, tx.type)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-slate-700/60 text-slate-300 rounded text-xs font-mono">
                            {tx.currency}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {tx.payment_scheme || <span className="text-slate-700">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 text-xs text-slate-400">
                <span>
                  Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} transactions
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span className="flex items-center px-3 py-1.5 text-slate-300">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="flex items-center gap-1 px-3 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
                  >
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
