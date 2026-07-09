import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, RefreshCcw, X } from 'lucide-react';
import { Company } from './types';

// ── Constants ────────────────────────────────────────────────────────────────

const GEO_OPTIONS = ['GCC', 'LATAM', 'Mixed'] as const;
type Geo = typeof GEO_OPTIONS[number];

const CATEGORY_OPTIONS = [
  'ACC Service providers','Aff comp','BOP',"BTW ACC's","BTW CMP's",'CC','CC Upload',
  'Client Deposit','Client WD','Fee','internal','LEG License expenses','Leq','Management',
  'Management - C','Management - I','MRKT Services','MRKT Services Tools','MRKT Spend',
  'MRKT Tools','Return','SAL IT','SAL Management','SAL MKT','Settlement','TECH Platforms',
  'TECH Tools','TK IB','Uruguay Team','VOIP','Wire Settlement','Salary Israel',
  "G&A (Israel)",'Management - T','TAX',
] as const;

const GEO_COLORS: Record<Geo, string> = {
  GCC:   'bg-sky-100 text-sky-700 border border-sky-200',
  LATAM: 'bg-amber-100 text-amber-700 border border-amber-200',
  Mixed: 'bg-violet-100 text-violet-700 border border-violet-200',
};

const CURRENCIES = ['ALL', 'EUR', 'GBP', 'USD', 'ILS', 'USDT'];

// Currency badge colours match the rest of the app.
const curBadge = (c: string) =>
  c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
  c === 'BTC' || c === 'ETH'  ? 'bg-orange-100 text-orange-700'   : 'bg-blue-100 text-blue-700';

// ── Types ─────────────────────────────────────────────────────────────────────

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
  geo: Geo | null;
  category: string | null;
}

interface ApiResponse {
  transactions: Transaction[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: { money_in: number; money_out: number; net_change: number; tx_count: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── ClassifyCell ─────────────────────────────────────────────────────────────
// Inline dropdown. Click chip/label to open, × to clear. Category has search.

function ClassifyCell<T extends string>({
  txId, field, value, options, colorMap, placeholder, onUpdate,
}: {
  txId: string;
  field: 'geo' | 'category';
  value: T | null;
  options: readonly T[];
  colorMap?: Record<string, string>;
  placeholder: string;
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

  const filtered = options.filter(o => o.toLowerCase().includes(query.toLowerCase()));
  const showSearch = options.length > 6;

  const handleSelect = async (next: string | null) => {
    setOpen(false);
    if (next === value) return;
    onUpdate(txId, field, next);        // optimistic
    setSaving(true);
    try {
      const r = await fetch(`/api/transactions/${txId}/classify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!r.ok) onUpdate(txId, field, value); // revert on error
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
                  value === opt
                    ? 'text-indigo-600 font-semibold bg-indigo-50'
                    : 'text-slate-700 hover:bg-slate-50'
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
  const [tab, setTab]               = useState<'banks' | 'psp'>('banks');
  const [companyId, setCompanyId]   = useState('');
  const [currency, setCurrency]     = useState('ALL');
  const [txType, setTxType]         = useState<'all' | 'credit' | 'debit'>('all');
  const [search, setSearch]         = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom]     = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [dateTo, setDateTo]         = useState(() => new Date().toISOString().slice(0, 10));
  const [page, setPage]             = useState(1);
  const [data, setData]             = useState<ApiResponse | null>(null);
  const [loading, setLoading]       = useState(false);
  const searchTimer                 = useRef<ReturnType<typeof setTimeout> | null>(null);

  const source = tab === 'banks' ? 'ifx' : 'rapyd';

  const fetchData = useCallback(async () => {
    if (tab === 'psp') return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ source, page: String(page), limit: '20', date_from: dateFrom, date_to: dateTo });
      if (companyId)          params.set('company_id', companyId);
      if (currency !== 'ALL') params.set('currency', currency);
      if (txType !== 'all')   params.set('type', txType);
      if (search)             params.set('search', search);
      const res = await fetch(`/api/transactions?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [tab, source, page, companyId, currency, txType, search, dateFrom, dateTo]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSearchInput = (v: string) => {
    setSearchInput(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setSearch(v); setPage(1); }, 400);
  };

  // Optimistic classification update — mutates local state without refetch
  const handleClassify = useCallback((id: string, field: 'geo' | 'category', value: string | null) => {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        transactions: prev.transactions.map(tx =>
          tx.id === id ? { ...tx, [field]: value } : tx
        ),
      };
    });
  }, []);

  const resetPage = () => setPage(1);
  const inputCls = "border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 bg-white outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";
  const labelCls = "text-slate-400 text-xs font-semibold uppercase tracking-wider";

  const { transactions = [], pagination, summary } = data || {};

  return (
    <div className="space-y-5">
      {/* Banks / Payment Providers toggle */}
      <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden text-sm font-semibold">
        {(['banks', 'psp'] as const).map(t => (
          <button
            key={t}
            onClick={() => { setTab(t); setPage(1); setData(null); }}
            className={`px-5 py-2 transition-colors ${tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            {t === 'banks' ? 'Banks' : 'Payment Providers'}
          </button>
        ))}
      </div>

      {tab === 'psp' ? (
        <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-12 text-center space-y-3">
          <div className="text-4xl">🔌</div>
          <p className="text-slate-900 font-semibold text-lg">Payment provider transactions coming soon.</p>
          <p className="text-slate-500 text-sm">PSP integration is currently being configured.</p>
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Company</label>
              <select value={companyId} onChange={e => { setCompanyId(e.target.value); resetPage(); }} className={`${inputCls} min-w-[140px]`}>
                <option value="">All Companies</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelCls}>Currency</label>
              <select value={currency} onChange={e => { setCurrency(e.target.value); resetPage(); }} className={inputCls}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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
                  type="text"
                  placeholder="Party name or reference…"
                  value={searchInput}
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
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm transition-colors"
            >
              <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* Summary cards */}
          {summary && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SummaryCard label="Money In" value={fmtMoney(summary.money_in)} sub={`${dateFrom} → ${dateTo}`} color="text-emerald-600" />
              <SummaryCard label="Money Out" value={fmtMoney(summary.money_out)} sub={`${dateFrom} → ${dateTo}`} color="text-red-600" />
              <SummaryCard label="Net Change" value={(summary.net_change >= 0 ? '+' : '') + fmtMoney(summary.net_change)} color={summary.net_change >= 0 ? 'text-emerald-600' : 'text-red-600'} />
              <SummaryCard label="Transactions" value={summary.tx_count.toLocaleString()} sub="matching filters" />
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-slate-200 shadow-sm rounded-xl overflow-hidden">
            {loading && !data ? (
              <div className="p-12 text-center text-slate-400 text-sm">Loading transactions…</div>
            ) : transactions.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm">No transactions found for the selected filters.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200">
                      {['Date', 'Description', 'Reference', 'Type', 'Amount', 'Currency', 'Scheme'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-indigo-500 whitespace-nowrap">GEO</th>
                      <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-indigo-500 whitespace-nowrap">Category</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map(tx => (
                      <tr key={tx.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(tx.transaction_date)}</td>
                        <td className="px-4 py-3 text-slate-800 max-w-[200px] truncate" title={tx.other_party || ''}>
                          {tx.other_party || <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-500 max-w-[240px]">
                          {tx.reference ? (
                            <span title={tx.reference} className="cursor-default">
                              {tx.reference.length > 60 ? tx.reference.slice(0, 60) + '…' : tx.reference}
                            </span>
                          ) : <span className="text-slate-300">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                            tx.type === 'credit' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                          }`}>
                            {tx.type === 'credit' ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}
                            {tx.type === 'credit' ? 'In' : 'Out'}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-mono font-semibold whitespace-nowrap ${
                          tx.type === 'credit' ? 'text-emerald-600' : 'text-red-600'
                        }`}>
                          {fmtAmount(tx.amount, tx.currency, tx.type)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${curBadge(tx.currency)}`}>
                            {tx.currency}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">
                          {tx.payment_scheme || <span className="text-slate-300">-</span>}
                        </td>

                        <td className="px-4 py-2">
                          <ClassifyCell
                            txId={tx.id} field="geo" value={tx.geo}
                            options={GEO_OPTIONS} colorMap={GEO_COLORS}
                            placeholder="GEO" onUpdate={handleClassify}
                          />
                        </td>

                        <td className="px-4 py-2">
                          <ClassifyCell
                            txId={tx.id} field="category" value={tx.category as any}
                            options={CATEGORY_OPTIONS} placeholder="Category"
                            onUpdate={handleClassify}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {pagination && pagination.total > 0 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 text-xs text-slate-500">
                <span>
                  Showing {((pagination.page - 1) * pagination.limit) + 1}-{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} transactions
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <span className="flex items-center px-3 py-1.5 text-slate-600">
                    {pagination.page} / {pagination.pages}
                  </span>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page >= pagination.pages}
                    className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 rounded-lg disabled:opacity-40 text-slate-600 hover:bg-slate-50 transition-colors"
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
