import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Pencil, Check, X, Upload, FileText, AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react';

interface WalletLabel {
  address: string;
  label: string;
  created_at: string;
}

export default function WalletLabelsPage() {
  const [labels, setLabels]           = useState<WalletLabel[]>([]);
  const [loading, setLoading]         = useState(true);
  const [uploading, setUploading]     = useState(false);
  const [toast, setToast]             = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const fileRef                        = useRef<HTMLInputElement>(null);

  // New row form
  const [newAddress, setNewAddress]   = useState('');
  const [newLabel, setNewLabel]       = useState('');
  const [adding, setAdding]           = useState(false);
  const [addError, setAddError]       = useState('');

  // Inline edit
  const [editAddress, setEditAddress] = useState<string | null>(null);
  const [editLabel, setEditLabel]     = useState('');
  const [saving, setSaving]           = useState(false);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/wallet-labels', { credentials: 'include' });
      const json = await res.json();
      setLabels(json.labels ?? []);
    } catch {
      showToast('error', 'Failed to load wallet labels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { showToast('error', 'Please upload a CSV file'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res  = await fetch('/api/settings/wallet-labels/upload', { method: 'POST', credentials: 'include', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      showToast('success', `Imported ${data.imported} label${data.imported !== 1 ? 's' : ''} successfully`);
      await load();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

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
      const json = await res.json();
      if (!res.ok) { setAddError(json.error || 'Failed to add'); return; }
      setNewAddress('');
      setNewLabel('');
      showToast('success', 'Label added');
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
      showToast('success', 'Label updated');
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
    showToast('success', 'Label deleted');
    await load();
  };

  const inputCls = "border border-slate-600 bg-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500";

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium
          ${toast.type === 'success' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Wallet Address Labels</h2>
          <p className="text-sm text-slate-400 mt-1">
            Map wallet addresses to friendly names. Labels replace raw addresses in the Transactions screen.
            {labels.length > 0 && <span className="ml-1 text-slate-500">{labels.length} label{labels.length !== 1 ? 's' : ''} loaded.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title="Refresh">
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
        </div>
      </div>

      {/* CSV format reference */}
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> CSV File Format
        </div>
        <div className="font-mono text-xs text-slate-400 bg-slate-900/50 rounded px-3 py-2 overflow-x-auto">
          <div className="text-slate-500 mb-1">Address,Label</div>
          <div>0x43D891FFB4F244feFa793608413ea6832A09a45D,BluePine Settlement Wallet</div>
          <div>0x5c4Dd2616F16FfA4Ad80a75D4144D5D76838BC9A,RMA Trading Wallet</div>
          <div>TC6iwqxaBXKgo4eCNfT4ina1mWXUJNhxfR,SmartTool TRON Wallet</div>
        </div>
        <p className="text-xs text-slate-500">
          Header row is optional and skipped automatically. Upload <span className="text-amber-400 font-medium">merges with existing labels</span> — existing addresses are updated, new ones are added.
        </p>
      </div>

      {/* Add row */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Add Single Label</h3>
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
            placeholder="Label"
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
            {adding ? 'Adding…' : 'Add'}
          </button>
        </div>
        {addError && <p className="text-xs text-red-400">{addError}</p>}
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm flex flex-col items-center gap-2">
            <RefreshCcw className="w-5 h-5 animate-spin" />Loading…
          </div>
        ) : labels.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm">No labels yet. Upload a CSV or add one above.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider w-[55%]">Wallet Address</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Label</th>
                <th className="px-4 py-2.5 w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {labels.map(row => (
                <tr key={row.address} className="hover:bg-slate-700/20 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-400 truncate max-w-0" title={row.address}>
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
                    <div className="flex items-center justify-end gap-1">
                      {editAddress === row.address ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(row.address)} disabled={saving}
                            className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50" title="Save">
                            <Check size={13} />
                          </button>
                          <button
                            onClick={() => setEditAddress(null)}
                            className="p-1.5 rounded bg-slate-600 hover:bg-slate-500 text-slate-200 transition-colors" title="Cancel">
                            <X size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => { setEditAddress(row.address); setEditLabel(row.label); }}
                            className="p-1.5 rounded bg-indigo-600/30 hover:bg-indigo-600 border border-indigo-500/40 text-indigo-300 hover:text-white transition-colors" title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button
                            onClick={() => handleDelete(row.address)}
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
