import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Tags, AlertTriangle, CheckCircle2, RefreshCcw, Plus, X, FileText, Pencil, Check, Search } from 'lucide-react';

interface Rule {
  id: number;
  payer: string;
  recipient: string;
  account_wallet: string | null;
  category: string;
  company_id: string | null;
  created_at: string;
}

type EditState = { payer: string; recipient: string; account_wallet: string; category: string };
const EMPTY_FORM = { payer: '', recipient: '', account_wallet: '', category: '' };

export default function ClassificationRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<EditState>(EMPTY_FORM);
  const [savingEditId, setSavingEditId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [search, setSearch] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/classification-rules');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setRules(data.rules ?? []);
    } catch {
      showToast('error', 'Failed to load classification rules');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchRules(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { showToast('error', 'Please upload a CSV file'); return; }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/settings/classification-rules/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      showToast('success', `Imported ${data.imported} rules successfully`);
      await fetchRules();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleClearAll = async () => {
    if (!confirm(`Delete all ${rules.length} classification rules? This cannot be undone.`)) return;
    setClearing(true);
    try {
      const res = await fetch('/api/settings/classification-rules', { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('success', 'All rules deleted');
      setRules([]);
    } catch {
      showToast('error', 'Failed to delete rules');
    } finally {
      setClearing(false);
    }
  };

  const handleSaveRule = async () => {
    if (!form.payer.trim() || !form.recipient.trim() || !form.category.trim()) {
      showToast('error', 'Payer, Recipient and Category are required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/classification-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      showToast('success', 'Rule added successfully');
      setForm(EMPTY_FORM);
      setShowForm(false);
      await fetchRules();
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setEditForm({
      payer: rule.payer,
      recipient: rule.recipient,
      account_wallet: rule.account_wallet ?? '',
      category: rule.category,
    });
  };

  const cancelEdit = () => { setEditingId(null); setEditForm(EMPTY_FORM); };

  const handleSaveEdit = async (id: number) => {
    if (!editForm.payer.trim() || !editForm.recipient.trim() || !editForm.category.trim()) {
      showToast('error', 'Payer, Recipient and Category are required');
      return;
    }
    setSavingEditId(id);
    try {
      const res = await fetch(`/api/settings/classification-rules/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Update failed');
      setRules(prev => prev.map(r => r.id === id
        ? { ...r, payer: editForm.payer, recipient: editForm.recipient, account_wallet: editForm.account_wallet || null, category: editForm.category }
        : r
      ));
      showToast('success', 'Rule updated');
      setEditingId(null);
    } catch (err: unknown) {
      showToast('error', err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSavingEditId(null);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/settings/classification-rules/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      setRules(prev => prev.filter(r => r.id !== id));
    } catch {
      showToast('error', 'Failed to delete rule');
    } finally {
      setDeletingId(null);
    }
  };

  const searchLower = search.toLowerCase().trim();
  const filteredRules = searchLower
    ? rules.filter(r =>
        r.payer.toLowerCase().includes(searchLower) ||
        r.recipient.toLowerCase().includes(searchLower) ||
        (r.account_wallet ?? '').toLowerCase().includes(searchLower) ||
        r.category.toLowerCase().includes(searchLower)
      )
    : rules;

  const cellInput = (field: keyof EditState, placeholder?: string) => (
    <input
      type="text"
      value={editForm[field]}
      onChange={e => setEditForm(prev => ({ ...prev, [field]: e.target.value }))}
      placeholder={placeholder}
      className="w-full px-2 py-1 rounded bg-slate-900/80 border border-indigo-500/50 text-slate-200 text-sm focus:outline-none focus:border-indigo-400"
    />
  );

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
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
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-500/10">
            <Tags className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-100">Accounting Categories by Vendor</h1>
            <p className="text-sm text-slate-400">
              Auto-classify transactions by Payer + Recipient + Account. {rules.length} rule{rules.length !== 1 ? 's' : ''} loaded.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={fetchRules} disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors" title="Refresh">
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={() => { setShowForm(true); setForm(EMPTY_FORM); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium transition-colors">
            <Plus className="w-4 h-4" /> Add Rule
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />
          {rules.length > 0 && (
            <button onClick={handleClearAll} disabled={clearing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium border border-red-500/30 transition-colors disabled:opacity-50">
              <Trash2 className="w-4 h-4" />
              {clearing ? 'Clearing…' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {/* CSV format reference */}
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <FileText className="w-3.5 h-3.5 text-slate-400" /> CSV File Format Reference
        </div>
        <div className="font-mono text-xs text-slate-400 bg-slate-900/50 rounded px-3 py-2 overflow-x-auto">
          <div className="text-slate-500 mb-1">Payer,Recipient,Counterparty Account / Wallet,Category</div>
          <div>Blue Pine Ltd,XBO,wallet_bp_xbo_crop_usd,Trading Revenue</div>
          <div>RMA,XBO,wallet_rma_xbo_b2b_usd,Commission Income</div>
          <div>Blue Pine Ltd,Bank Leumi,,Bank Fees</div>
        </div>
        <p className="text-xs text-slate-500">
          Header row is skipped automatically. <span className="text-slate-400">Account / Wallet</span> is optional.
          Upload <span className="text-amber-400 font-medium">replaces all existing rules</span>. Use "Add Rule" to add without losing existing ones.
        </p>
      </div>

      {/* Inline add form */}
      {showForm && (
        <div className="rounded-xl bg-slate-800/60 border border-indigo-500/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200">New Classification Rule</h2>
            <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([
              { key: 'payer', label: 'Payer', required: true, placeholder: 'e.g. Blue Pine Ltd' },
              { key: 'recipient', label: 'Recipient', required: true, placeholder: 'e.g. XBO' },
              { key: 'account_wallet', label: 'Account / Wallet', required: false, placeholder: 'optional' },
              { key: 'category', label: 'Category', required: true, placeholder: 'e.g. Trading Revenue' },
            ] as const).map(({ key, label, required, placeholder }) => (
              <div key={key} className="space-y-1">
                <label className="block text-xs font-medium text-slate-400">
                  {label}{required && <span className="text-red-400 ml-0.5">*</span>}
                </label>
                <input type="text" value={form[key]}
                  onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900/60 border border-slate-700 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSaveRule} disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50">
              {saving ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              {saving ? 'Saving…' : 'Save Rule'}
            </button>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by payer, recipient, account / wallet, or category…"
          className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-slate-800/60 border border-slate-700 text-slate-200 text-sm placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl bg-slate-800/50 border border-slate-700/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/80 border-b border-slate-700">
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Payer</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Recipient</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Account / Wallet</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Category</th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    <RefreshCcw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading rules…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    <Tags className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No classification rules yet.</p>
                    <p className="text-xs mt-1">Upload a CSV or add rules manually.</p>
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-12 text-slate-500">
                    <Search className="w-7 h-7 mx-auto mb-2 opacity-30" />
                    <p>No rules match <span className="text-slate-400">"{search}"</span></p>
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const isEditing = editingId === rule.id;
                  const isSavingEdit = savingEditId === rule.id;
                  return (
                    <tr key={rule.id} className={`transition-colors group ${isEditing ? 'bg-slate-700/40' : 'hover:bg-slate-700/30'}`}>
                      <td className="px-4 py-2">
                        {isEditing ? cellInput('payer') : <span className="text-slate-200">{rule.payer}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? cellInput('recipient') : <span className="text-slate-200">{rule.recipient}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? cellInput('account_wallet', 'optional') : <span className="text-slate-400">{rule.account_wallet || '—'}</span>}
                      </td>
                      <td className="px-4 py-2">
                        {isEditing ? cellInput('category') : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                            {rule.category}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => handleSaveEdit(rule.id)} disabled={isSavingEdit}
                              className="p-1.5 rounded text-emerald-400 hover:bg-emerald-500/10 transition-all" title="Save">
                              {isSavingEdit ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={cancelEdit}
                              className="p-1.5 rounded text-slate-500 hover:text-slate-300 hover:bg-slate-600/50 transition-all" title="Cancel">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                            <button onClick={() => startEdit(rule)}
                              className="p-1.5 rounded text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-all" title="Edit rule">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteRule(rule.id)} disabled={deletingId === rule.id}
                              className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Delete rule">
                              {deletingId === rule.id ? <RefreshCcw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
