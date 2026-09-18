import { useState, useEffect, useRef } from 'react';
import { Upload, Trash2, Tags, AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react';

interface Rule {
  id: number;
  payer: string;
  recipient: string;
  account_wallet: string | null;
  category: string;
  company_id: string | null;
  created_at: string;
}

export default function ClassificationRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
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
    if (!file.name.endsWith('.csv')) {
      showToast('error', 'Please upload a CSV file');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/settings/classification-rules/upload', {
        method: 'POST',
        body: form,
      });
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

  const handleClear = async () => {
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
          <button
            onClick={fetchRules}
            disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
            title="Refresh"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading…' : 'Upload CSV'}
          </button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} />

          {rules.length > 0 && (
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm font-medium border border-red-500/30 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              {clearing ? 'Clearing…' : 'Clear All'}
            </button>
          )}
        </div>
      </div>

      {/* CSV format hint */}
      <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 px-4 py-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">CSV format:</span> Payer, Recipient, Counterparty Account / Wallet, Category
        — header row is skipped automatically. Upload replaces all existing rules.
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-500">
                    <RefreshCcw className="w-5 h-5 animate-spin mx-auto mb-2" />
                    Loading rules…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-slate-500">
                    <Tags className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p>No classification rules yet.</p>
                    <p className="text-xs mt-1">Upload a CSV to get started.</p>
                  </td>
                </tr>
              ) : (
                rules.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-700/30 transition-colors">
                    <td className="px-4 py-3 text-slate-200">{rule.payer}</td>
                    <td className="px-4 py-3 text-slate-200">{rule.recipient}</td>
                    <td className="px-4 py-3 text-slate-400">{rule.account_wallet || '—'}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
                        {rule.category}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
