import { useState, useRef } from 'react';
import type { MouseEvent } from 'react';
import {
  LayoutDashboard,
  Wallet as WalletIcon,
  Bitcoin,
  Building2,
  Landmark,
  Coins,
  Table as TableIcon,
  BarChart3,
  TrendingUp,
  ShieldCheck,
} from 'lucide-react';
import { CreditCard } from 'lucide-react';
import { CURRENCY_SYMBOLS } from '../types';
import type { Company, PortfolioPoint, WidgetType } from '../types';
import { walletBalance, walletRate, buildCurrencyRateMap, settlementUsd, pendingSettlementSum } from '../PSPSection';

// ── Shared constants & formatters ───────────────────────────────────────────

const CRYPTO_CURRENCIES = new Set([
  'BTC', 'ETH', 'USDT', 'USDtb', 'USDC', 'TUSD', 'BUSD', 'DAI', 'PEPE', 'HEX',
  'SOL', 'BNB', 'XRP', 'LTC', 'MATIC', 'ADA', 'AVAX', 'DOT',
]);

const fmtUsd = (n: number) => {
  const neg = n < 0;
  return (neg ? '-$' : '$') + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};
const fmtN = (n: number) => {
  const s = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  return n < 0 ? `(${s})` : s;
};
const usdCls = (n: number) => (n < 0 ? 'text-red-600' : 'text-slate-800');
const currencyBadge = (c: string) =>
  c === 'USD' || c === 'USDT' ? 'bg-emerald-100 text-emerald-700' :
  c === 'BTC' || c === 'ETH' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700';

const bankIsVerified = (bank: any) =>
  bank.is_verified !== undefined
    ? (bank.is_verified === 1 || bank.is_verified === '1' || bank.is_verified === true)
    : (bank.isVerified === true || (bank.isVerified as any) === 1);

const walletsOf = (acc: any): any[] => {
  let wallets = acc.wallets || [];
  if (typeof wallets === 'string') { try { wallets = JSON.parse(wallets); } catch { wallets = []; } }
  return Array.isArray(wallets) ? wallets : [];
};

// Crypto/fiat split across every wallet (matches the original Asset Breakdown card).
function splitAssets(companies: Company[]) {
  let cryptoTotal = 0, fiatTotal = 0;
  companies.forEach(company => {
    (company.banks || []).forEach((bank: any) => {
      const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
      accounts.forEach(acc => walletsOf(acc).forEach(w => {
        const usd = Number(w.value_usd) || 0;
        if (CRYPTO_CURRENCIES.has(w.currency)) cryptoTotal += usd; else fiatTotal += usd;
      }));
    });
  });
  return { cryptoTotal, fiatTotal, grandTotalUsd: cryptoTotal + fiatTotal };
}

type FlatRow = { company: string; bank: string; currency: string; balance: number; fxRate: number; usdValue: number };

// Verified-bank aggregates (matches the original Portfolio Summary tables).
function aggregateVerified(companies: Company[]) {
  const rows: FlatRow[] = [];
  const byBank: Record<string, number> = {};
  const byCompany: Record<string, number> = {};
  const byCurrency: Record<string, number> = {};
  companies.forEach(company => {
    (company.banks || []).forEach((bank: any) => {
      if (!bankIsVerified(bank)) return;
      const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
      const cellMap: Record<string, { balance: number; usd: number }> = {};
      accounts.forEach(acc => walletsOf(acc).forEach(w => {
        const cur = w.currency || '?';
        if (!cellMap[cur]) cellMap[cur] = { balance: 0, usd: 0 };
        cellMap[cur].balance += Number(w.balance) || 0;
        cellMap[cur].usd += Number(w.value_usd) || 0;
      }));
      Object.entries(cellMap).forEach(([currency, cell]) => {
        const fxRate = cell.balance !== 0 ? cell.usd / cell.balance : 0;
        rows.push({ company: company.name, bank: bank.name, currency, balance: cell.balance, fxRate, usdValue: cell.usd });
        byBank[bank.name] = (byBank[bank.name] || 0) + cell.usd;
        byCompany[company.name] = (byCompany[company.name] || 0) + cell.usd;
        byCurrency[currency] = (byCurrency[currency] || 0) + cell.usd;
      });
    });
  });
  const grandTotal = rows.reduce((s, r) => s + r.usdValue, 0);
  return { rows, byBank, byCompany, byCurrency, grandTotal };
}

// ── Sparkline (relocated from App.tsx, unchanged) ───────────────────────────

export interface SparkPoint { date: string; value: number; }

export const SparklineChart = ({
  data, color, gradId, height = 36, dark = false, fmtVal,
}: {
  data: SparkPoint[];
  color: string;
  gradId: string;
  height?: number;
  dark?: boolean;
  fmtVal: (n: number) => string;
}) => {
  const [tip, setTip] = useState<{ px: number; py: number; date: string; val: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const W = 320;
  const todayStr = new Date().toISOString().slice(0, 10);

  const fallback: SparkPoint[] = data.length >= 2 ? data : [
    { date: '', value: 20 }, { date: '', value: 30 }, { date: '', value: 25 },
    { date: '', value: 40 }, { date: '', value: 35 }, { date: '', value: 50 },
    { date: '', value: 45 }, { date: '', value: 60 }, { date: '', value: 55 },
    { date: '', value: 70 },
  ];
  const pts_raw = fallback;
  const vals = pts_raw.map(d => d.value);
  const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
  const pts = pts_raw.map((d, i) => ({
    x: (i / (pts_raw.length - 1)) * W,
    y: height - ((d.value - mn) / rng) * height * 0.75 - height * 0.1,
    date: d.date,
    val: d.value,
    isToday: d.date === todayStr,
  }));

  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${W} ${height} L 0 ${height} Z`;

  const handleEnter = (p: typeof pts[0]) => (e: MouseEvent<SVGCircleElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = rect.width / W;
    const scaleY = rect.height / height;
    setTip({ px: p.x * scaleX, py: p.y * scaleY, date: p.date, val: p.val });
  };

  return (
    <div className="relative" onMouseLeave={() => setTip(null)}>
      <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={dark ? '0.4' : '0.25'} />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth={dark ? '2' : '1.8'} strokeLinecap="round" strokeLinejoin="round" />
        {pts.map((p, i) => (
          <g key={i}>
            {p.date && (
              <>
                {p.isToday && <circle cx={p.x} cy={p.y} r={dark ? 7 : 6} fill={color} opacity={0.2} />}
                <circle
                  cx={p.x} cy={p.y}
                  r={p.isToday ? (dark ? 5 : 4) : (dark ? 3 : 2.5)}
                  fill={p.isToday ? (dark ? '#ffffff' : color) : (dark ? '#a5b4fc' : color)}
                  opacity={p.isToday ? 1 : 0.7}
                />
              </>
            )}
            <circle cx={p.x} cy={p.y} r={10} fill="transparent"
              onMouseEnter={p.date ? handleEnter(p) : undefined}
              style={{ cursor: p.date ? 'crosshair' : 'default' }} />
          </g>
        ))}
      </svg>
      {tip && tip.date && (
        <div
          className={`absolute z-20 pointer-events-none rounded-lg px-2.5 py-1.5 shadow-xl text-xs whitespace-nowrap ${dark ? 'bg-white text-slate-800' : 'bg-slate-800 text-white'}`}
          style={{ left: tip.px, top: tip.py, transform: 'translate(-50%, -120%)' }}
        >
          <p className="font-bold mb-0.5">{tip.date === todayStr ? `${tip.date} (Today)` : tip.date}</p>
          <p className="font-mono">{fmtVal(tip.val)}</p>
          <div className={`absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent ${dark ? 'border-t-white' : 'border-t-slate-800'}`} />
        </div>
      )}
    </div>
  );
};

// Build the three sparkline series from the global portfolio history.
const sparkSeries = (history: PortfolioPoint[]) => {
  const has = history.length >= 2;
  return {
    fiat: has ? history.map(d => ({ date: d.date, value: d.fiat })) : [],
    crypto: has ? history.map(d => ({ date: d.date, value: d.crypto })) : [],
    total: has ? history.map(d => ({ date: d.date, value: d.total })) : [],
  };
};

// ── Widget building blocks ──────────────────────────────────────────────────

const EmptyState = ({ label }: { label: string }) => (
  <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
    <LayoutDashboard size={22} className="mb-2 text-slate-300" />
    <p className="text-xs font-medium">{label}</p>
  </div>
);

const AssetBreakdownWidget = ({ companies, history }: { companies: Company[]; history: PortfolioPoint[] }) => {
  const { cryptoTotal, fiatTotal, grandTotalUsd } = splitAssets(companies);
  const cx = 100, cy = 100, r = 76, sw = 18;
  const circ = 2 * Math.PI * r;
  const absTotal = Math.abs(cryptoTotal) + Math.abs(fiatTotal) || 1;
  const cryptoRatio = Math.abs(cryptoTotal) / absTotal;
  const fiatRatio = Math.abs(fiatTotal) / absTotal;
  const cryptoPct = Math.round(cryptoRatio * 100);
  const fiatPct = 100 - cryptoPct;
  const spark = sparkSeries(history);

  return (
    <div className="flex flex-col lg:flex-row h-full divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
      <div className="flex flex-col items-center lg:items-start gap-4 p-5 lg:w-[40%]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-lg shrink-0 bg-indigo-600 shadow-indigo-600/20">
            <LayoutDashboard size={16} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 leading-tight">Asset Breakdown</h3>
            <p className="text-[11px] text-slate-400 font-medium">Crypto vs fiat</p>
          </div>
        </div>
        <svg width={180} height={180} viewBox="0 0 200 200" className="mx-auto">
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#6366f1" strokeWidth={sw} strokeDasharray={`${cryptoRatio * circ} ${circ}`} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="#93c5fd" strokeWidth={sw} strokeDasharray={`${fiatRatio * circ} ${circ}`} strokeDashoffset={`${-cryptoRatio * circ}`} />
          </g>
          <text x={cx} y={cy - 14} textAnchor="middle" fontSize="8" fontWeight="700" fill="#94a3b8" letterSpacing="0.8">TOTAL PORTFOLIO</text>
          <text x={cx} y={cy + 6} textAnchor="middle" fontSize="16" fontWeight="800" fill="#1e293b">{fmtUsd(grandTotalUsd)}</text>
        </svg>
        <div className="flex flex-col gap-2 w-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Crypto</span>
            </div>
            <div className="text-right">
              <span className="text-sm font-bold font-mono text-slate-800">{fmtUsd(cryptoTotal)}</span>
              <span className="text-[10px] text-indigo-400 font-bold ml-1.5">{cryptoPct}%</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-sky-300 shrink-0" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Fiat</span>
            </div>
            <div className="text-right">
              <span className={`text-sm font-bold font-mono ${fiatTotal < 0 ? 'text-red-500' : 'text-slate-800'}`}>{fmtUsd(fiatTotal)}</span>
              <span className="text-[10px] text-sky-400 font-bold ml-1.5">{fiatPct}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 p-5 flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-100 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0">
                <WalletIcon size={14} className="text-indigo-600" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fiat (USD)</p>
            </div>
            <p className={`text-xl font-bold font-mono leading-none ${fiatTotal < 0 ? 'text-red-500' : 'text-slate-900'}`}>{fmtUsd(fiatTotal)}</p>
            <SparklineChart data={spark.fiat} color="#6366f1" gradId="gradFiatW" height={36} fmtVal={fmtUsd} />
          </div>
          <div className="bg-slate-100 rounded-xl p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center shrink-0">
                <Bitcoin size={14} className="text-sky-500" />
              </div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Crypto (USD)</p>
            </div>
            <p className={`text-xl font-bold font-mono leading-none ${cryptoTotal < 0 ? 'text-red-500' : 'text-slate-900'}`}>{fmtUsd(cryptoTotal)}</p>
            <SparklineChart data={spark.crypto} color="#38bdf8" gradId="gradCryptoW" height={36} fmtVal={fmtUsd} />
          </div>
        </div>
        <div className="relative bg-[#1a1a2e] rounded-xl p-4 overflow-hidden flex-1 min-h-[110px]">
          <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Total Portfolio (USD)</p>
          <p className={`text-3xl font-bold font-mono leading-none mb-1 ${grandTotalUsd < 0 ? 'text-red-400' : 'text-white'}`}>{fmtUsd(grandTotalUsd)}</p>
          <div className="absolute bottom-0 left-0 right-0 h-16">
            <SparklineChart data={spark.total} color="#a5b4fc" gradId="gradTotalW" height={64} dark fmtVal={fmtUsd} />
          </div>
        </div>
      </div>
    </div>
  );
};

const TotalPortfolioWidget = ({ companies, history }: { companies: Company[]; history: PortfolioPoint[] }) => {
  const { grandTotalUsd } = splitAssets(companies);
  const spark = sparkSeries(history);
  return (
    <div className="relative h-full bg-[#1a1a2e] p-5 overflow-hidden flex flex-col justify-center">
      <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-1">Total Portfolio (USD)</p>
      <p className={`text-4xl font-bold font-mono leading-none ${grandTotalUsd < 0 ? 'text-red-400' : 'text-white'}`}>{fmtUsd(grandTotalUsd)}</p>
      <div className="absolute bottom-0 left-0 right-0 h-20">
        <SparklineChart data={spark.total} color="#a5b4fc" gradId="gradTotalKpi" height={80} dark fmtVal={fmtUsd} />
      </div>
    </div>
  );
};

const SummaryTableWidget = ({ companies, groupBy, title }: { companies: Company[]; groupBy: 'bank' | 'company' | 'currency'; title: string }) => {
  const agg = aggregateVerified(companies);
  const data = groupBy === 'bank' ? agg.byBank : groupBy === 'company' ? agg.byCompany : agg.byCurrency;
  const entries = Object.entries(data);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (!entries.length) return <EmptyState label="No verified balances" />;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 shrink-0">
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <tbody>
            {entries.map(([label, usd]) => (
              <tr key={label} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-600 font-medium">{label}</td>
                <td className={`px-4 py-2.5 text-right font-mono font-bold ${usdCls(usd)}`}>{fmtUsd(usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table className="w-full text-xs shrink-0">
        <tfoot>
          <tr className="bg-indigo-50 border-t border-indigo-100">
            <td className="px-4 py-2.5 font-bold text-indigo-700 uppercase text-[10px] tracking-widest">Total</td>
            <td className={`px-4 py-2.5 text-right font-mono font-bold text-sm ${usdCls(total)}`}>{fmtUsd(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
};

const PortfolioTableWidget = ({ companies }: { companies: Company[] }) => {
  // Optional per-company filter tabs (All + each company) for easier switching.
  const [tab, setTab] = useState<string>('all');
  const scoped = tab === 'all' ? companies : companies.filter(c => c.id === tab);
  const { rows, grandTotal } = aggregateVerified(scoped);
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <WalletIcon size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Portfolio Summary</h3>
      </div>
      {companies.length > 1 && (
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-slate-200 overflow-x-auto shrink-0">
          <button
            onClick={() => setTab('all')}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === 'all' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            All
          </button>
          {companies.map(c => (
            <button
              key={c.id}
              onClick={() => setTab(c.id)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors ${tab === c.id ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {!rows.length ? <EmptyState label="No verified balances" /> : (
      <>
      {/* Only the rows scroll; the Total below stays pinned. */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[640px]">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0">
            <tr>
              <th className="px-5 py-3 border-b border-slate-100">Company</th>
              <th className="px-5 py-3 border-b border-slate-100">Bank</th>
              <th className="px-5 py-3 border-b border-slate-100">Currency</th>
              <th className="px-5 py-3 border-b border-slate-100 text-right">Balance</th>
              <th className="px-5 py-3 border-b border-slate-100 text-right">FX Rate</th>
              <th className="px-5 py-3 border-b border-slate-100 text-right">USD Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td className="px-5 py-3 font-medium text-slate-700">{row.company}</td>
                <td className="px-5 py-3 text-slate-600">{row.bank}</td>
                <td className="px-5 py-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${currencyBadge(row.currency)}`}>{row.currency}</span></td>
                <td className={`px-5 py-3 text-right font-mono ${row.balance < 0 ? 'text-red-600' : 'text-slate-700'}`}>{CURRENCY_SYMBOLS[row.currency] || ''}{fmtN(row.balance)}</td>
                <td className="px-5 py-3 text-right font-mono text-slate-500">{row.fxRate !== 0 ? row.fxRate.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 4 }) : '-'}</td>
                <td className={`px-5 py-3 text-right font-mono font-bold ${usdCls(row.usdValue)}`}>{fmtUsd(row.usdValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pinned total bar (outside the scroll area) */}
      <div className="shrink-0 flex items-center justify-between px-5 py-3 border-t-2 border-indigo-100 bg-indigo-50">
        <span className="font-bold text-indigo-700 uppercase text-[11px] tracking-widest">Total</span>
        <span className={`font-mono font-bold text-sm ${usdCls(grandTotal)}`}>{fmtUsd(grandTotal)}</span>
      </div>
      </>
      )}
    </div>
  );
};

const CompanyDetailWidget = ({ companies }: { companies: Company[] }) => {
  // When several companies are in scope, show a tab bar (like the Companies page);
  // when only one, it's just that company.
  const [activeIdx, setActiveIdx] = useState(0);
  if (!companies.length) return <EmptyState label="Assign a company" />;
  const idx = Math.min(activeIdx, companies.length - 1);
  const company = companies[idx];
  // Group by bank: the first wallet of a bank carries the bank name + verified + sync,
  // subsequent wallets show "↳ Continued" - matching the Companies page detail.
  const rows: { bankName: string; sync?: string; account: string; balance: number; currency: string; usd: number | null; first: boolean }[] = [];
  (company.banks || []).forEach((bank: any) => {
    if (!bankIsVerified(bank)) return;
    const accounts = (bank.bank_accounts || bank.accounts || []) as any[];
    let first = true;
    accounts.forEach(acc => walletsOf(acc).forEach(w => {
      const usdVal = w.value_usd ?? w.usd_value ?? w.valueUsd ?? w.usdValue;
      const usd = (usdVal !== undefined && usdVal !== null && Number(usdVal) !== 0) ? Number(usdVal) : null;
      rows.push({ bankName: bank.name, sync: bank.last_modified_date, account: acc.account_number || acc.accountNumber || '', balance: Number(w.balance) || 0, currency: w.currency, usd, first });
      first = false;
    }));
  });
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {companies.length > 1 && (
        <div className="flex items-center gap-1 px-3 pt-2 border-b border-slate-200 overflow-x-auto shrink-0">
          {companies.map((c, i) => (
            <button
              key={c.id}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap border-b-2 -mb-px transition-colors ${i === idx ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <div className="w-1.5 h-6 bg-indigo-600 rounded-full" />
        <h3 className="text-base font-bold text-slate-800 tracking-tight truncate">{company.name}</h3>
      </div>
      <div className="flex-1 overflow-auto">
        {rows.length === 0 ? <EmptyState label="No verified balances" /> : (
          <table className="w-full text-left border-collapse min-w-[480px] text-sm">
            <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0">
              <tr>
                <th className="px-5 py-3 border-b border-slate-100">Bank</th>
                <th className="px-5 py-3 border-b border-slate-100 text-right">Wallets</th>
                <th className="px-5 py-3 border-b border-slate-100 text-right">Balance (LCY)</th>
                <th className="px-5 py-3 border-b border-slate-100 text-right">Currency</th>
                <th className="px-5 py-3 border-b border-slate-100 text-right">USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3">
                    {r.first ? (
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{r.bankName}</span>
                          <ShieldCheck size={12} className="text-emerald-500 shrink-0" />
                        </div>
                        {r.sync && <span className="text-[9px] text-indigo-500 font-bold uppercase mt-0.5 tracking-tight">Sync: {r.sync}</span>}
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-300 font-medium ml-2">↳ Continued</div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right text-slate-500 text-xs font-mono">{r.account}</td>
                  <td className={`px-5 py-3 text-right font-mono ${r.balance < 0 ? 'text-red-600' : 'text-slate-900'}`}>{CURRENCY_SYMBOLS[r.currency] || ''}{fmtN(r.balance)}</td>
                  <td className="px-5 py-3 text-right"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${currencyBadge(r.currency)}`}>{r.currency}</span></td>
                  <td className={`px-5 py-3 text-right font-mono font-bold ${r.usd === null ? 'text-slate-300' : usdCls(r.usd)}`}>{r.usd === null ? '-' : fmtUsd(r.usd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// ── Chart widgets ───────────────────────────────────────────────────────────

const BarChartWidget = ({ companies, groupBy, title }: { companies: Company[]; groupBy: 'bank' | 'company' | 'currency'; title: string }) => {
  const agg = aggregateVerified(companies);
  const data = groupBy === 'bank' ? agg.byBank : groupBy === 'company' ? agg.byCompany : agg.byCurrency;
  const entries = Object.entries(data).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const max = Math.max(...entries.map(([, v]) => Math.abs(v)), 1);
  if (!entries.length) return <EmptyState label="No verified balances" />;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
        <BarChart3 size={14} className="text-indigo-500" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="flex-1 flex items-end gap-2 px-4 pt-6 pb-2 overflow-x-auto">
        {entries.map(([label, usd]) => {
          const neg = usd < 0;
          const pct = Math.max((Math.abs(usd) / max) * 100, 1.5);
          return (
            <div key={label} className="flex-1 min-w-[44px] h-full flex flex-col">
              <div className="flex-1 flex flex-col justify-end items-center gap-1">
                <span className={`text-[10px] font-mono font-bold whitespace-nowrap ${neg ? 'text-red-600' : 'text-slate-700'}`}>{fmtUsd(usd)}</span>
                <div
                  className={`w-full max-w-[52px] rounded-t-md ${neg ? 'bg-gradient-to-t from-red-500 to-red-300' : 'bg-gradient-to-t from-indigo-600 to-indigo-400'}`}
                  style={{ height: `${pct}%` }}
                  title={`${label}: ${fmtUsd(usd)}`}
                />
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 w-full text-center truncate" title={label}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const TrendChartWidget = ({ companies, history }: { companies: Company[]; history: PortfolioPoint[] }) => {
  const { grandTotalUsd } = splitAssets(companies);
  const spark = sparkSeries(history);
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 shrink-0 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-indigo-500" />
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Portfolio Trend</p>
        </div>
        <span className="text-sm font-bold font-mono text-slate-800">{fmtUsd(grandTotalUsd)}</span>
      </div>
      <div className="flex-1 flex items-center px-2 pb-2">
        <SparklineChart data={spark.total} color="#6366f1" gradId="gradTrendW" height={200} fmtVal={fmtUsd} />
      </div>
    </div>
  );
};

// ── Payment Providers widgets ───────────────────────────────────────────────

type PspRow = { companyName: string; providerName: string; currency: string; balanceUsd: number; settlementUsd: number };

function pspRows(companies: Company[]): PspRow[] {
  const rates = buildCurrencyRateMap(companies);
  const rows: PspRow[] = [];
  companies.forEach(company => {
    const settlements = company.psp_settlements || [];
    (company.psp_providers || []).forEach(provider => {
      (provider.ewallets || []).forEach(ew => {
        (ew.wallets || []).forEach(w => {
          const rate = walletRate(w);
          const settlementNative = pendingSettlementSum(settlements, ew.id, w.currency);
          rows.push({
            companyName: company.name,
            providerName: provider.name,
            currency: w.currency,
            balanceUsd: walletBalance(w) * rate,
            settlementUsd: settlementUsd(settlementNative, w.currency, rates),
          });
        });
      });
    });
  });
  return rows;
}

const PspTotalWidget = ({ companies }: { companies: Company[] }) => {
  const rows = pspRows(companies);
  const balance = rows.reduce((s, r) => s + r.balanceUsd, 0);
  const settlement = rows.reduce((s, r) => s + r.settlementUsd, 0);
  return (
    <div className="relative h-full bg-[#1a1a2e] p-5 overflow-hidden flex flex-col justify-center gap-3">
      <div className="flex items-center gap-2">
        <CreditCard size={14} className="text-indigo-300" />
        <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest">Payment Providers</p>
      </div>
      <div>
        <p className="text-[10px] font-bold text-indigo-300/70 uppercase tracking-widest">Total Exposure (USD)</p>
        <p className={`text-3xl font-bold font-mono leading-none ${balance + settlement < 0 ? 'text-red-400' : 'text-white'}`}>{fmtUsd(balance + settlement)}</p>
      </div>
      <div className="flex items-center gap-5 text-xs">
        <div><span className="text-indigo-300/70">Balance</span> <span className="font-mono font-bold text-white">{fmtUsd(balance)}</span></div>
        <div><span className="text-indigo-300/70">Settlement</span> <span className="font-mono font-bold text-emerald-300">{fmtUsd(settlement)}</span></div>
      </div>
    </div>
  );
};

const PspBarWidget = ({ companies, groupBy, title }: { companies: Company[]; groupBy: 'providerName' | 'currency'; title: string }) => {
  const rows = pspRows(companies);
  const map: Record<string, number> = {};
  rows.forEach(r => { map[r[groupBy]] = (map[r[groupBy]] || 0) + r.balanceUsd; });
  const entries = Object.entries(map).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const max = Math.max(...entries.map(([, v]) => Math.abs(v)), 1);
  if (!entries.length) return <EmptyState label="No PSP balances" />;
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-4 py-3 border-b border-slate-100 shrink-0 flex items-center gap-2">
        <CreditCard size={14} className="text-indigo-500" />
        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{title}</p>
      </div>
      <div className="flex-1 flex items-end gap-2 px-4 pt-6 pb-2 overflow-x-auto">
        {entries.map(([label, usd]) => {
          const neg = usd < 0;
          const pct = Math.max((Math.abs(usd) / max) * 100, 1.5);
          return (
            <div key={label} className="flex-1 min-w-[44px] h-full flex flex-col">
              <div className="flex-1 flex flex-col justify-end items-center gap-1">
                <span className={`text-[10px] font-mono font-bold whitespace-nowrap ${neg ? 'text-red-600' : 'text-slate-700'}`}>{fmtUsd(usd)}</span>
                <div className={`w-full max-w-[52px] rounded-t-md ${neg ? 'bg-gradient-to-t from-red-500 to-red-300' : 'bg-gradient-to-t from-indigo-600 to-indigo-400'}`} style={{ height: `${pct}%` }} title={`${label}: ${fmtUsd(usd)}`} />
              </div>
              <span className="text-[10px] text-slate-500 mt-1.5 w-full text-center truncate" title={label}>{label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const PspSummaryWidget = ({ companies }: { companies: Company[] }) => {
  const rows = pspRows(companies);
  if (!rows.length) return <EmptyState label="No PSP balances" />;
  const total = rows.reduce((s, r) => s + r.balanceUsd + r.settlementUsd, 0);
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="bg-slate-50/80 px-6 py-4 border-b border-slate-200 flex items-center gap-3 shrink-0">
        <CreditCard size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">PSP Summary</h3>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-collapse text-xs min-w-[560px]">
          <thead className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0">
            <tr>
              <th className="px-5 py-3 border-b border-slate-100">Company</th>
              <th className="px-5 py-3 border-b border-slate-100">Acquirer</th>
              <th className="px-5 py-3 border-b border-slate-100">Currency</th>
              <th className="px-5 py-3 border-b border-slate-100 text-right">Balance</th>
              <th className="px-5 py-3 border-b border-slate-100 text-right">Exposure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                <td className="px-5 py-3 font-medium text-slate-700">{r.companyName}</td>
                <td className="px-5 py-3 text-slate-600">{r.providerName}</td>
                <td className="px-5 py-3"><span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${currencyBadge(r.currency)}`}>{r.currency}</span></td>
                <td className={`px-5 py-3 text-right font-mono ${usdCls(r.balanceUsd)}`}>{fmtUsd(r.balanceUsd)}</td>
                <td className={`px-5 py-3 text-right font-mono font-bold ${usdCls(r.balanceUsd + r.settlementUsd)}`}>{fmtUsd(r.balanceUsd + r.settlementUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-indigo-50 border-t-2 border-indigo-100">
              <td colSpan={4} className="px-5 py-3 font-bold text-indigo-700 uppercase text-[11px] tracking-widest">Total Exposure</td>
              <td className={`px-5 py-3 text-right font-mono font-bold text-sm ${usdCls(total)}`}>{fmtUsd(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

// ── Registry + dispatcher ───────────────────────────────────────────────────

export interface WidgetMeta {
  type: WidgetType;
  label: string;
  description: string;
  icon: typeof LayoutDashboard;
  defaultW: number;  // grid columns (of 12)
  defaultH: number;  // grid rows
  singleCompany?: boolean;
}

export const WIDGET_REGISTRY: WidgetMeta[] = [
  { type: 'asset-breakdown', label: 'Asset Breakdown', description: 'Crypto vs fiat donut + totals', icon: LayoutDashboard, defaultW: 8, defaultH: 4 },
  { type: 'summary-by-bank', label: 'By Bank', description: 'USD totals grouped by bank', icon: Landmark, defaultW: 4, defaultH: 3 },
  { type: 'summary-by-company', label: 'By Company', description: 'USD totals grouped by company', icon: Building2, defaultW: 4, defaultH: 3 },
  { type: 'summary-by-currency', label: 'By Currency', description: 'USD totals grouped by currency', icon: Coins, defaultW: 4, defaultH: 3 },
  { type: 'portfolio-table', label: 'Portfolio Table', description: 'Full company / bank / currency table', icon: TableIcon, defaultW: 12, defaultH: 4 },
  { type: 'company-detail', label: 'Company Detail', description: 'One company\'s bank balances', icon: Building2, defaultW: 6, defaultH: 4, singleCompany: true },
  { type: 'chart-trend', label: 'Portfolio Trend', description: 'Total portfolio over time (chart)', icon: TrendingUp, defaultW: 6, defaultH: 3 },
  { type: 'chart-by-bank', label: 'By Bank (chart)', description: 'USD by bank (bar chart)', icon: BarChart3, defaultW: 4, defaultH: 4 },
  { type: 'chart-by-company', label: 'By Company (chart)', description: 'USD by company (bar chart)', icon: BarChart3, defaultW: 4, defaultH: 4 },
  { type: 'chart-by-currency', label: 'By Currency (chart)', description: 'USD by currency (bar chart)', icon: BarChart3, defaultW: 4, defaultH: 4 },
  { type: 'psp-total', label: 'PSP Exposure', description: 'Payment-provider balance + settlement', icon: CreditCard, defaultW: 4, defaultH: 2 },
  { type: 'psp-summary', label: 'PSP Summary', description: 'Provider balances per company', icon: CreditCard, defaultW: 8, defaultH: 4 },
  { type: 'psp-by-acquirer', label: 'PSP by Acquirer', description: 'PSP USD by acquirer (bar chart)', icon: CreditCard, defaultW: 4, defaultH: 4 },
  { type: 'psp-by-currency', label: 'PSP by Currency', description: 'PSP USD by currency (bar chart)', icon: CreditCard, defaultW: 4, defaultH: 4 },
];

// Null-safe: some saved layouts reference retired widget types (e.g. 'total-portfolio',
// kept renderable in WidgetView but dropped from the registry). Return a generic fallback
// meta so edit-mode label/icon lookups never throw and blank the dashboard.
export const widgetMeta = (type: WidgetType): WidgetMeta =>
  WIDGET_REGISTRY.find(w => w.type === type) ??
  { type, label: 'Widget', description: '', icon: LayoutDashboard, defaultW: 4, defaultH: 3 };

export function WidgetView({ type, companies, history }: { type: WidgetType; companies: Company[]; history: PortfolioPoint[] }) {
  switch (type) {
    case 'asset-breakdown': return <AssetBreakdownWidget companies={companies} history={history} />;
    case 'total-portfolio': return <TotalPortfolioWidget companies={companies} history={history} />;
    case 'summary-by-bank': return <SummaryTableWidget companies={companies} groupBy="bank" title="By Bank" />;
    case 'summary-by-company': return <SummaryTableWidget companies={companies} groupBy="company" title="By Company" />;
    case 'summary-by-currency': return <SummaryTableWidget companies={companies} groupBy="currency" title="By Currency" />;
    case 'portfolio-table': return <PortfolioTableWidget companies={companies} />;
    case 'company-detail': return <CompanyDetailWidget companies={companies} />;
    case 'chart-trend': return <TrendChartWidget companies={companies} history={history} />;
    case 'chart-by-bank': return <BarChartWidget companies={companies} groupBy="bank" title="By Bank" />;
    case 'chart-by-company': return <BarChartWidget companies={companies} groupBy="company" title="By Company" />;
    case 'chart-by-currency': return <BarChartWidget companies={companies} groupBy="currency" title="By Currency" />;
    case 'psp-total': return <PspTotalWidget companies={companies} />;
    case 'psp-summary': return <PspSummaryWidget companies={companies} />;
    case 'psp-by-acquirer': return <PspBarWidget companies={companies} groupBy="providerName" title="PSP by Acquirer" />;
    case 'psp-by-currency': return <PspBarWidget companies={companies} groupBy="currency" title="PSP by Currency" />;
    default: return <EmptyState label="Unknown widget" />;
  }
}
