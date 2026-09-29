import { useState, useEffect } from 'react';
import { Plus, Trash2, Pencil, Check, X } from 'lucide-react';

interface WalletLabel {
  address: string;
  label: string;
  created_at: string;
}

export default function WalletLabelsPage() {
  const [labels, setLabels]         = useState<WalletLabel[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');

  // New row form
  const [newAddress, setNewAddress] = useState('');
  const [newLabel, setNewLabel]     = useState('');
  const [adding, setAdding]         = useState(false);
  const [addError, setAddError]     = useState('');

  // Inline edit
  const [editAddress, setEditAddress] = useState<string | null>(null);
  const [editLabel, setEditLabel]     = useState('');
  const [saving, setSaving]           = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/wallet-labels', { credentials: 'include' });
      const json = await res.json();
      setLabels(json.labels ?? []);
    } catch {
      setError('Failed to load wallet labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    const address = newAddress.trim();
    const label   = newLabel.trim();
    if (!address || !label) { setAddError('Both fields are required'); return; }
    setAdding(true);
    setAddError('');
    try {
      const res = await fetch('/api/settings/wallet-labels', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, label }),
      });
      if (!res.ok) {
        const j = await res.json();
        setAddError(j.error || 'Failed to add');
        return;
      }
      setNewAddress('');
      setNewLabel('');
      await load();
    } finally {
      setAdding(false);
    }
  };

  const handleSaveEdit = async (address: string) => {
    const label = editLabel.trim();
    if (!label) return;
    setSaving(true);
    try {
      await fetch(`/api/settings/wallet-labels/${encodeURIComponent(address)}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label }),
      });
      setEditAddress(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (address: string) => {
    if (!confirm(`Delete label for ${address}?`)) return;
    await fetch(`/api/settings/wallet-labels/${encodeURIComponent(address)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    await load();
  };

  const inputCls = "border border-slate-600 bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-lg font-semibold text-slate-100">Wallet Address Labels</h2>
        <p className="text-sm text-slate-400 mt-1">
          Map wallet addresses to friendly names. Labels are shown in the Transactions screen instead of raw addresses.
        </p>
      </div>

      {/* Add row */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add New Label</h3>
        <div className="flex gap-3 flex-wrap">
          <input
            className={`${inputCls} flex-[2] min-w-[200px]`}
            placeholder="Wallet address (0x… or T…)"
            value={newAddress}
            onChange={e => setNewAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <input
            className={`${inputCls} flex-1 min-w-[140px]`}
            placeholder="Friendly name"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50"
          >
            <Plus size={14} />
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading…</div>
        ) : error ? (
          <div className="p-8 text-center text-red-400 text-sm">{error}</div>
        ) : labels.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No labels yet. Add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-700">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Wallet Address</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {labels.map(row => (
                <tr key={row.address} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400 max-w-[300px] truncate" title={row.address}>
                    {row.address}
                  </td>
                  <td className="px-4 py-2.5 text-slate-200">
                    {editAddress === row.address ? (
                      <input
                        autoFocus
                        className={`${inputCls} w-full py-1`}
                        value={editLabel}
                        onChange={e => setEditLabel(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit(row.address);
                          if (e.key === 'Escape') setEditAddress(null);
                        }}
                      />
                    ) : (
                      <span className="font-medium">{row.label}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      {editAddress === row.address ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(row.address)}
                            disabled={saving}
                            className="p-1.5 rounded-lg text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                            title="Save"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            onClick={() => setEditAddress(null)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 transition-colors"
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditAddress(row.address); setEditLabel(row.label); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                            title="Edit label"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.address)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
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
