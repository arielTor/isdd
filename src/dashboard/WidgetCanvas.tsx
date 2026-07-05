import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  Plus, X, Settings2, Check, Pencil, LayoutDashboard, GripVertical, Loader2,
} from 'lucide-react';
import type { Company, DashboardWidget, DashboardLayout, PortfolioPoint } from '../types';
import { WidgetView, WIDGET_REGISTRY, widgetMeta } from './widgets';

const COLS = 12;
const ROW_PX = 80;
const GAP = 12;
const MIN_W = 2;
const MIN_H = 2;

// ── Grid math ───────────────────────────────────────────────────────────────

const collides = (a: DashboardWidget, b: DashboardWidget) =>
  a.i !== b.i && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

// Pull every widget up to the lowest non-overlapping row (deterministic vertical compaction).
function compact(items: DashboardWidget[]): DashboardWidget[] {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const placed: DashboardWidget[] = [];
  for (const it of sorted) {
    let y = 0;
    // eslint-disable-next-line no-loop-func
    while (placed.some(p => collides({ ...it, y }, p))) y++;
    placed.push({ ...it, y });
  }
  return placed;
}

const clampW = (w: number) => Math.max(MIN_W, Math.min(COLS, w));

function newId() {
  return `w_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e4).toString(36)}`;
}

const DEFAULT_LAYOUT = (): DashboardLayout => [
  { i: newId(), type: 'asset-breakdown', companyIds: [], x: 0, y: 0, w: 8, h: 4 },
  { i: newId(), type: 'summary-by-company', companyIds: [], x: 8, y: 0, w: 4, h: 2 },
  { i: newId(), type: 'summary-by-currency', companyIds: [], x: 8, y: 2, w: 4, h: 2 },
  { i: newId(), type: 'portfolio-table', companyIds: [], x: 0, y: 4, w: 12, h: 4 },
];

// ── Company sourcing popover ────────────────────────────────────────────────

function CompanyPicker({
  widget, companies, onChange, onClose,
}: {
  widget: DashboardWidget;
  companies: Company[];
  onChange: (ids: string[]) => void;
  onClose: () => void;
}) {
  const single = !!widgetMeta(widget.type).singleCompany;
  const selected = new Set(widget.companyIds);
  const toggle = (id: string) => {
    if (single) { onChange([id]); return; }
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next]);
  };
  return (
    <div className="absolute right-2 top-10 z-30 w-60 bg-white rounded-xl border border-slate-200 shadow-xl p-2" onClick={e => e.stopPropagation()}>
      <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {single ? 'Company' : 'Source companies'}
      </div>
      {!single && (
        <button
          onClick={() => onChange([])}
          className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${selected.size === 0 ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-slate-50 text-slate-600'}`}
        >
          <span className="w-4 h-4 flex items-center justify-center">{selected.size === 0 && <Check size={14} />}</span>
          All companies
        </button>
      )}
      <div className="max-h-56 overflow-y-auto">
        {companies.map(c => {
          const on = single ? widget.companyIds[0] === c.id : selected.has(c.id);
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-sm text-left ${on ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'hover:bg-slate-50 text-slate-600'}`}
            >
              <span className="w-4 h-4 flex items-center justify-center">{on && <Check size={14} />}</span>
              <span className="truncate">{c.name}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onClose} className="w-full mt-1 px-2 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Done</button>
    </div>
  );
}

// ── Add-widget menu ─────────────────────────────────────────────────────────

function AddWidgetMenu({ onAdd, onClose }: { onAdd: (type: DashboardWidget['type']) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute right-0 top-12 z-40 w-72 max-h-[70vh] overflow-y-auto bg-white rounded-xl border border-slate-200 shadow-xl p-2">
        <div className="px-2 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Add a widget</div>
        {WIDGET_REGISTRY.map(w => (
          <button
            key={w.type}
            onClick={() => { onAdd(w.type); onClose(); }}
            className="w-full flex items-start gap-3 px-2 py-2.5 rounded-lg hover:bg-slate-50 text-left"
          >
            <span className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0"><w.icon size={16} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-slate-800">{w.label}</span>
              <span className="block text-xs text-slate-400 truncate">{w.description}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

// ── Canvas ──────────────────────────────────────────────────────────────────

type DragState =
  | { mode: 'move'; id: string; startX: number; startY: number; origX: number; origY: number }
  | { mode: 'resize'; id: string; startX: number; startY: number; origW: number; origH: number }
  | null;

export default function WidgetCanvas({ companies, history }: { companies: Company[]; history: PortfolioPoint[] }) {
  const [layout, setLayout] = useState<DashboardLayout | null>(null);
  const [editing, setEditing] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [showAdd, setShowAdd] = useState(false);
  const [configId, setConfigId] = useState<string | null>(null);
  const [containerW, setContainerW] = useState(1200);
  const [isMobile, setIsMobile] = useState(false);
  const [drag, setDrag] = useState<DragState>(null);
  // Trend window for sparklines; defaults to the current month (month-to-date).
  const [period, setPeriod] = useState<'month' | '7d' | '30d' | '90d'>('month');
  const [histData, setHistData] = useState<PortfolioPoint[]>(history);

  const containerRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedRef = useRef(false);

  // Load layout once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/dashboard-layout', { credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        const incoming = Array.isArray(data.layout) && data.layout.length ? data.layout as DashboardLayout : DEFAULT_LAYOUT();
        setLayout(compact(incoming));
      } catch {
        if (!cancelled) setLayout(compact(DEFAULT_LAYOUT()));
      } finally {
        loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Refetch the portfolio history when the trend window changes ('month' = month-to-date).
  useEffect(() => {
    const days = period === '7d' ? 7 : period === '30d' ? 30 : period === '90d' ? 90 : new Date().getDate();
    let cancelled = false;
    fetch(`/api/portfolio-history?days=${days}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(res => { if (!cancelled) setHistData(Array.isArray(res.data) ? res.data : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [period]);

  // Track container width for grid math + detect mobile (stacked, non-draggable layout)
  useLayoutEffect(() => {
    const measure = () => {
      if (containerRef.current) setContainerW(containerRef.current.clientWidth);
      setIsMobile(window.innerWidth < 768);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [layout]);

  const colW = (containerW - GAP * (COLS - 1)) / COLS;
  const xPx = (x: number) => x * (colW + GAP);
  const yPx = (y: number) => y * (ROW_PX + GAP);
  const wPx = (w: number) => w * colW + (w - 1) * GAP;
  const hPx = (h: number) => h * ROW_PX + (h - 1) * GAP;

  const persist = useCallback((next: DashboardLayout) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch('/api/dashboard-layout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ layout: next }),
        });
        setSaveState('saved');
        setTimeout(() => setSaveState('idle'), 1500);
      } catch {
        setSaveState('idle');
      }
    }, 600);
  }, []);

  const commit = useCallback((next: DashboardLayout) => {
    const compacted = compact(next);
    setLayout(compacted);
    persist(compacted);
  }, [persist]);

  // Drag / resize handlers
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dxCols = Math.round((e.clientX - drag.startX) / (colW + GAP));
      const dyRows = Math.round((e.clientY - drag.startY) / (ROW_PX + GAP));
      setLayout(prev => prev && prev.map(it => {
        if (it.i !== drag.id) return it;
        if (drag.mode === 'move') {
          const x = Math.max(0, Math.min(COLS - it.w, drag.origX + dxCols));
          const y = Math.max(0, drag.origY + dyRows);
          return { ...it, x, y };
        }
        const w = clampW(drag.origW + dxCols);
        const h = Math.max(MIN_H, drag.origH + dyRows);
        const x = Math.min(it.x, COLS - w);
        return { ...it, w, h, x };
      }));
    };
    const onUp = () => {
      setDrag(null);
      setLayout(prev => {
        if (!prev) return prev;
        const compacted = compact(prev);
        persist(compacted);
        return compacted;
      });
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [drag, colW, persist]);

  const startMove = (e: ReactPointerEvent, it: DashboardWidget) => {
    if (!editing) return;
    e.preventDefault();
    setDrag({ mode: 'move', id: it.i, startX: e.clientX, startY: e.clientY, origX: it.x, origY: it.y });
  };
  const startResize = (e: ReactPointerEvent, it: DashboardWidget) => {
    e.preventDefault();
    e.stopPropagation();
    setDrag({ mode: 'resize', id: it.i, startX: e.clientX, startY: e.clientY, origW: it.w, origH: it.h });
  };

  const addWidget = (type: DashboardWidget['type']) => {
    if (!layout) return;
    const meta = widgetMeta(type);
    const maxY = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);
    commit([...layout, { i: newId(), type, companyIds: [], x: 0, y: maxY, w: meta.defaultW, h: meta.defaultH }]);
  };
  const removeWidget = (id: string) => layout && commit(layout.filter(it => it.i !== id));
  const setWidgetCompanies = (id: string, ids: string[]) =>
    layout && commit(layout.map(it => it.i === id ? { ...it, companyIds: ids } : it));

  // Companies a widget actually renders ([] => all visible companies)
  const companiesFor = (w: DashboardWidget) =>
    w.companyIds.length ? companies.filter(c => w.companyIds.includes(c.id)) : companies;
  const sourceLabel = (w: DashboardWidget) => {
    if (!w.companyIds.length) return 'All companies';
    if (w.companyIds.length === 1) return companies.find(c => c.id === w.companyIds[0])?.name || '1 company';
    return `${w.companyIds.length} companies`;
  };

  if (!layout) {
    return (
      <div className="flex items-center justify-center py-32 text-slate-400">
        <Loader2 className="animate-spin mr-2" size={18} /> Loading your dashboard…
      </div>
    );
  }

  // Mobile: a 12-col free grid can't work on a phone, so stack widgets full-width
  // in layout order. Drag/resize is desktop-only.
  if (isMobile) {
    const ordered = [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
    // Widgets stack vertically on mobile, so give each a height that fits its
    // content in a single column (the asset breakdown stacks tallest).
    const MOBILE_H: Record<string, number> = {
      'asset-breakdown': 520,
      'total-portfolio': 180,
      'summary-by-bank': 300,
      'summary-by-company': 300,
      'summary-by-currency': 300,
      'portfolio-table': 380,
      'company-detail': 380,
    };
    return (
      <div className="w-full px-3 py-4 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">My Dashboard</h2>
          <p className="text-xs text-slate-400">Your personal view across companies.</p>
        </div>
        <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold w-max">
          {([['month', 'Month'], ['7d', '7D'], ['30d', '30D'], ['90d', '90D']] as const).map(([id, label]) => (
            <button key={id} onClick={() => setPeriod(id)} className={`px-3 py-2 ${period === id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>
          ))}
        </div>
        {ordered.length === 0 ? (
          <div className="border-2 border-dashed border-slate-200 rounded-2xl p-10 text-center text-slate-400">
            <LayoutDashboard size={24} className="mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-semibold text-slate-500">No widgets yet</p>
            <p className="text-xs mt-1">Open the dashboard on a larger screen to add and arrange widgets.</p>
          </div>
        ) : (
          ordered.map(it => (
            <div
              key={it.i}
              className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden"
              style={{ height: MOBILE_H[it.type] ?? 320 }}
            >
              <WidgetView type={it.type} companies={companiesFor(it)} history={histData} />
            </div>
          ))
        )}
        <p className="text-[11px] text-slate-400 text-center pt-2">Open on a larger screen to rearrange widgets.</p>
      </div>
    );
  }

  const gridHeight = layout.reduce((m, it) => Math.max(m, it.y + it.h), 0);

  return (
    <div className="w-full px-4 md:px-6 py-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-slate-900">My Dashboard</h2>
          <p className="text-xs text-slate-400">{editing ? 'Drag to move, pull the corner to resize, set each widget’s source companies.' : 'Your personal view across companies.'}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {saveState !== 'idle' && (
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              {saveState === 'saving' ? <><Loader2 size={12} className="animate-spin" /> Saving</> : <><Check size={12} className="text-emerald-500" /> Saved</>}
            </span>
          )}
          {/* Trend window — defaults to current month */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-white overflow-hidden text-xs font-semibold">
            {([['month', 'This month'], ['7d', '7D'], ['30d', '30D'], ['90d', '90D']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setPeriod(id)} className={`px-2.5 py-2 transition-colors ${period === id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50'}`}>{label}</button>
            ))}
          </div>
          {editing && (
            <div className="relative">
              <button onClick={() => setShowAdd(v => !v)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                <Plus size={15} /> Add widget
              </button>
              {showAdd && <AddWidgetMenu onAdd={addWidget} onClose={() => setShowAdd(false)} />}
            </div>
          )}
          <button
            onClick={() => { setEditing(v => !v); setConfigId(null); setShowAdd(false); }}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${editing ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'}`}
          >
            {editing ? <><Check size={15} /> Done</> : <><Pencil size={15} /> Edit layout</>}
          </button>
        </div>
      </div>

      {layout.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-16 text-center text-slate-400">
          <LayoutDashboard size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="font-semibold text-slate-500">Your dashboard is empty</p>
          <p className="text-sm mt-1">Click <span className="font-semibold">Edit layout</span> then <span className="font-semibold">Add widget</span> to build your view.</p>
        </div>
      ) : (
        <div className={`rounded-2xl p-3 md:p-4 transition-colors ${editing ? 'border-2 border-dashed border-indigo-300 bg-indigo-50/20' : 'border border-slate-200 bg-white/40'}`}>
        <div
          ref={containerRef}
          className="relative w-full"
          style={{ height: hPx(gridHeight) + GAP }}
        >
          {layout.map(it => {
            const dragging = drag?.id === it.i;
            return (
              <div
                key={it.i}
                className={`absolute ${dragging ? 'z-20' : 'z-10'}`}
                style={{
                  left: xPx(it.x), top: yPx(it.y), width: wPx(it.w), height: hPx(it.h),
                  transition: dragging ? 'none' : 'left .18s ease, top .18s ease, width .18s ease, height .18s ease',
                }}
              >
                <div className={`relative h-full bg-white rounded-xl border shadow-sm overflow-hidden ${editing ? 'border-indigo-200 ring-1 ring-indigo-100' : 'border-slate-200'} ${dragging ? 'shadow-2xl' : ''}`}>
                  {editing && (
                    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-2 py-1.5 bg-indigo-50/90 backdrop-blur border-b border-indigo-100">
                      <div
                        onPointerDown={e => startMove(e, it)}
                        className="flex items-center gap-1 text-indigo-500 cursor-move select-none"
                        title="Drag to move"
                      >
                        <GripVertical size={14} />
                        <span className="text-[11px] font-bold uppercase tracking-wide">{widgetMeta(it.type).label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setConfigId(configId === it.i ? null : it.i)} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-indigo-600 hover:bg-indigo-100" title="Source companies">
                          <Settings2 size={13} /> {sourceLabel(it)}
                        </button>
                        <button onClick={() => removeWidget(it.i)} className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50" title="Remove">
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {configId === it.i && (
                    <CompanyPicker
                      widget={it}
                      companies={companies}
                      onChange={ids => setWidgetCompanies(it.i, ids)}
                      onClose={() => setConfigId(null)}
                    />
                  )}

                  <div className={`h-full ${editing ? 'pt-9' : ''} ${dragging ? 'pointer-events-none' : ''}`}>
                    <WidgetView type={it.type} companies={companiesFor(it)} history={histData} />
                  </div>

                  {editing && (
                    <div
                      onPointerDown={e => startResize(e, it)}
                      className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize z-20 flex items-end justify-end p-0.5"
                      title="Drag to resize"
                    >
                      <div className="w-2.5 h-2.5 border-r-2 border-b-2 border-indigo-400 rounded-sm" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}
    </div>
  );
}
