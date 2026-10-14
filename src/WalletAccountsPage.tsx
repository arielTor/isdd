import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X, AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react';

interface WalletIdLabel {
  wallet_id: string;
  label: string;
  created_at: string;
}

export default function WalletAccountsPage() {
  const [labels, setLabels]           = useState<WalletIdLabel[]>([]);
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const [newWalletId, setNewWalletId] = useState('');
  const [newLabel, setNewLabel]       = useState('');
  const [adding, setAdding]           = useState(false);
  const [addError, setAddError]       = useState('');

  const [editId, setEditId]           = useState<string | null>(null);
  const [editLabel, setEditLabel]     = useState('');
  const [saving, setSaving]           = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/wallet-id-labels', { credentials: 'include' });
      const json = await res.json();
      setLabels(json.labels ?? []);
    } catch {
      showToast('error', 'Failed to load wallet account labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const wallet_id = newWalletId.trim();
    const label     = newLabel.trim();
    if (!wallet_id || !label) { setAddError('Both fields are required'); return; }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/settings/wallet-id-labels', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_id, label }),
      });
      const json = await res.json();
      if (!res.ok) { setAddError(json.error || 'Failed to add'); return; }
      setNewWalletId('');
      setNewLabel('');
      showToast('success', 'Label saved');
      await load();
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (wallet_id: string) => {
    const label = editLabel.trim();
    if (!label) return;
    setSaving(true);
    try {
      await fetch('/api/settings/wallet-id-labels', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet_id, label }),
      });
      setEditId(null);
      showToast('success', 'Label updated');
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (wallet_id: string) => {
    if (!confirm(`Delete label for ${wallet_id}?`)) return;
    await fetch(`/api/settings/wallet-id-labels/${encodeURIComponent(wallet_id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    showToast('success', 'Label deleted');
    await load();
  };

  const inputCls = "border border-slate-600 bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Wallet Accounts</h2>
          <p className="text-sm text-slate-400 mt-1">
            Map internal wallet IDs to friendly account names. Labels appear as sub-text in the Transactions screen.
            {labels.length > 0 && <span className="ml-1 text-slate-500">{labels.length} label{labels.length !== 1 ? 's' : ''} loaded.</span>}
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title="Refresh">
          <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3 space-y-1">
        <p className="text-xs font-semibold text-slate-300">Wallet ID format</p>
        <p className="font-mono text-xs text-slate-400">wallet_&#123;company&#125;_&#123;bank&#125;_&#123;account_type&#125;_&#123;currency&#125;</p>
        <div className="font-mono text-xs text-slate-500 space-y-0.5 pt-1">
          <div>wallet_bp_xbo_crop_usdt → <span className="text-slate-300">BluePine XBO Corp USDT</span></div>
          <div>wallet_st_xbo_btc_usdt → <span className="text-slate-300">SmartTool XBO B2C USDT</span></div>
          <div>wallet_rma_xbo_c2b_usdt → <span className="text-slate-300">RMA XBO C2B USDT</span></div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add / Update Label</h3>
        <div className="flex gap-3 flex-wrap">
          <input
            className={`${inputCls} flex-[2] min-w-[200px]`}
            placeholder="wallet_id (e.g. wallet_bp_xbo_crop_usdt)"
            value={newWalletId}
            onChange={e => setNewWalletId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            className={`${inputCls} flex-1 min-w-[160px]`}
            placeholder="Label (e.g. BluePine XBO Corp USDT)"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            {adding ? 'Saving…' : 'Save'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCcw className="w-5 h-5 animate-spin" />Loading…
          </div>
        ) : labels.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No labels yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[45%]">Wallet ID</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {labels.map(row => (
                <tr key={row.wallet_id} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{row.wallet_id}</td>
                  <td className="px-4 py-2.5 text-slate-200">
                    {editId === row.wallet_id ? (
                      <input
                        autoFocus
                        className={`${inputCls} w-full py-1`}
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(row.wallet_id);
                          if (e.key === 'Escape') setEditId(null);
                        }}
                      />
                    ) : (
                      <span className="font-medium">{row.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-1">
                      {editId === row.wallet_id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(row.wallet_id)} disabled={saving}
                            className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50" title="Save">
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditId(null)}
                            className="p-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors" title="Cancel">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditId(row.wallet_id); setEditLabel(row.label); }}
                            className="p-1.5 rounded bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-300 hover:text-white transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.wallet_id)}
                            className="p-1.5 rounded bg-red-600/20 hover:bg-red-600 border border-red-500/30 text-red-400 hover:text-white transition-colors" title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
