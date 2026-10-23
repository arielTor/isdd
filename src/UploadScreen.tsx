import { useState, useEffect } from 'react';
import { RefreshCcw, AlertTriangle, CheckCircle, Save } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface WalletRow {
  wallet_id: string;
  company_name: string;
  bank_id: string;
  bank_name: string;
  bank_country: string;
  account_id: string;
  account_number: string;
  account_label: string;
  wallet_currency: string;
  wallet_balance: number;
  wallet_value_usd: number;
  new_balance: string;
  new_value_usd: string;
  dirty: boolean;
  saving: boolean;
  saved: boolean;
  saveError: string | null;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const [rows, setRows] = useState<WalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Load all wallets from /api/wallets ───────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setLoadError(null);
        const res = await fetch('/api/wallets');
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Server error (${res.status})`);
        }
        const json = await res.json();
        const wallets: any[] = json.wallets || [];

        setRows(wallets.map(w => ({
          wallet_id: w.wallet_id,
          company_name: w.company_name,
          bank_id: w.bank_id,
          bank_name: w.bank_name,
          bank_country: w.bank_country || '',
          account_id: w.account_id,
          account_number: w.account_number || '',
          account_label: w.account_label || '',
          wallet_currency: w.wallet_currency,
          wallet_balance: Number(w.wallet_balance ?? 0),
          wallet_value_usd: Number(w.wallet_value_usd ?? 0),
          new_balance: '',
          new_value_usd: '',
          dirty: false,
          saving: false,
          saved: false,
          saveError: null,
        })));
      } catch (e: any) {
        setLoadError('Failed to load wallet list: ' + e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // ── Inline field change ───────────────────────────────────────────────────

  function handleChange(wallet_id: string, field: 'new_balance' | 'new_value_usd', value: string) {
    setRows(prev => prev.map(r =>
      r.wallet_id === wallet_id
        ? { ...r, [field]: value, dirty: true, saved: false, saveError: null }
        : r
    ));
  }

  // ── Save a single row ─────────────────────────────────────────────────────

  async function handleSave(wallet_id: string) {
    const row = rows.find(r => r.wallet_id === wallet_id);
    if (!row || row.new_balance === '') return;

    const newBal = Number(row.new_balance);
    const newUsd = row.new_value_usd !== '' ? Number(row.new_value_usd) : null;

    if (isNaN(newBal) || newBal < 0) {
      setRows(prev => prev.map(r =>
        r.wallet_id === wallet_id ? { ...r, saveError: 'Balance must be ≥ 0' } : r
      ));
      return;
    }

    setRows(prev => prev.map(r =>
      r.wallet_id === wallet_id ? { ...r, saving: true, saveError: null } : r
    ));

    try {
      const res = await fetch('/api/update-balances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: [{ wallet_id, wallet_balance: newBal, wallet_value_usd: newUsd }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Server error');

      setRows(prev => prev.map(r =>
        r.wallet_id === wallet_id
          ? {
              ...r,
              wallet_balance: newBal,
              wallet_value_usd: newUsd ?? r.wallet_value_usd,
              new_balance: '',
              new_value_usd: '',
              dirty: false,
              saving: false,
              saved: true,
              saveError: null,
            }
          : r
      ));

      setTimeout(() => {
        setRows(prev => prev.map(r =>
          r.wallet_id === wallet_id ? { ...r, saved: false } : r
        ));
      }, 3000);
    } catch (e: any) {
      setRows(prev => prev.map(r =>
        r.wallet_id === wallet_id ? { ...r, saving: false, saveError: e.message } : r
      ));
    }
  }

  // ── Group rows ────────────────────────────────────────────────────────────

  const companyNames = [...new Set(rows.map(r => r.company_name))];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-7xl mx-auto p-8 space-y-6">

      {/* Page header */}
      <div className="flex items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
          <Save size={18} className="text-white" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-slate-900">Manual Balance Update</h3>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Edit any balance or USD value below, then click the save icon on that row to update the database
          </p>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <RefreshCcw size={22} className="animate-spin mb-3 text-indigo-500" />
          <span className="text-sm">Loading wallets from database…</span>
        </div>
      )}

      {/* Load error */}
      {loadError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{loadError}</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && !loadError && rows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <p className="text-sm">No wallets found in the database.</p>
        </div>
      )}

      {/* Wallet tables grouped by company */}
      {!loading && !loadError && companyNames.map(companyName => {
        const companyRows = rows.filter(r => r.company_name === companyName);
        const bankNames = [...new Set(companyRows.map(r => r.bank_name))];

        return (
          <div key={companyName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">

            {/* Company header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="w-7 h-7 bg-indigo-50 border border-indigo-100 rounded-lg flex items-center justify-center text-indigo-600 font-bold text-xs">
                {companyName.charAt(0)}
              </div>
              <span className="font-bold text-slate-900">{companyName}</span>
              <span className="text-xs text-slate-400">{companyRows.length} wallet{companyRows.length !== 1 ? 's' : ''}</span>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3 text-left">Bank</th>
                  <th className="px-6 py-3 text-left">Account</th>
                  <th className="px-6 py-3 text-center">Currency</th>
                  <th className="px-6 py-3 text-right">Current Balance</th>
                  <th className="px-6 py-3 text-right">Current USD Value</th>
                  <th className="px-6 py-3 text-right">New Balance</th>
                  <th className="px-6 py-3 text-right">New USD Value</th>
                  <th className="px-6 py-3 text-center">Save</th>
                </tr>
              </thead>
              <tbody>
                {bankNames.map(bankName => {
                  const bankRows = companyRows.filter(r => r.bank_name === bankName);
                  return bankRows.map((row, idx) => {
                    const isInvalid = row.dirty && row.new_balance !== '' &&
                      (isNaN(Number(row.new_balance)) || Number(row.new_balance) < 0);
                    const isPending = row.dirty && row.new_balance !== '' && !isInvalid;

                    return (
                      <tr
                        key={row.wallet_id}
                        className={`border-b border-slate-100 transition-colors
                          ${row.saved ? 'bg-emerald-50/40' :
                            isPending ? 'bg-indigo-50/30' :
                            'hover:bg-slate-50/60'}`}
                      >
                        {/* Bank - rowspan */}
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

                        {/* Currency */}
                        <td className="px-6 py-4 text-center">
                          <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                            {row.wallet_currency}
                          </span>
                        </td>

                        {/* Current balance */}
                        <td className="px-6 py-4 text-right font-mono font-semibold text-slate-700">
                          {row.wallet_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                        </td>

                        {/* Current value_usd */}
                        <td className="px-6 py-4 text-right font-mono text-slate-500 text-xs">
                          ${row.wallet_value_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>

                        {/* New balance input */}
                        <td className="px-6 py-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.new_balance}
                            onChange={e => handleChange(row.wallet_id, 'new_balance', e.target.value)}
                            placeholder="-"
                            className={`w-36 border rounded-lg px-3 py-1.5 text-right text-sm font-mono outline-none
                              focus:ring-2 transition-all placeholder:text-slate-300
                              ${isInvalid
                                ? 'border-red-300 bg-red-50 text-red-700 focus:ring-red-200'
                                : isPending
                                  ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-200'
                                  : 'border-slate-200 bg-white text-slate-900 hover:border-slate-300 focus:ring-indigo-100 focus:border-indigo-400'
                              }`}
                          />
                        </td>

                        {/* New value_usd input */}
                        <td className="px-6 py-4 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={row.new_value_usd}
                            onChange={e => handleChange(row.wallet_id, 'new_value_usd', e.target.value)}
                            placeholder="-"
                            className={`w-36 border rounded-lg px-3 py-1.5 text-right text-sm font-mono outline-none
                              focus:ring-2 transition-all placeholder:text-slate-300
                              ${isPending && row.new_value_usd !== ''
                                ? 'border-indigo-300 bg-indigo-50 text-indigo-700 focus:ring-indigo-200'
                                : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 focus:ring-indigo-100 focus:border-indigo-400'
                              }`}
                          />
                        </td>

                        {/* Save button */}
                        <td className="px-6 py-4 text-center">
                          {row.saved ? (
                            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100">
                              <CheckCircle size={16} className="text-emerald-600" />
                            </span>
                          ) : row.saving ? (
                            <span className="inline-flex items-center justify-center w-8 h-8">
                              <RefreshCcw size={16} className="animate-spin text-indigo-400" />
                            </span>
                          ) : (
                            <button
                              onClick={() => handleSave(row.wallet_id)}
                              disabled={!isPending || isInvalid}
                              title="Save changes to database"
                              className={`inline-flex items-center justify-center w-8 h-8 rounded-full transition-all
                                ${isPending && !isInvalid
                                  ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 cursor-pointer'
                                  : 'bg-slate-100 text-slate-300 cursor-not-allowed'
                                }`}
                            >
                              <Save size={14} />
                            </button>
                          )}
                          {row.saveError && (
                            <p className="text-red-500 text-[10px] mt-1 max-w-[80px] mx-auto">{row.saveError}</p>
                          )}
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
    </div>
  );
}
