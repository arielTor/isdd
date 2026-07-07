import { useState } from 'react';
import { CreditCard, Info, RefreshCcw, Globe, Download } from 'lucide-react';
import { Company } from './types';
import { downloadExcel } from './exportCsv';
import PSPSection, {
  fmtUsd,
  walletBalance,
  walletTransactions,
  walletRollingReserve,
  walletRate,
  buildCurrencyRateMap,
  settlementUsd,
  pendingSettlementSum,
} from './PSPSection';

type Row = {
  companyName: string;
  providerName: string;
  currency: string;
  transactionsUsd: number;
  reserveUsd: number;
  balanceUsd: number;
  settlementUsd: number;
};

function buildRows(companies: Company[]): Row[] {
  const rates = buildCurrencyRateMap(companies);
  const rows: Row[] = [];

  companies.forEach(company => {
    const settlements = company.psp_settlements || [];
    (company.psp_providers || []).forEach(provider => {
      provider.ewallets.forEach(ew => {
        ew.wallets.forEach(w => {
          const rate = walletRate(w);
          const settlementNative = pendingSettlementSum(settlements, ew.id, w.currency);
          rows.push({
            companyName: company.name,
            providerName: provider.name,
            currency: w.currency,
            transactionsUsd: walletTransactions(w) * rate,
            reserveUsd: walletRollingReserve(w) * rate,
            balanceUsd: walletBalance(w) * rate,
            settlementUsd: settlementUsd(settlementNative, w.currency, rates),
          });
        });
      });
    });
  });

  return rows;
}

function next7DaysCashIn(companies: Company[]) {
  const rates = buildCurrencyRateMap(companies);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    return { date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), amountUsd: 0 };
  });
  companies.forEach(c => (c.psp_settlements || []).forEach(s => {
    if (s.status !== 'PENDING' || !s.paymentDate) return;
    const day = days.find(d => d.date === s.paymentDate);
    if (day) day.amountUsd += settlementUsd(s.amount, s.currency, rates);
  }));
  return days;
}

function groupBy(rows: Row[], key: 'companyName' | 'providerName' | 'currency') {
  const map: Record<string, { transactionsUsd: number; reserveUsd: number; balanceUsd: number; settlementUsd: number }> = {};
  rows.forEach(r => {
    const k = r[key];
    if (!map[k]) map[k] = { transactionsUsd: 0, reserveUsd: 0, balanceUsd: 0, settlementUsd: 0 };
    map[k].transactionsUsd += r.transactionsUsd;
    map[k].reserveUsd += r.reserveUsd;
    map[k].balanceUsd += r.balanceUsd;
    map[k].settlementUsd += r.settlementUsd;
  });
  return map;
}

const BreakdownTable = ({ title, data }: { title: string; data: Record<string, { transactionsUsd: number; reserveUsd: number; balanceUsd: number; settlementUsd: number }> }) => {
  const entries = Object.entries(data);
  const totals = entries.reduce((acc, [, v]) => ({
    transactionsUsd: acc.transactionsUsd + v.transactionsUsd,
    reserveUsd: acc.reserveUsd + v.reserveUsd,
    balanceUsd: acc.balanceUsd + v.balanceUsd,
    settlementUsd: acc.settlementUsd + v.settlementUsd,
  }), { transactionsUsd: 0, reserveUsd: 0, balanceUsd: 0, settlementUsd: 0 });

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex-1 min-w-[260px]">
      <div className="px-4 py-3 border-b border-slate-100 text-xs font-bold text-slate-700 uppercase tracking-wide">{title}</div>
      {/* Rows scroll past ~10; the sticky Total row stays pinned at the bottom. */}
      <div className="overflow-auto max-h-[360px]">
        <table className="w-full text-xs">
          <thead className="text-slate-400 bg-slate-100 sticky top-0 z-10">
            <tr>
              <th className="text-left px-4 py-2 font-bold">{title.replace('By ', '')}</th>
              <th className="text-right px-2 py-2 font-bold">Transactions</th>
              <th className="text-right px-2 py-2 font-bold">Reserve</th>
              <th className="text-right px-2 py-2 font-bold">Total</th>
              <th className="text-right px-2 py-2 font-bold">Settl.</th>
              <th className="text-right px-4 py-2 font-bold">Exposure</th>
            </tr>
          </thead>
          <tbody className="text-slate-700">
            {entries.map(([name, v]) => (
              <tr key={name} className="border-t border-slate-50">
                <td className="px-4 py-2 font-medium whitespace-nowrap">{name}</td>
                <td className={`text-right px-2 py-2 font-mono ${v.transactionsUsd < 0 ? 'text-red-600' : ''}`}>{fmtUsd(v.transactionsUsd)}</td>
                <td className="text-right px-2 py-2 font-mono">{fmtUsd(v.reserveUsd)}</td>
                <td className={`text-right px-2 py-2 font-mono ${v.balanceUsd < 0 ? 'text-red-600' : ''}`}>{fmtUsd(v.balanceUsd)}</td>
                <td className={`text-right px-2 py-2 font-mono ${v.settlementUsd === 0 ? 'text-slate-400' : 'text-emerald-600'}`}>{fmtUsd(v.settlementUsd)}</td>
                <td className={`text-right px-4 py-2 font-mono font-bold ${(v.balanceUsd + v.settlementUsd) < 0 ? 'text-red-600' : ''}`}>{fmtUsd(v.balanceUsd + v.settlementUsd)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-indigo-200 font-bold text-indigo-700 [&>td]:sticky [&>td]:bottom-0 [&>td]:bg-slate-100">
              <td className="px-4 py-2">Total</td>
              <td className="text-right px-2 py-2 font-mono">{fmtUsd(totals.transactionsUsd)}</td>
              <td className="text-right px-2 py-2 font-mono">{fmtUsd(totals.reserveUsd)}</td>
              <td className="text-right px-2 py-2 font-mono">{fmtUsd(totals.balanceUsd)}</td>
              <td className="text-right px-2 py-2 font-mono">{fmtUsd(totals.settlementUsd)}</td>
              <td className="text-right px-4 py-2 font-mono">{fmtUsd(totals.balanceUsd + totals.settlementUsd)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

const PSPPage = ({
  companies, onSync, isSyncing,
  historyDate = '', isHistoricalMode = false, lastSynced = '', onDateChange, todayStr = '',
}: {
  companies: Company[];
  onSync?: () => void;
  isSyncing?: boolean;
  historyDate?: string;
  isHistoricalMode?: boolean;
  lastSynced?: string;
  onDateChange?: (date: string) => void;
  todayStr?: string;
}) => {
  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(null);
  const companiesWithPsp = companies.filter(c => (c.psp_providers || []).length > 0);

  if (companiesWithPsp.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 text-center">
        <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-100">
          <CreditCard size={24} className="text-slate-300" />
        </div>
        <h4 className="text-slate-900 font-bold text-lg">No Payment Providers Connected</h4>
        <p className="text-slate-500 text-sm max-w-sm mx-auto mt-2">
          Once a company has a PSP integration (e.g. Rapyd) synced into the database, it will appear here.
        </p>
      </div>
    );
  }

  // "View All" (null) aggregates every company; otherwise scope to the selected one.
  const activeValid = !!activeCompanyId && companiesWithPsp.some(c => c.id === activeCompanyId);
  const scoped = activeValid ? companiesWithPsp.filter(c => c.id === activeCompanyId) : companiesWithPsp;
  const rows = buildRows(scoped);
  const totalBalanceUsd = rows.reduce((s, r) => s + r.balanceUsd, 0);
  const totalSettlementUsd = rows.reduce((s, r) => s + r.settlementUsd, 0);
  const totalReserveUsd = rows.reduce((s, r) => s + r.reserveUsd, 0);
  const totalTransactionsUsd = rows.reduce((s, r) => s + r.transactionsUsd, 0);
  const totalExposureUsd = totalBalanceUsd + totalSettlementUsd;

  const balancePct = totalExposureUsd !== 0 ? Math.round((totalBalanceUsd / totalExposureUsd) * 100) : 100;
  const settlementPct = 100 - balancePct;
  const reservePct = totalBalanceUsd !== 0 ? Math.round((totalReserveUsd / totalBalanceUsd) * 100) : 0;
  const transactionsPct = 100 - reservePct;

  const byAcquirer = groupBy(rows, 'providerName');
  const byCompany = groupBy(rows, 'companyName');
  const byCurrency = groupBy(rows, 'currency');

  const cashIn = next7DaysCashIn(scoped);
  const cashInTotal = cashIn.reduce((s, d) => s + d.amountUsd, 0);
  const maxCashIn = Math.max(...cashIn.map(d => d.amountUsd), 1);

  const exportCsv = () => {
    const summary = rows.map(r => [
      r.companyName, r.providerName, r.currency,
      Math.round(r.transactionsUsd), Math.round(r.reserveUsd), Math.round(r.balanceUsd),
      Math.round(r.settlementUsd), Math.round(r.balanceUsd + r.settlementUsd),
    ]);
    const breakdownRows = (m: Record<string, { transactionsUsd: number; reserveUsd: number; balanceUsd: number; settlementUsd: number }>) =>
      Object.entries(m).map(([k, v]) => [
        k, Math.round(v.transactionsUsd), Math.round(v.reserveUsd), Math.round(v.balanceUsd),
        Math.round(v.settlementUsd), Math.round(v.balanceUsd + v.settlementUsd),
      ]);
    const bh = ['Transactions (USD)', 'Reserve (USD)', 'Balance (USD)', 'Settlement (USD)', 'Exposure (USD)'];
    const name = activeValid ? `psp-${(companiesWithPsp.find(c => c.id === activeCompanyId)?.name || 'company')}` : 'psp-all-companies';
    downloadExcel(`${name}.xls`, [
      { name: 'PSP Summary', headers: ['Company', 'Acquirer', 'Currency', ...bh], rows: summary },
      { name: 'By Acquirer', headers: ['Acquirer', ...bh], rows: breakdownRows(byAcquirer) },
      { name: 'By Company', headers: ['Company', ...bh], rows: breakdownRows(byCompany) },
      { name: 'By Currency', headers: ['Currency', ...bh], rows: breakdownRows(byCurrency) },
    ]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Payment Providers</h1>
          <p className="text-sm text-slate-500">Real-time overview of PSP balances, settlements and expected cash</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <Download size={14} /> Export Excel
          </button>
          {onSync && (
            <button
              onClick={onSync}
              disabled={isSyncing}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-colors ${isSyncing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              {isSyncing ? <RefreshCcw size={14} className="animate-spin" /> : <Globe size={14} />}
              {isSyncing ? 'Syncing…' : 'Sync All'}
            </button>
          )}
        </div>
      </div>

      {/* Date + last sync (matches the Bank Balance page) */}
      {onDateChange && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</span>
            <input
              type="date"
              max={todayStr}
              value={historyDate || todayStr}
              onChange={e => { const val = e.target.value; onDateChange(val === todayStr ? '' : val); }}
              className="text-xs font-mono border border-slate-200 rounded-lg px-2.5 py-1.5 outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white text-slate-700 cursor-pointer"
            />
          </div>
          {isHistoricalMode ? (
            <button onClick={() => onDateChange('')} className="text-xs font-bold text-amber-700 hover:text-amber-900 underline underline-offset-2">← Back to Live</button>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Global Sync</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs font-mono font-bold text-slate-700">{lastSynced}</span>
            </div>
          )}
        </div>
      )}

      {/* Company selector - View All + per company (always shown, even for a single company) */}
      {companiesWithPsp.length >= 1 && (
        <div className="flex items-stretch gap-1 overflow-x-auto border-b border-slate-200">
          <button
            onClick={() => setActiveCompanyId(null)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${!activeValid ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
          >
            View All
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${!activeValid ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>ALL</span>
          </button>
          {companiesWithPsp.map(c => {
            const on = activeCompanyId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveCompanyId(c.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${on ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}

      {/* Top 4 summary cards */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-2xl p-5 text-white flex flex-col">
          <div className="text-indigo-200 text-[11px] font-bold uppercase tracking-wider">Total Exposure</div>
          <div className="text-3xl font-bold mt-1">{fmtUsd(totalExposureUsd)}</div>
          <div className="text-indigo-200 text-xs mb-4">Balance + Settlement</div>
          <div className="flex items-center gap-4 mt-auto">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <g transform="rotate(-90 42 42)">
                <circle cx="42" cy="42" r="32" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="10" />
                <circle cx="42" cy="42" r="32" fill="none" stroke="#a5b4fc" strokeWidth="10" strokeDasharray={`${(balancePct / 100) * 201} 201`} />
                <circle cx="42" cy="42" r="32" fill="none" stroke="#34d399" strokeWidth="10" strokeDasharray={`${(settlementPct / 100) * 201} 201`} strokeDashoffset={`${-(balancePct / 100) * 201}`} />
              </g>
            </svg>
            <div className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#a5b4fc]" />Balance <span className="font-mono font-bold ml-auto">{fmtUsd(totalBalanceUsd)} ({balancePct}%)</span></div>
              <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-[#34d399]" />Settlement <span className="font-mono font-bold ml-auto">{fmtUsd(totalSettlementUsd)} ({settlementPct}%)</span></div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Balance</div>
          <div className="text-3xl font-bold text-slate-900 mt-1 mb-4">{fmtUsd(totalBalanceUsd)}</div>
          <div className="space-y-2.5">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Rolling Reserve</div>
              <div className="text-lg font-bold text-slate-900">{fmtUsd(totalReserveUsd)}</div>
              <div className="text-[10px] text-slate-400">{reservePct}% of Total Balance</div>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Transactions</div>
              <div className="text-lg font-bold text-slate-900">{fmtUsd(totalTransactionsUsd)}</div>
              <div className="text-[10px] text-slate-400">{transactionsPct}% of Total Balance</div>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 mt-3">Balance = Rolling Reserve + Transactions</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Settlement</div>
          <div className={`text-3xl font-bold mt-1 ${totalSettlementUsd === 0 ? 'text-slate-300' : 'text-slate-900'}`}>{fmtUsd(totalSettlementUsd)}</div>
          <div className="text-xs text-slate-400 mb-4">Ready to be paid by PSPs</div>
          <div className="flex-1 flex items-center justify-center text-center">
            {totalSettlementUsd === 0 ? (
              <p className="text-xs text-slate-400">No pending settlements in <span className="font-mono">psp_settlements</span> yet</p>
            ) : (
              <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Expected Cash In (7 days)</div>
          <div className={`text-3xl font-bold mt-1 mb-1 ${cashInTotal === 0 ? 'text-slate-300' : 'text-slate-900'}`}>{fmtUsd(cashInTotal)}</div>
          <div className="text-xs text-slate-400 mb-3">Next 7 days</div>
          {cashInTotal === 0 ? (
            <div className="flex items-center justify-center h-24 text-center">
              <p className="text-xs text-slate-400">No upcoming settlements scheduled</p>
            </div>
          ) : (
            <div className="flex items-end justify-between gap-1.5 h-24">
              {cashIn.map(d => (
                <div key={d.date} className="flex flex-col items-center gap-1 flex-1">
                  <span className="text-[9px] font-bold text-slate-500">{fmtUsd(d.amountUsd)}</span>
                  <div className="w-full bg-emerald-500 rounded" style={{ height: `${Math.max((d.amountUsd / maxCashIn) * 100, 2)}%` }} />
                  <span className="text-[9px] text-slate-400">{d.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Three breakdown tables */}
      <div className="flex flex-col lg:flex-row gap-4 items-start">
        <BreakdownTable title="By Acquirer" data={byAcquirer} />
        <BreakdownTable title="By Company" data={byCompany} />
        <BreakdownTable title="By Currency" data={byCurrency} />
      </div>

      {/* PSP Summary granular table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100">
          <span className="text-sm font-bold text-slate-700 uppercase tracking-wide">PSP Summary</span>
          <span className="text-[10px] bg-indigo-100 text-indigo-600 px-2 py-0.5 rounded font-bold uppercase tracking-wider ml-2">{activeValid ? (companiesWithPsp.find(c => c.id === activeCompanyId)?.name || 'Company') : 'All Companies'}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[720px]">
            <thead className="bg-slate-50/60 text-slate-400">
              <tr>
                <th className="text-left px-5 py-2.5 font-bold">Company</th>
                <th className="text-left px-2 py-2.5 font-bold">Acquirer</th>
                <th className="text-left px-2 py-2.5 font-bold">Currency</th>
                <th className="text-right px-2 py-2.5 font-bold">Reserve</th>
                <th className="text-right px-2 py-2.5 font-bold">Transactions</th>
                <th className="text-right px-2 py-2.5 font-bold">Total Balance</th>
                <th className="text-right px-2 py-2.5 font-bold">Settlement</th>
                <th className="text-right px-5 py-2.5 font-bold">Total Exposure</th>
              </tr>
            </thead>
            <tbody className="text-slate-700">
              {rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-2.5 font-medium whitespace-nowrap">{r.companyName}</td>
                  <td className="px-2 py-2.5 whitespace-nowrap">{r.providerName}</td>
                  <td className="px-2 py-2.5"><span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">{r.currency}</span></td>
                  <td className="text-right px-2 py-2.5 font-mono">{fmtUsd(r.reserveUsd)}</td>
                  <td className={`text-right px-2 py-2.5 font-mono ${r.transactionsUsd < 0 ? 'text-red-600' : ''}`}>{fmtUsd(r.transactionsUsd)}</td>
                  <td className={`text-right px-2 py-2.5 font-mono ${r.balanceUsd < 0 ? 'text-red-600' : ''}`}>{fmtUsd(r.balanceUsd)}</td>
                  <td className={`text-right px-2 py-2.5 font-mono ${r.settlementUsd === 0 ? 'text-slate-400' : 'text-emerald-600'}`}>{fmtUsd(r.settlementUsd)}</td>
                  <td className={`text-right px-5 py-2.5 font-mono font-bold ${(r.balanceUsd + r.settlementUsd) < 0 ? 'text-red-600' : ''}`}>{fmtUsd(r.balanceUsd + r.settlementUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Single page-level reminder */}
      <div className="flex items-center gap-2.5 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-3">
        <Info size={16} className="text-indigo-600 shrink-0" />
        <p className="text-sm text-indigo-700">
          Funds shown on this page are held by your payment providers and have <strong>not yet settled</strong> into your bank accounts.
          They are tracked separately from the Dashboard's settled totals.
        </p>
      </div>

      {/* Per-company account-level detail - every company under View All, one when a tab is picked */}
      <div className="space-y-6">
        {scoped.map(company => (
          <PSPSection key={company.id} company={company} />
        ))}
      </div>
    </div>
  );
};

export default PSPPage;
