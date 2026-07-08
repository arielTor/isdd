import { useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCcw, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface ApiLog {
  id: number;
  direction: string;
  source: string;
  endpoint: string;
  method: string;
  status_code: number;
  request_body: string | null;
  response_body: string | null;
  duration_ms: number;
  ip_address: string;
  created_at: string;
}

interface ApiMonitorResponse {
  logs: ApiLog[];
  pagination: { total: number; page: number; limit: number; pages: number };
  summary: { total_calls: number; avg_duration: number; success_count: number; error_count: number };
}

const fmtTime = (dt: string) => {
  try { return new Date(dt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
  catch { return dt; }
};

const StatusBadge = ({ code }: { code: number }) => {
  const ok = code >= 200 && code < 300;
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
      ok ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
    }`}>
      {code}
    </span>
  );
};

const SummaryCard = ({ label, value, color }: { label: string; value: string; color?: string }) => (
  <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-col gap-1">
    <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">{label}</span>
    <span className={`text-xl font-bold ${color || 'text-white'}`}>{value}</span>
  </div>
);

export default function APIMonitorPage() {
  const [direction, setDirection] = useState('all');
  const [source, setSource] = useState('all');
  const [status, setStatus] = useState('all');
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApiMonitorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ApiLog | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50', date_from: dateFrom, date_to: dateTo });
      if (direction !== 'all') params.set('direction', direction);
      if (source !== 'all') params.set('source', source);
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/admin/api-logs?${params}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [page, direction, source, status, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
    intervalRef.current = setInterval(fetchData, 30_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchData]);

  const { logs = [], summary } = data || {};
  const pagination = data?.pagination;
  const successRate = summary
    ? summary.total_calls > 0
      ? Math.round((summary.success_count / summary.total_calls) * 100)
      : 100
    : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-white font-semibold text-lg">API Monitor</h2>
          <p className="text-slate-400 text-sm">Incoming and outgoing API calls · auto-refreshes every 30s</p>
        </div>
        <button
          onClick={fetchData}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 bg-slate-700/60 border border-slate-600/50 text-slate-300 hover:text-white rounded-lg text-sm transition-colors"
        >
          <RefreshCcw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex flex-wrap gap-3 items-end">
        {/* Direction */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Direction</label>
          <select
            value={direction}
            onChange={e => { setDirection(e.target.value); setPage(1); }}
            className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="inbound">Inbound</option>
            <option value="outbound">Outbound</option>
          </select>
        </div>

        {/* Source */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Source</label>
          <select
            value={source}
            onChange={e => { setSource(e.target.value); setPage(1); }}
            className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="zapier">Zapier</option>
            <option value="ifx">IFX</option>
            <option value="rapyd">Rapyd</option>
          </select>
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Status</label>
          <select
            value={status}
            onChange={e => { setStatus(e.target.value); setPage(1); }}
            className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="2xx">Success (2xx)</option>
            <option value="err">Error (4xx/5xx)</option>
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => { setDateFrom(e.target.value); setPage(1); }}
            className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-slate-400 text-xs font-semibold uppercase tracking-wider">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => { setDateTo(e.target.value); setPage(1); }}
            className="bg-slate-700/60 border border-slate-600/50 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Calls Today" value={String(summary?.total_calls ?? '—')} />
        <SummaryCard
          label="Success Rate"
          value={successRate !== null ? `${successRate}%` : '—'}
          color={successRate !== null ? (successRate >= 95 ? 'text-emerald-400' : successRate >= 80 ? 'text-amber-400' : 'text-rose-400') : 'text-white'}
        />
        <SummaryCard label="Avg Response Time" value={summary ? `${summary.avg_duration}ms` : '—'} />
        <SummaryCard
          label="Failed Calls"
          value={String(summary?.error_count ?? '—')}
          color={(summary?.error_count ?? 0) > 0 ? 'text-rose-400' : 'text-white'}
        />
      </div>

      {/* Table */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
        {loading && !data ? (
          <div className="p-12 text-center text-slate-500 text-sm">Loading logs…</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">No API calls recorded for the selected filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-700/50 border-b border-slate-700/50">
                  {['Time', 'Direction', 'Source', 'Endpoint', 'Method', 'Status', 'Duration', ''].map((h, i) => (
                    <th key={i} className="px-4 py-3 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-700/20 transition-colors">
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs whitespace-nowrap">{fmtTime(log.created_at)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        log.direction === 'inbound'
                          ? 'bg-sky-500/20 text-sky-400'
                          : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {log.direction === 'inbound' ? <ArrowDownLeft size={10} /> : <ArrowUpRight size={10} />}
                        {log.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 capitalize">{log.source || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 font-mono text-xs max-w-[220px] truncate" title={log.endpoint}>
                      {log.endpoint}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-700/60 text-slate-300 rounded text-xs font-mono">
                        {log.method}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusBadge code={log.status_code} /></td>
                    <td className="px-4 py-3 text-slate-400 text-xs font-mono whitespace-nowrap">{log.duration_ms}ms</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelected(log)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors underline underline-offset-2"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-700/50 text-xs text-slate-400">
            <span>
              Showing {((pagination.page - 1) * pagination.limit) + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total.toLocaleString()} entries
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
              >
                Prev
              </button>
              <span className="flex items-center px-3 py-1.5 text-slate-300">{pagination.page} / {pagination.pages}</span>
              <button
                onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                disabled={page >= pagination.pages}
                className="px-3 py-1.5 bg-slate-700/60 border border-slate-600/50 rounded-lg disabled:opacity-40 hover:text-white transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-slate-800 border border-slate-700 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto space-y-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <StatusBadge code={selected.status_code} />
                <span className="text-white font-semibold">{selected.method} {selected.endpoint}</span>
              </div>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              {[
                ['Time',      fmtTime(selected.created_at)],
                ['Direction', selected.direction],
                ['Source',    selected.source || '—'],
                ['Duration',  `${selected.duration_ms}ms`],
                ['IP',        selected.ip_address || '—'],
              ].map(([k, v]) => (
                <div key={k} className="bg-slate-700/50 rounded-lg p-2">
                  <div className="text-slate-500 uppercase tracking-wider text-[10px] mb-0.5">{k}</div>
                  <div className="text-slate-200 font-mono">{v}</div>
                </div>
              ))}
            </div>
            {selected.request_body && (
              <div>
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Request</div>
                <pre className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-slate-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {(() => { try { return JSON.stringify(JSON.parse(selected.request_body!), null, 2); } catch { return selected.request_body; } })()}
                </pre>
              </div>
            )}
            {selected.response_body && (
              <div>
                <div className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Response</div>
                <pre className="bg-slate-900/60 border border-slate-700/50 rounded-lg p-3 text-slate-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
                  {(() => { try { return JSON.stringify(JSON.parse(selected.response_body!), null, 2); } catch { return selected.response_body; } })()}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
