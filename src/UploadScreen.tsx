import React, { useState, useEffect, useRef } from 'react';
import { Download, Upload, CheckCircle, XCircle, RefreshCcw, AlertTriangle, ArrowRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletRow {
  wallet_id: string;
  company_name: string;
  bank_name: string;
  bank_country: string;
  account_number: string;
  account_label: string;
  currency: string;
  current_balance: number;
  current_value_usd: number;
  new_balance: string;
  new_value_usd: string;
  dirty: boolean;
}

interface UpdateResult {
  updated: number;
  notFound: string[];
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  rows,
  onConfirm,
  onCancel,
  submitting,
}: {
  rows: WalletRow[];
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg mx-4 overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
            <CheckCircle size={16} className="text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Confirm Balance Update</h3>
            <p className="text-xs text-slate-500">
              {rows.length} wallet{rows.length !== 1 ? 's' : ''} will be updated
            </p>
          </div>
        </div>

        {/* Change list */}
        <div className="px-6 py-4 max-h-72 overflow-y-auto divide-y divide-slate-100">
          {rows.map(r => (
            <div key={r.wallet_id} className="py-3 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-800 truncate">{r.bank_name}</div>
                <div className="text-[11px] text-slate-400 font-mono truncate">{r.wallet_id}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0 text-sm">
                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">{r.currency}</span>
                <span className="font-mono text-slate-500 text-xs">
                  {r.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
                <ArrowRight size={12} className="text-slate-400" />
                <span className="font-mono font-bold text-indigo-600 text-xs">
                  {Number(r.new_balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all disabled:opacity-40"
          >
            {submitting
              ? <><RefreshCcw size={14} className="animate-spin" /> Saving…</>
              : <><CheckCircle size={14} /> Confirm Update</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<UpdateResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Load wallets from /api/liquidity ──────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setLoadError(null);
        const res = await fetch('/api/liquidity');
        const json = await res.json();
        const companies: any[] = json.data || [];

        const flat: WalletRow[] = [];
        for (const company of companies) {
          for (const bank of (company.banks || [])) {
            for (const account of (bank.bank_accounts || [])) {
              for (const wallet of (account.wallets || [])) {
                flat.push({
                  wallet_id: wallet.id,
                  company_name: company.name,
                  bank_name: bank.name,
                  bank_country: bank.country || '',
                  account_number: account.account_number,
                  account_label: account.label || '',
                  currency: wallet.currency,
                  current_balance: Number(wallet.balance ?? 0),
                  current_value_usd: Number(wallet.value_usd ?? 0),
                  new_balance: '',
                  new_value_usd: '',
                  dirty: false,
                });
              }
            }
          }
        }
        setRows(flat);
      } catch (e: any) {
        setLoadError('Failed to load wallet list: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Inline editing ────────────────────────────────────────────────────────

  function handleChange(wallet_id: string, field: 'new_balance' | 'new_value_usd', value: string) {
    setRows(prev => prev.map(r =>
      r.wallet_id === wallet_id ? { ...r, [field]: value, dirty: true } : r
    ));
    setResult(null);
    setServerError(null);
  }

  function handleReset() {
    setRows(prev => prev.map(r => ({ ...r, new_balance: '', new_value_usd: '', dirty: false })));
    setResult(null);
    setServerError(null);
    setCsvErrors([]);
    if (fileRef.current) fileRef.current.value = '';
  }

  const dirtyRows = rows.filter(r => r.dirty && r.new_balance !== '');
  const hasInvalid = dirtyRows.some(
    r =>
      isNaN(Number(r.new_balance)) || Number(r.new_balance) < 0 ||
      r.new_value_usd === '' || isNaN(Number(r.new_value_usd)) || Number(r.new_value_usd) < 0
  );

  // ── Submit (called after confirmation) ───────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    setServerError(null);
    try {
      const payload = dirtyRows.map(r => ({
        wallet_id: r.wallet_id,
        wallet_balance: Number(r.new_balance),
        wallet_value_usd: r.new_value_usd !== '' ? Number(r.new_value_usd) : null,
      }));

      const res = await fetch('/api/update-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Server error');

      setResult(json);
      setShowConfirm(false);

      // Reflect new balances in the table
      setRows(prev => prev.map(r => {
        const u = payload.find(p => p.wallet_id === r.wallet_id);
        if (!u) return r;
        return {
          ...r,
          current_balance: u.wallet_balance,
          current_value_usd: u.wallet_value_usd ?? r.current_value_usd,
          new_balance: '',
          new_value_usd: '',
          dirty: false,
        };
      }));
    } catch (e: any) {
      setServerError(e.message);
      setShowConfirm(false);
    } finally {
      setSubmitting(false);
    }
  }

  // ── CSV download ──────────────────────────────────────────────────────────

  function downloadCSV() {
    const header = 'wallet_id,company_name,bank_name,account_number,currency,current_balance,new_balance,new_value_usd';
    const lines = rows.map(r =>
      [r.wallet_id, `"${r.company_name}"`, `"${r.bank_name}"`, r.account_number, r.currency, r.current_balance, '', ''].join(',')
    );
    const blob = new Blob([[header, ...lines].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wallet_balances_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── CSV upload ────────────────────────────────────────────────────────────

  function handleCSVUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvErrors([]);
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { setCsvErrors(['File is empty or missing data rows.']); return; }

      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
      const col = (name: string) => headers.indexOf(name);

      if (col('wallet_id') === -1 || col('new_balance') === -1) {
        setCsvErrors(['CSV must have "wallet_id" and "new_balance" columns.']);
        return;
      }

      const knownIds = new Set(rows.map(r => r.wallet_id));
      const errors: string[] = [];
      const updates: { wallet_id: string; new_balance: string; new_value_usd: string }[] = [];

      lines.slice(1).forEach((line, i) => {
        const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const wallet_id    = vals[col('wallet_id')] ?? '';
        const new_balance  = vals[col('new_balance')] ?? '';
        const new_value_usd = col('new_value_usd') >= 0 ? (vals[col('new_value_usd')] ?? '') : '';

        if (!wallet_id) return;
        if (!knownIds.has(wallet_id)) {
          errors.push(`Row ${i + 2}: wallet_id "${wallet_id}" does not exist in the database`);
          return;
        }
        if (new_balance === '') return;
        const num = Number(new_balance);
        if (isNaN(num) || num < 0) {
          errors.push(`Row ${i + 2}: new_balance "${new_balance}" must be a non-negative number`);
          return;
        }
        if (new_value_usd === '') {
          errors.push(`Row ${i + 2}: new_value_usd is required when new_balance is provided`);
          return;
        }
        if (isNaN(Number(new_value_usd)) || Number(new_value_usd) < 0) {
          errors.push(`Row ${i + 2}: new_value_usd "${new_value_usd}" must be a non-negative number`);
          return;
        }
        updates.push({ wallet_id, new_balance, new_value_usd });
      });

      setCsvErrors(errors);
      if (errors.length === 0 && updates.length > 0) {
        setRows(prev => prev.map(r => {
          const u = updates.find(u => u.wallet_id === r.wallet_id);
          if (!u) return r;
          return { ...r, new_balance: u.new_balance, new_value_usd: u.new_value_usd, dirty: true };
        }));
      }
      if (fileRef.current) fileRef.current.value = '';
    };
    reader.readAsText(file);
  }

  // ── Group by company ──────────────────────────────────────────────────────

  const companyNames = [...new Set(rows.map(r => r.company_name))];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Confirmation modal */}
      {showConfirm && (
        <ConfirmModal
          rows={dirtyRows}
          onConfirm={handleSubmit}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}

      <div className="max-w-7xl mx-auto p-8 space-y-6">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Upload size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Manual Balance Update</h3>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Edit balances directly — or download the pre-filled CSV, update in Excel, and re-upload
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={downloadCSV}
              disabled={loading || rows.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-sm transition-all disabled:opacity-40"
            >
              <Download size={14} />
              Download CSV
            </button>
            <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold shadow-sm transition-all cursor-pointer">
              <Upload size={14} />
              Upload CSV
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleCSVUpload} />
            </label>
          </div>
        </div>

        {/* ── CSV errors ── */}
        {csvErrors.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-center gap-2 text-red-700 font-semibold text-sm mb-2">
              <XCircle size={15} />
              {csvErrors.length} error{csvErrors.length !== 1 ? 's' : ''} in uploaded CSV — fix and re-upload
            </div>
            {csvErrors.map((e, i) => (
              <p key={i} className="text-xs text-red-600 pl-5">{e}</p>
            ))}
          </div>
        )}

        {/* ── Success ── */}
        {result && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
            <CheckCircle size={16} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">
                {result.updated} wallet{result.updated !== 1 ? 's' : ''} updated successfully
              </p>
              {result.notFound?.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ Not found in DB: {result.notFound.join(', ')}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Server error ── */}
        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{serverError}</p>
          </div>
        )}

        {/* ── Loading ── */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <RefreshCcw size={22} className="animate-spin mb-3 text-indigo-500" />
            <span className="text-sm">Loading wallets from database…</span>
          </div>
        )}

        {/* ── Load error ── */}
        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-red-700">{loadError}</p>
          </div>
        )}

        {/* ── Wallet tables grouped by company ── */}
        {!loading && !loadError && companyNames.map(companyName => {
          const companyRows = rows.filter(r => r.company_name === companyName);
          const bankNames = [...new Set(companyRows.map(r => r.bank_name))];
          const pendingCount = companyRows.filter(r => r.dirty && r.new_balance !== '').length;

          return (
            <div key={companyName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

              {/* Company header */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
                <div className="w-7 h-7 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-xs">
                  {companyName.charAt(0)}
                </div>
                <span className="font-bold text-slate-900">{companyName}</span>
                <span className="text-xs text-slate-400">{companyRows.length} wallet{companyRows.length !== 1 ? 's' : ''}</span>
                {pendingCount > 0 && (
                  <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                    {pendingCount} pending
                  </span>
                )}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    <th className="px-6 py-3 text-left">Bank</th>
                    <th className="px-6 py-3 text-left">Account</th>
                    <th className="px-6 py-3 text-left">Wallet ID</th>
                    <th className="px-6 py-3 text-center">Currency</th>
                    <th className="px-6 py-3 text-right">Current Balance</th>
                    <th className="px-6 py-3 text-right">New Balance</th>
                    <th className="px-6 py-3 text-right">New Value (USD)</th>
                  </tr>
                </thead>
                <tbody>
                  {bankNames.map(bankName => {
                    const bankRows = companyRows.filter(r => r.bank_name === bankName);
                    return bankRows.map((row, idx) => {
                      const isInvalid = row.dirty && row.new_balance !== '' && (isNaN(Number(row.new_balance)) || Number(row.new_balance) < 0);
                      const isPending = row.dirty && row.new_balance !== '' && !isInvalid;

                      return (
                        <tr
                          key={row.wallet_id}
                          className={`border-b border-slate-100 transition-colors
                            ${isPending ? 'bg-indigo-50/40' : 'hover:bg-slate-50/60'}`}
                        >
                          {/* Bank — rowspan */}
                          {idx === 0 && (
                            <td rowSpan={bankRows.length} className="px-6 py-4 border-r border-slate-100 align-top">
                              <div className="font-semibold text-slate-800 pt-0.5">{bankName}</div>
                              {row.bank_country && (
                                <div className="text-xs text-slate-400 mt-0.5">{row.bank_country}</div>
                              )}
                            </td>
                          )}

                          {/* Account */}
                          <td className="px-6 py-4 text-xs text-slate-500">
                            <div className="font-mono font-medium text-slate-700">{row.account_number}</div>
                            {row.account_label && <div className="text-slate-400 mt-0.5">{row.account_label}</div>}
                          </td>

                          {/* Wallet ID */}
                          <td className="px-6 py-4 font-mono text-xs text-slate-400">{row.wallet_id}</td>

                          {/* Currency */}
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                              {row.currency}
                            </span>
                          </td>

                          {/* Current balance */}
                          <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">
                            {row.current_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                          </td>

                          {/* New balance input */}
                          <td className="px-6 py-4 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={row.new_balance}
                              onChange={e => handleChange(row.wallet_id, 'new_balance', e.target.value)}
                              placeholder="—"
                              className={`w-36 border rounded-lg px-3 py-1.5 text-right text-sm font-mono outline-none
                                focus:ring-2 transition-all placeholder:text-slate-300
                                ${isInvalid
                                  ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                                  : isPending
                                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-200'
                                    : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 focus:ring-indigo-100 focus:border-indigo-400'
                                }`}
                            />
                            {isInvalid && (
                              <p className="text-red-500 text-[10px] mt-1 text-right">Must be ≥ 0</p>
                            )}
                          </td>

                          {/* New value_usd (mandatory when new_balance is set) */}
                          <td className="px-6 py-4 text-right">
                            {(() => {
                              const usdInvalid = row.dirty && row.new_balance !== '' && (
                                row.new_value_usd === '' || isNaN(Number(row.new_value_usd)) || Number(row.new_value_usd) < 0
                              );
                              const usdPending = row.dirty && row.new_balance !== '' && !usdInvalid && row.new_value_usd !== '';
                              return (
                                <>
                                  <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    value={row.new_value_usd}
                                    onChange={e => handleChange(row.wallet_id, 'new_value_usd', e.target.value)}
                                    placeholder={row.dirty && row.new_balance !== '' ? 'Required' : '—'}
                                    className={`w-36 border rounded-lg px-3 py-1.5 text-right text-sm font-mono outline-none
                                      focus:ring-2 transition-all
                                      ${usdInvalid
                                        ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200 placeholder:text-red-300'
                                        : usdPending
                                          ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-200'
                                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 focus:ring-indigo-100 focus:border-indigo-400 placeholder:text-slate-300'
                                      }`}
                                  />
                                  {usdInvalid && (
                                    <p className="text-red-500 text-[10px] mt-1 text-right">Required</p>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                        </tr>
                      );
                    });
                  })}
                </tbody>
              </table>
            </div>
          );
        })}

        {/* ── Sticky action bar ── */}
        {dirtyRows.length > 0 && (
          <div className="sticky bottom-4 flex items-center justify-between bg-white border border-slate-200 rounded-xl px-6 py-3 shadow-xl shadow-slate-200/80">
            <div className="text-sm text-slate-600">
              <span className="font-bold text-slate-900">{dirtyRows.length}</span>{' '}
              wallet{dirtyRows.length !== 1 ? 's' : ''} ready to update
              {hasInvalid && (
                <span className="ml-3 text-red-500 text-xs font-medium">⚠ Fix invalid values first</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={hasInvalid}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700
                  text-white text-sm font-bold shadow-lg shadow-indigo-600/20 transition-all
                  disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle size={14} />
                Apply Updates
              </button>
            </div>
          </div>
        )}

      </div>
    </>
  );
}
