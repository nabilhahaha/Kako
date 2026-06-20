'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Upload, Wand2, Check, MapPin, X, FileDown, RotateCcw, Square, PenTool, Layers, LayoutGrid, Route as RouteIcon, Map as MapIcon, CalendarDays, Compass, LogOut, Hand } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { buildTisDatasetFromRows, applyColumnMapping, TIS_MAP_FIELDS, type TisFieldKey } from '@/lib/tis/upload';
import { isValidGeo, type TisDataset } from '@/lib/tis/dataset';
import { applyScenario, type Scenario } from '@/lib/tis/scenario';
import { moveCustomer } from '@/lib/tis/plan-edit';
import { simpleGeoSplit } from '@/lib/tis/optimize-routes';
import { routeReview, routeColors, routeIdsOf, unassignedCount, unassignedIds, routeExportRows, needsReviewExportRows, routeChangeRows, changeSummaryRows, aggregateReview, hasSalesData } from '@/lib/tis/route-planner';
import { formatFrequency } from '@/lib/route-optimization/visit-frequency';
import { buildXlsxWorkbook } from '@/lib/erp/xlsx-write';
import { parseUploadColumns } from './import-actions';
import { SelectionMap, type SelMapPoint, type SelMapHull } from './selection-map';
import { TrialBanner } from './trial-banner';
import { JourneyPanel, type JourneyInputCustomer } from './journey-panel';
import { DayPlanner } from './day-planner';
import type { DpCustomer } from '@/lib/tis/day-planner-import';
import { savePlannerDraft, loadPlannerDraft, clearPlannerDraft, type PlannerDraft } from './planner-draft';
import { WhatsAppContact } from '@/components/route-planner/whatsapp-contact';
import { buildSupportWhatsAppUrl, type RoutePlannerSubscriptionView } from '@/lib/erp/route-planner-subscription';

const NEW_ROUTE = '__new';
const UNASSIGNED = '__unassigned';

function emptyScenario(): Scenario { return { id: 'plan', name: 'Route plan', assignments: [] }; }
const fmt = (n: number) => Math.round(n).toLocaleString();
/** Compact money/number: 1,140,000 → 1.14M · 425,000 → 425K. */
const fmtShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toFixed(2).replace(/\.?0+$/, '')}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(1).replace(/\.?0+$/, '')}K`;
  return Math.round(n).toLocaleString();
};

/** Lightweight inline territory/route illustration for the demo welcome (no images,
 *  no animation — keeps it fast). */
function RoutePlanArt() {
  return (
    <svg viewBox="0 0 320 220" className="h-auto w-full" role="img" aria-hidden>
      <rect x="8" y="8" width="304" height="204" rx="14" fill="#f1f5f9" />
      <path d="M40 150 C 90 90, 150 190, 210 110 S 290 60, 296 70" fill="none" stroke="#94a3b8" strokeWidth="2.5" strokeDasharray="6 6" />
      <g>
        <circle cx="70" cy="120" r="26" fill="#2563eb" fillOpacity="0.12" />
        <circle cx="70" cy="120" r="6" fill="#2563eb" />
        <circle cx="58" cy="108" r="4" fill="#2563eb" /><circle cx="86" cy="112" r="4" fill="#2563eb" /><circle cx="64" cy="134" r="4" fill="#2563eb" />
      </g>
      <g>
        <circle cx="180" cy="150" r="30" fill="#16a34a" fillOpacity="0.12" />
        <circle cx="180" cy="150" r="6" fill="#16a34a" />
        <circle cx="166" cy="138" r="4" fill="#16a34a" /><circle cx="196" cy="142" r="4" fill="#16a34a" /><circle cx="186" cy="166" r="4" fill="#16a34a" /><circle cx="168" cy="162" r="4" fill="#16a34a" />
      </g>
      <g>
        <circle cx="262" cy="92" r="24" fill="#d97706" fillOpacity="0.12" />
        <circle cx="262" cy="92" r="6" fill="#d97706" />
        <circle cx="250" cy="82" r="4" fill="#d97706" /><circle cx="274" cy="86" r="4" fill="#d97706" /><circle cx="258" cy="106" r="4" fill="#d97706" />
      </g>
    </svg>
  );
}

/** Reliable cross-browser file download: the anchor MUST be in the document for
 *  `.click()` to trigger a download in Firefox/Safari (and reliably in Chrome). */
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener'; a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function downloadXlsx(bytes: Uint8Array, filename: string) {
  // Copy into a fresh ArrayBuffer so the Blob owns contiguous bytes (avoids any
  // shared-buffer/view edge cases across engines).
  const buf = bytes.slice().buffer;
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

/**
 * Simple Route Planner (MVP, P0–P3): Upload → Split → Correct on the map → Approve
 * → Export routes to Excel. Session-only; nothing is written to live data. Reuses the
 * TIS upload pipeline, the shared scenario/plan-edit engine and a single-pass geo
 * split — the manager does the final shaping by box/click-selecting on the map.
 */
export function RoutePlannerWorkspace({ focus = false, demo = false, subscription }: { focus?: boolean; demo?: boolean; subscription?: RoutePlannerSubscriptionView } = {}) {
  const { t, locale, setLocale } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);

  // Trial / subscription gating. When a trial or subscription has lapsed the planner
  // stays viewable but the mutating actions (upload, split, approve, export) are locked.
  const subCaps = subscription?.capabilities ?? { canUpload: true, canRunSplit: true, canApprove: true, canExport: true };

  const [dataset, setDataset] = useState<TisDataset | null>(null);
  const [scenario, setScenario] = useState<Scenario>(emptyScenario());
  const [method, setMethod] = useState<'assisted' | 'manual' | 'current' | null>(null);
  const [baseline, setBaseline] = useState<Scenario | null>(null);       // the loaded "Current" allocation
  const [allocView, setAllocView] = useState<'current' | 'proposed'>('proposed');
  const [history, setHistory] = useState<Scenario[]>([]);
  const [generated, setGenerated] = useState(false);
  const [routeCount, setRouteCount] = useState('8');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [targetRoute, setTargetRoute] = useState<string>(NEW_ROUTE);
  const [focusedRoutes, setFocusedRoutes] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState<'pan' | 'box' | 'draw'>('pan');
  const [showAllBoundaries, setShowAllBoundaries] = useState(false);
  const [showOnlySelected, setShowOnlySelected] = useState(false);
  const [compactList, setCompactList] = useState(true);
  const [sortKey, setSortKey] = useState<'route' | 'customers' | 'workload' | 'sales' | 'salesPerCustomer'>('route');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const [selectingInfo, setSelectingInfo] = useState<{ count: number; sales: number } | null>(null);
  const [reviewStats, setReviewStats] = useState<{ initial: number; absorbed: number; final: number } | null>(null);
  const [approved, setApproved] = useState(false);
  const [exported, setExported] = useState(false);
  const [journeyMode, setJourneyMode] = useState(false);
  const [dayPlannerOpen, setDayPlannerOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mapState, setMapState] = useState<{ headers: string[]; records: Record<string, string>[]; map: Partial<Record<TisFieldKey, string>> } | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  // ── Auto Save + Draft Recovery (session work survives Back / Refresh / close) ──
  const [pendingDraft, setPendingDraft] = useState<PlannerDraft | null>(null); // found on load, awaiting decision
  const decidedDraft = useRef(false); // once restored/discarded, stop offering recovery

  // On first mount, look for a saved draft. Offer recovery only on a fresh load
  // (no dataset yet) so we never clobber a session already in progress.
  useEffect(() => {
    let alive = true;
    loadPlannerDraft().then((d) => { if (alive && d && !dataset && !decidedDraft.current) setPendingDraft(d); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save the full snapshot (debounced) after every meaningful change. Suspended while
  // the recovery prompt is open so we don't overwrite the found draft before the user decides.
  useEffect(() => {
    if (!dataset || pendingDraft) return;
    const id = setTimeout(() => {
      void savePlannerDraft({
        v: 1, savedAt: Date.now(), dataset, scenario, baseline, method, allocView,
        generated, approved, exported, routeCount, targetRoute,
        focusedRoutes: [...focusedRoutes], selectedIds: [...selectedIds], selectMode,
        showAllBoundaries, showOnlySelected, compactList, sortKey, sortDir,
      });
    }, 600);
    return () => clearTimeout(id);
  }, [dataset, scenario, baseline, method, allocView, generated, approved, exported, routeCount, targetRoute, focusedRoutes, selectedIds, selectMode, showAllBoundaries, showOnlySelected, compactList, sortKey, sortDir, pendingDraft]);

  // Unsaved-changes guard: warn before Refresh / Close / Back-out when work is in progress
  // and not yet exported. (Auto-save still has it covered, but the manager gets a heads-up.)
  const dirty = !!dataset && !exported;
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function restoreDraft() {
    const d = pendingDraft;
    if (!d) return;
    decidedDraft.current = true;
    setDataset(d.dataset); setScenario(d.scenario); setBaseline(d.baseline);
    setMethod(d.method); setAllocView(d.allocView); setGenerated(d.generated);
    setApproved(d.approved); setExported(d.exported); setRouteCount(d.routeCount);
    setTargetRoute(d.targetRoute); setFocusedRoutes(new Set(d.focusedRoutes));
    setSelectedIds(new Set(d.selectedIds)); setSelectMode(d.selectMode);
    setShowAllBoundaries(d.showAllBoundaries); setShowOnlySelected(d.showOnlySelected);
    setCompactList(d.compactList); setSortKey(d.sortKey); setSortDir(d.sortDir);
    setPendingDraft(null);
    setMsg({ tone: 'ok', text: t('routePlanner.draftRestored') });
  }
  function discardDraft() {
    decidedDraft.current = true;
    setPendingDraft(null);
    void clearPlannerDraft();
  }

  // In Current Allocation Review the manager can flip the whole view between the loaded
  // "Current" allocation (baseline) and the edited "Proposed" one. Edits always target the
  // working `scenario`; viewing Current just renders the baseline read-only.
  const viewingCurrent = method === 'current' && !!baseline && allocView === 'current';
  const activeScenario = viewingCurrent ? baseline! : scenario;

  const applied = useMemo(() => (dataset ? applyScenario(dataset, activeScenario) : null), [dataset, activeScenario]);
  const colors = useMemo(() => (dataset ? routeColors(dataset, activeScenario) : new Map<string, string>()), [dataset, activeScenario]);
  const ids = useMemo(() => (dataset ? routeIdsOf(dataset, activeScenario) : []), [dataset, activeScenario]);
  // Generated routes (opt-route-*) read as "Route N"; routes loaded from the file
  // (Current Allocation) keep their real id (route code / salesman name).
  const routeLabelOf = (rid: string | null) => {
    if (!rid) return t('routePlanner.unassigned');
    if (rid.startsWith('opt-route-')) return `${t('routePlanner.route')} ${ids.indexOf(rid) + 1}`;
    return rid;
  };
  const reviews = useMemo(() => (dataset ? routeReview(dataset, activeScenario) : []), [dataset, activeScenario]);
  const routeCountById = useMemo(() => new Map(reviews.map((r) => [r.routeId, r.customers])), [reviews]);
  const hasSales = useMemo(() => (dataset ? hasSalesData(dataset) : false), [dataset]);
  const unassigned = useMemo(() => (dataset ? unassignedCount(dataset, activeScenario) : 0), [dataset, activeScenario]);

  // Customers (with coordinates) handed to the Day Planner as its "existing dataset"
  // source, so the user can plan a day without re-uploading a file.
  const daySeedCustomers = useMemo<DpCustomer[]>(() => {
    if (!dataset) return [];
    return dataset.customers
      .filter((c) => c.geo && Number.isFinite(c.geo.lat) && Number.isFinite(c.geo.lng))
      .map((c) => ({
        id: c.id, code: c.code, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng, sales: c.salesValue ?? undefined,
        city: c.city, channel: c.channel, class: c.grade, salesman: c.ownership.salesmanId,
      }));
  }, [dataset]);

  // Route list sorting + top/bottom-10%-by-sales highlight.
  const effectiveSortKey = (!hasSales && (sortKey === 'sales' || sortKey === 'salesPerCustomer')) ? 'route' : sortKey;
  const sortedReviews = useMemo(() => {
    const val = (r: typeof reviews[number]) =>
      effectiveSortKey === 'customers' ? r.customers
      : effectiveSortKey === 'workload' ? r.workloadHours
      : effectiveSortKey === 'sales' ? r.sales
      : effectiveSortKey === 'salesPerCustomer' ? (r.customers ? r.sales / r.customers : 0)
      : r.index;
    if (effectiveSortKey === 'route') return [...reviews].sort((a, b) => sortDir === 'asc' ? b.index - a.index : a.index - b.index);
    return [...reviews].sort((a, b) => sortDir === 'desc' ? val(b) - val(a) : val(a) - val(b));
  }, [reviews, effectiveSortKey, sortDir]);
  const salesTier = useMemo(() => {
    const m = new Map<string, 'top' | 'bottom'>();
    if (!hasSales || reviews.length < 5) return m;
    const bySales = [...reviews].sort((a, b) => b.sales - a.sales);
    const n = Math.max(1, Math.ceil(bySales.length * 0.1));
    bySales.slice(0, n).forEach((r) => m.set(r.routeId, 'top'));
    bySales.slice(-n).forEach((r) => { if (!m.has(r.routeId)) m.set(r.routeId, 'bottom'); });
    return m;
  }, [reviews, hasSales]);

  // Current → Proposed diff (Current Allocation Review), incl. per-route sales when present.
  const diff = useMemo(() => {
    if (!dataset || !baseline) return null;
    const base = applyScenario(dataset, baseline).customers;
    const work = applyScenario(dataset, scenario).customers;
    const baseR = new Map(base.map((c) => [c.id, c.ownership.routeId]));
    const workR = new Map(work.map((c) => [c.id, c.ownership.routeId]));
    const salesOf = new Map(base.map((c) => [c.id, c.salesValue ?? 0]));
    let moved = 0, unchanged = 0;
    const before = new Map<string, number>(), after = new Map<string, number>();
    const beforeS = new Map<string, number>(), afterS = new Map<string, number>();
    for (const [id, r] of baseR) if (r) { before.set(r, (before.get(r) ?? 0) + 1); beforeS.set(r, (beforeS.get(r) ?? 0) + (salesOf.get(id) ?? 0)); }
    for (const [id, r] of workR) if (r) { after.set(r, (after.get(r) ?? 0) + 1); afterS.set(r, (afterS.get(r) ?? 0) + (salesOf.get(id) ?? 0)); }
    for (const [id, br] of baseR) (br === (workR.get(id) ?? null) ? unchanged++ : moved++);
    const baseRoutes = new Set(before.keys()), workRoutes = new Set(after.keys());
    const newRoutes = [...workRoutes].filter((r) => !baseRoutes.has(r)).length;
    const removedRoutes = [...baseRoutes].filter((r) => !workRoutes.has(r)).length;
    const perRoute = [...new Set([...baseRoutes, ...workRoutes])]
      .map((r) => ({ route: r, before: before.get(r) ?? 0, after: after.get(r) ?? 0, diff: (after.get(r) ?? 0) - (before.get(r) ?? 0), beforeS: Math.round(beforeS.get(r) ?? 0), afterS: Math.round(afterS.get(r) ?? 0) }))
      .filter((x) => x.diff !== 0 || x.afterS !== x.beforeS)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || Math.abs(b.afterS - b.beforeS) - Math.abs(a.afterS - a.beforeS));
    return { moved, unchanged, newRoutes, removedRoutes, perRoute };
  }, [dataset, baseline, scenario]);
  const datasetSales = useMemo(() => (dataset ? dataset.customers.reduce((s, c) => s + (c.salesValue ?? 0), 0) : 0), [dataset]);

  // Customer ids belonging to the focused routes (for fade + zoom-to-extent).
  const focusIds = useMemo(() => {
    if (!applied || focusedRoutes.size === 0) return new Set<string>();
    return new Set(applied.customers.filter((c) => c.ownership.routeId && focusedRoutes.has(c.ownership.routeId)).map((c) => c.id));
  }, [applied, focusedRoutes]);

  const points = useMemo<SelMapPoint[]>(() => {
    if (!applied) return [];
    const focusing = focusedRoutes.size > 0;
    const onlySel = showOnlySelected && focusing; // hide everything except the focused routes
    let cs = applied.customers.filter((c) => isValidGeo(c.geo));
    if (onlySel) cs = cs.filter((c) => c.ownership.routeId && focusedRoutes.has(c.ownership.routeId));
    return cs.map((c) => {
      const rid = c.ownership.routeId;
      return {
        id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng,
        color: rid ? colors.get(rid) ?? '#94a3b8' : '#f59e0b',
        review: !rid,
        sales: c.salesValue ?? 0,
        dim: focusing && !onlySel && !(rid && focusedRoutes.has(rid)),
        meta: { code: c.code, route: rid, routeLabel: routeLabelOf(rid), routeColor: rid ? colors.get(rid) : undefined, routeCount: rid ? routeCountById.get(rid) : undefined, sales: c.salesValue != null ? fmt(c.salesValue) : undefined, frequency: c.frequency ? formatFrequency(c.frequency) : '' },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, colors, focusedRoutes, ids, showOnlySelected]);

  // Journey Planning input: every assigned, geo-located customer with its route + sales.
  const journeyCustomers = useMemo<JourneyInputCustomer[]>(() => {
    if (!applied) return [];
    return applied.customers
      .filter((c) => c.ownership.routeId && isValidGeo(c.geo))
      .map((c) => ({ id: c.id, lat: c.geo!.lat, lng: c.geo!.lng, code: c.code ?? null, name: c.name, routeId: c.ownership.routeId!, routeLabel: routeLabelOf(c.ownership.routeId!), sales: c.salesValue ?? undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied]);

  // Route boundaries: focused routes (always), or all when "show all boundaries" is on.
  const hulls = useMemo<SelMapHull[]>(() => {
    const show = focusedRoutes.size ? reviews.filter((r) => focusedRoutes.has(r.routeId)) : (showAllBoundaries ? reviews : []);
    return show.map((r) => ({ id: r.routeId, color: r.color, ring: r.hull }));
  }, [reviews, focusedRoutes, showAllBoundaries]);

  const summary = useMemo(() => aggregateReview(reviews, focusedRoutes), [reviews, focusedRoutes]);

  // Move preview: how many selected (+ sales), broken down by current route.
  const movePreview = useMemo(() => {
    if (!applied || selectedIds.size === 0) return null;
    const byLabel = new Map<string, { n: number; sales: number }>();
    let totalSales = 0;
    for (const c of applied.customers) if (selectedIds.has(c.id)) {
      const label = c.ownership.routeId ? routeLabelOf(c.ownership.routeId) : t('routePlanner.needsReview');
      const e = byLabel.get(label) ?? { n: 0, sales: 0 };
      e.n++; e.sales += c.salesValue ?? 0; byLabel.set(label, e);
      totalSales += c.salesValue ?? 0;
    }
    const breakdown = [...byLabel.entries()].map(([label, v]) => ({ label, n: v.n, sales: Math.round(v.sales) })).sort((a, b) => b.n - a.n);
    return { count: selectedIds.size, totalSales: Math.round(totalSales), breakdown };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applied, selectedIds, ids]);

  // Destination options for both the popup and the toolbar: existing routes FIRST,
  // then Keep-unassigned, then "New route" LAST (creating a route is secondary).
  const routeOptions = useMemo(() => [
    ...ids.map((id) => ({ value: id, label: routeLabelOf(id) })),
    { value: UNASSIGNED, label: t('routePlanner.keepUnassigned') },
    { value: NEW_ROUTE, label: `＋ ${t('routePlanner.newRoute')}` },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [ids]);
  // Guard a stale target (e.g. a route that was emptied out) → fall back to the first route.
  const effectiveTarget = (targetRoute === NEW_ROUTE || targetRoute === UNASSIGNED || ids.includes(targetRoute)) ? targetRoute : (ids[0] ?? NEW_ROUTE);
  const targetLabel = effectiveTarget === NEW_ROUTE ? t('routePlanner.newRoute') : effectiveTarget === UNASSIGNED ? t('routePlanner.keepUnassigned') : routeLabelOf(effectiveTarget);

  // ── Upload → column mapping ──
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = '';
    if (!file) return;
    setImporting(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseUploadColumns(fd);
      if (!res.ok) { setMsg({ tone: 'err', text: t(`routePlanner.${res.error}`) }); return; }
      setMapState({ headers: res.headers, records: res.records, map: res.suggested });
    } catch {
      setMsg({ tone: 'err', text: t('routePlanner.err_parse') });
    } finally { setImporting(false); }
  }
  function setFieldMap(field: TisFieldKey, header: string) {
    setMapState((m) => (m ? { ...m, map: { ...m.map, [field]: header || undefined } } : m));
  }
  function confirmMapping() {
    if (!mapState) return;
    const rows = applyColumnMapping(mapState.records, mapState.map);
    const ds = buildTisDatasetFromRows(rows, { source: 'upload' });
    setDataset(ds);
    setScenario(emptyScenario());
    setMethod(null); setHistory([]); setGenerated(false); setApproved(false); setSelectedIds(new Set()); setFocusedRoutes(new Set());
    setMapState(null);
    setMsg({ tone: 'ok', text: t('routePlanner.importOk').replace('{n}', String(ds.customers.length)) });
  }
  function hasRouteCol() { return !!dataset?.customers.some((c) => c.ownership.routeId); }
  function hasSalesmanCol() { return !!dataset?.customers.some((c) => c.ownership.salesmanId); }
  /** Pick a route-creation method. */
  function chooseMethod(m: 'assisted' | 'manual' | 'current') {
    if (!dataset) return;
    setMethod(m); setHistory([]); setApproved(false); setExported(false); setSelectedIds(new Set()); setFocusedRoutes(new Set()); setReviewStats(null);
    setBaseline(null); setAllocView('proposed');
    if (m === 'manual') {
      const blank = dataset.customers.reduce((s, c) => moveCustomer(s, c.id, null), emptyScenario());
      setScenario(blank); setGenerated(true); setSelectMode('pan'); setShowAllBoundaries(true);
      setTargetRoute(NEW_ROUTE); // draw → select, then Apply to "New route" creates a territory
    } else if (m === 'current') {
      // Load the existing allocation EXACTLY: Route column if present, else Salesman.
      const useRoute = hasRouteCol();
      const loaded = dataset.customers.reduce((s, c) => {
        const rid = useRoute ? c.ownership.routeId : c.ownership.salesmanId;
        return rid ? moveCustomer(s, c.id, rid) : s;
      }, emptyScenario());
      setScenario(loaded); setBaseline(loaded); setGenerated(true); setSelectMode('pan'); setShowAllBoundaries(false);
      setTargetRoute(''); // → effectiveTarget picks the first existing route
    } else {
      setScenario(emptyScenario()); setGenerated(false); setSelectMode('pan');
    }
  }
  function reset() {
    setDataset(null); setScenario(emptyScenario()); setMethod(null); setHistory([]); setGenerated(false); setApproved(false); setExported(false);
    setSelectedIds(new Set()); setFocusedRoutes(new Set()); setMapState(null); setMsg(null); setReviewStats(null);
    setBaseline(null); setAllocView('proposed');
  }
  /** One-step-back history (drawing territories / moving). Keeps the last 30 states. */
  function pushHistory(prev: Scenario) { setHistory((h) => [...h.slice(-29), prev]); }
  function undo() { setHistory((h) => { if (h.length === 0) return h; setScenario(h[h.length - 1]); setApproved(false); setSelectedIds(new Set()); return h.slice(0, -1); }); }
  function onTemplate() {
    const header = 'code,name,lat,lng,route,frequency';
    const rows = ['C001,Sample Market,21.5810,39.1650,R-1,weekly', 'C002,Sample Grocery,24.7100,46.6700,R-2,2'];
    downloadBlob(new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), 'route-planner-template.csv');
  }

  // ── Split / Correct / Approve / Export ──
  function generate() {
    if (!dataset || !subCaps.canRunSplit) return;
    pushHistory(scenario);
    const k = Math.max(1, Math.round(Number(routeCount)) || 1);
    const plan = simpleGeoSplit(dataset.customers, k);
    const sc = plan.assignments.reduce((s, a) => moveCustomer(s, a.customerId, a.routeId ?? null), emptyScenario());
    setScenario(sc); setGenerated(true); setApproved(false); setExported(false); setSelectedIds(new Set()); setFocusedRoutes(new Set());
    setReviewStats({ initial: plan.needsReviewInitial ?? 0, absorbed: plan.needsReviewAbsorbed ?? 0, final: plan.needsReview ?? 0 });
    // Default the move target to the first real route (Route → Route is the primary flow).
    setTargetRoute(plan.routes[0]?.routeId ?? NEW_ROUTE);
  }
  function nextNewRouteId(): string {
    const present = new Set(ids);
    for (let n = 1; n <= present.size + 1; n++) { const id = `opt-route-${n}`; if (!present.has(id)) return id; }
    return `opt-route-${present.size + 1}`;
  }
  /** Resolve a dropdown value (route id | New | Unassigned) to a concrete route id/null. */
  function resolveDest(value: string): string | null {
    return value === NEW_ROUTE ? nextNewRouteId() : value === UNASSIGNED ? null : value;
  }
  function moveSelectedTo(value: string) {
    if (viewingCurrent || selectedIds.size === 0) return;
    pushHistory(scenario);
    const dest = resolveDest(value);
    let sc = scenario;
    for (const id of selectedIds) sc = moveCustomer(sc, id, dest);
    setScenario(sc); setApproved(false); setSelectedIds(new Set()); setCtxMenu(null);
  }
  function moveSelected() { moveSelectedTo(effectiveTarget); }
  function moveSingle(id: string, value: string) {
    if (viewingCurrent) return;
    pushHistory(scenario);
    setScenario(moveCustomer(scenario, id, resolveDest(value))); setApproved(false);
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
  }
  function toggleFocus(routeId: string) {
    setFocusedRoutes((prev) => { const next = new Set(prev); next.has(routeId) ? next.delete(routeId) : next.add(routeId); return next; });
  }
  function focusAll() { setFocusedRoutes(new Set(ids)); }
  function clearFocus() { setFocusedRoutes(new Set()); setShowOnlySelected(false); }
  function toggle(id: string) {
    setSelectedIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }
  function boxSelect(hits: string[]) {
    setSelectedIds((prev) => { const next = new Set(prev); for (const h of hits) next.add(h); return next; });
  }
  function selectNeedsReview() {
    if (!dataset) return;
    setSelectedIds(new Set(unassignedIds(dataset, scenario)));
  }
  function exportRoutes() {
    if (!dataset || !approved || !subCaps.canExport) return;
    try {
      const sheets = [{ name: 'Route Allocation', rows: routeExportRows(dataset, scenario, routeLabelOf) }];
      if (unassigned > 0) sheets.push({ name: 'Needs Review', rows: needsReviewExportRows(dataset, scenario) });
      if (method === 'current' && baseline) {
        sheets.push({ name: 'Route Changes', rows: routeChangeRows(dataset, baseline, scenario, routeLabelOf, hasSales) });
        sheets.push({ name: 'Change Summary', rows: changeSummaryRows(dataset, baseline, scenario, routeLabelOf, hasSales) });
      }
      const assigned = sheets[0].rows.length - 1;
      downloadXlsx(buildXlsxWorkbook(sheets), 'route-allocation.xlsx');
      setExported(true);
      setMsg({ tone: 'ok', text: t('routePlanner.exportOk').replace('{n}', String(assigned)).replace('{r}', String(ids.length)) });
    } catch (e) {
      setMsg({ tone: 'err', text: `${t('routePlanner.exportErr')} ${e instanceof Error ? e.message : ''}`.trim() });
    }
  }

  // Demo branding header (wordmark + language toggle + "Route Planner Demo" badge) —
  // focus mode only. The language toggle works in the chrome-free demo layout (the
  // i18n provider lives at the root and sets the locale cookie + flips RTL/LTR).
  const brandHeader = focus ? (
    <div className={`flex flex-wrap items-center justify-between gap-2 ${dataset ? 'mb-1' : 'mb-3'}`}>
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm"><RouteIcon className="h-4 w-4" /></div>
        <p className="text-sm font-bold tracking-tight">VANTORA <span className="font-medium text-muted-foreground">Route Planner</span></p>
      </div>
      <div className="flex items-center gap-1.5">
        {demo && <span className="hidden rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary sm:inline">{t('routePlanner.demoBadge')}</span>}
        <div className="inline-flex overflow-hidden rounded-md border text-[11px]">
          <button onClick={() => setLocale('en')} className={`px-2 py-0.5 ${locale === 'en' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>EN</button>
          <button onClick={() => setLocale('ar')} className={`border-s px-2 py-0.5 ${locale === 'ar' ? 'bg-primary font-semibold text-primary-foreground' : 'bg-background hover:bg-muted'}`}>العربية</button>
        </div>
        {/* Sign out — the chrome-free shell has no top bar, so we surface it here. */}
        <form action="/auth/signout" method="post">
          <button type="submit" className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium hover:bg-muted" title={t('common.signOut')}>
            <LogOut className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{t('common.signOut')}</span>
          </button>
        </form>
      </div>
    </div>
  ) : null;

  // Trial / subscription banner (shown whenever a subscription view is supplied).
  const subBanner = subscription ? <div className={focus ? 'shrink-0' : 'mb-3'}><TrialBanner sub={subscription} compact={focus} /></div> : null;

  // Draft-recovery banner (shown on a fresh load when a saved session is found).
  const draftBanner = pendingDraft ? (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5 text-amber-900 shadow-sm">
      <RotateCcw className="h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{t('routePlanner.draftFound')}</p>
        <p className="text-xs opacity-90">
          {t('routePlanner.draftDetail')
            .replace('{n}', String(pendingDraft.dataset.customers.length))
            .replace('{when}', new Date(pendingDraft.savedAt).toLocaleString(locale === 'ar' ? 'ar' : 'en'))}
        </p>
      </div>
      <Button size="sm" onClick={restoreDraft}><RotateCcw className="h-4 w-4" /> {t('routePlanner.draftRestore')}</Button>
      <Button size="sm" variant="ghost" onClick={discardDraft}><X className="h-4 w-4" /> {t('routePlanner.draftDiscard')}</Button>
    </div>
  ) : null;

  // Persistent capability nav — Day Planner and the planning capabilities stay reachable
  // from EVERY dataset-loaded screen (method chooser + planning), so nothing disappears
  // after upload and the user can switch capabilities without reloading data. Methods
  // reuse the loaded dataset (chooseMethod keeps `dataset`); Day Planner opens straight
  // onto it; Journey needs an allocation first (disabled until then).
  const capabilityNav = () => {
    if (!dataset) return null;
    const canCurrent = hasRouteCol() || hasSalesmanCol();
    const items = [
      { key: 'current', label: t('routePlanner.methodCurrent'), Icon: LayoutGrid, active: method === 'current', disabled: !canCurrent, title: !canCurrent ? t('routePlanner.methodCurrentNeed') : undefined, on: () => chooseMethod('current') },
      { key: 'assisted', label: t('routePlanner.methodAssisted'), Icon: Wand2, active: method === 'assisted', disabled: false, title: undefined, on: () => chooseMethod('assisted') },
      { key: 'manual', label: t('routePlanner.methodManual'), Icon: PenTool, active: method === 'manual', disabled: false, title: undefined, on: () => chooseMethod('manual') },
      { key: 'journey', label: t('routePlanner.cap_journey'), Icon: CalendarDays, active: false, disabled: reviews.length === 0, title: reviews.length === 0 ? t('routePlanner.jpNeedAlloc') : undefined, on: () => setJourneyMode(true) },
      { key: 'day', label: t('dayPlanner.title'), Icon: MapIcon, active: false, disabled: false, title: undefined, on: () => setDayPlannerOpen(true) },
    ];
    return (
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 print:hidden">
        <span className="text-[11px] font-medium text-muted-foreground">{t('routePlanner.capabilities')}</span>
        {items.map((it) => (
          <button key={it.key} onClick={it.on} disabled={it.disabled} title={it.title}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${it.active ? 'border-primary bg-primary text-primary-foreground' : 'hover:border-primary hover:bg-muted'}`}>
            <it.Icon className="h-3.5 w-3.5" /> {it.label}
          </button>
        ))}
      </div>
    );
  };

  // Full-screen overlays (Journey Planning + Day Planner). These MUST be rendered in
  // EVERY screen's return — the workspace has several early returns (welcome, upload,
  // method chooser, planning), and a capability-nav button only opens an overlay if
  // that screen's tree actually mounts it. Kept in one fragment so all returns share it.
  const overlays = (
    <>
      {journeyMode && <JourneyPanel customers={journeyCustomers} hasSales={hasSales} onClose={() => setJourneyMode(false)} />}
      {dayPlannerOpen && <DayPlanner hasSalesDefault={hasSales} seedCustomers={daySeedCustomers} autoUseDataset={daySeedCustomers.length > 0} onClose={() => setDayPlannerOpen(false)} />}
    </>
  );

  // ── Focus-mode welcome (demo, before upload): branded hero + capabilities ──
  if (focus && !dataset && !mapState) {
    const caps = [
      { icon: RouteIcon, title: t('routePlanner.cap_planning'), desc: t('routePlanner.cap_planningDesc') },
      { icon: Compass, title: t('routePlanner.cap_optimization'), desc: t('routePlanner.cap_optimizationDesc') },
      { icon: LayoutGrid, title: t('routePlanner.cap_current'), desc: t('routePlanner.cap_currentDesc') },
      { icon: CalendarDays, title: t('routePlanner.cap_journey'), desc: t('routePlanner.cap_journeyDesc') },
    ];
    return (
      <div className="mx-auto max-w-5xl">
        {overlays}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
        {brandHeader}
        {subBanner}
        {draftBanner}
        {msg && <p className={`mb-3 text-sm ${msg.tone === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
        <div className="overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/5 via-background to-background shadow-sm">
          <div className="grid items-center gap-6 p-8 md:grid-cols-2">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t('routePlanner.welcomeTitle')}</h1>
              <p className="mt-2 text-muted-foreground">{t('routePlanner.welcomeLead')}</p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button size="lg" onClick={() => fileRef.current?.click()} disabled={importing || !subCaps.canUpload} title={!subCaps.canUpload ? t('routePlanner.subLockedAction') : undefined}><Upload className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('routePlanner.chooseFile')}</Button>
                <Button size="lg" variant="outline" onClick={onTemplate}><FileDown className="h-4 w-4" /> {t('routePlanner.downloadTemplate')}</Button>
                <Button size="lg" variant="outline" onClick={() => setDayPlannerOpen(true)}><MapIcon className="h-4 w-4" /> {t('dayPlanner.title')}</Button>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('routePlanner.needHelp')}</span>
                <WhatsAppContact url={buildSupportWhatsAppUrl(subscription?.companyName, subscription?.tenantId, subscription?.status)} label={t('routePlanner.contactWhatsApp')} tone="outline" />
              </div>
            </div>
            <div className="hidden md:block"><RoutePlanArt /></div>
          </div>
          <div className="grid gap-3 border-t bg-muted/20 p-6 sm:grid-cols-2 lg:grid-cols-4">
            {caps.map((c) => (
              <div key={c.title} className="rounded-xl border bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><c.icon className="h-4 w-4" /></div>
                <p className="mt-3 text-sm font-semibold">{c.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{c.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Upload screen (file picker, then flexible column mapping) ──
  if (!dataset) {
    const mp = mapState?.map;
    const requiredOk = !!(mp?.name && mp?.lat && mp?.lng);
    let ready = 0;
    if (mapState && mp?.name && mp.lat && mp.lng) {
      const toNum = (v: string | undefined) => Number(String(v ?? '').trim());
      for (const r of mapState.records) {
        const nm = (r[mp.name] ?? '').toString().trim();
        const la = toNum(r[mp.lat]); const lo = toNum(r[mp.lng]);
        if (nm && Number.isFinite(la) && Number.isFinite(lo) && !(la === 0 && lo === 0)) ready++;
      }
    }
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {overlays}
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />
        {brandHeader}
        {subBanner}
        {draftBanner}
        {msg && <p className={`text-sm ${msg.tone === 'err' ? 'text-red-600' : 'text-emerald-600'}`}>{msg.text}</p>}
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-2 text-lg font-semibold"><Upload className="h-5 w-5" /> {t('routePlanner.uploadTitle')}</div>

            {!mapState ? (
              <>
                <p className="text-sm text-muted-foreground">{t('routePlanner.uploadLead2')}</p>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => fileRef.current?.click()} disabled={importing || !subCaps.canUpload} title={!subCaps.canUpload ? t('routePlanner.subLockedAction') : undefined}><Upload className="h-4 w-4" /> {importing ? t('routePlanner.importing') : t('routePlanner.chooseFile')}</Button>
                  <Button variant="outline" onClick={onTemplate}><FileDown className="h-4 w-4" /> {t('routePlanner.downloadTemplate')}</Button>
                  <Button variant="outline" onClick={() => setDayPlannerOpen(true)}><MapIcon className="h-4 w-4" /> {t('dayPlanner.title')}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('routePlanner.mappingLead').replace('{n}', String(mapState.records.length))}</p>
                {/* Stacked label-above-field layout: a clean 2-column grid with generous
                    column/row gaps so labels can never collide with adjacent fields — works
                    symmetrically in RTL (Arabic) and LTR (English). */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
                  {TIS_MAP_FIELDS.map((f) => (
                    <div key={f.key} className="flex min-w-0 flex-col gap-1">
                      <label htmlFor={`map-${f.key}`} className="truncate text-sm font-medium">
                        {t(`routePlanner.map_${f.key}`)} {f.required && <span className="text-red-600">*</span>}
                      </label>
                      <select
                        id={`map-${f.key}`}
                        className={`h-9 w-full rounded-md border bg-background px-2 text-sm ${f.required && !mp?.[f.key] ? 'border-red-400' : ''}`}
                        value={mp?.[f.key] ?? ''}
                        onChange={(e) => setFieldMap(f.key, e.target.value)}
                      >
                        <option value="">{t('routePlanner.map_none')}</option>
                        {mapState.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <p className={`text-sm ${requiredOk && ready > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {requiredOk ? t('routePlanner.mapReady').replace('{ready}', String(ready)).replace('{total}', String(mapState.records.length)) : t('routePlanner.mapRequired')}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" disabled={!requiredOk || ready === 0} onClick={confirmMapping}><Check className="h-4 w-4" /> {t('routePlanner.confirmImport')}</Button>
                  <Button size="sm" variant="ghost" onClick={() => setMapState(null)}>{t('routePlanner.cancel')}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t('routePlanner.sessionNote')}</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Method chooser (after upload) ──
  if (method === null) {
    const canCurrent = hasRouteCol() || hasSalesmanCol();
    const currentDesc = hasRouteCol() ? t('routePlanner.methodCurrentDescRoute') : t('routePlanner.methodCurrentDescSalesman');
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        {brandHeader}
        {subBanner}
        {overlays}
        {capabilityNav()}
        <p className="text-sm text-muted-foreground">{t('routePlanner.importOk').replace('{n}', String(dataset.customers.length))} {t('routePlanner.chooseMethod')}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {canCurrent && (
            <button onClick={() => chooseMethod('current')} className="rounded-lg border-2 border-primary/50 bg-primary/5 p-5 text-start transition hover:border-primary hover:bg-primary/10">
              <div className="flex items-center gap-2 text-base font-semibold"><LayoutGrid className="h-5 w-5 text-primary" /> {t('routePlanner.methodCurrent')}</div>
              <p className="mt-2 text-sm text-muted-foreground">{currentDesc}</p>
            </button>
          )}
          <button onClick={() => chooseMethod('assisted')} className="rounded-lg border bg-background p-5 text-start transition hover:border-primary hover:bg-primary/5">
            <div className="flex items-center gap-2 text-base font-semibold"><Wand2 className="h-5 w-5 text-primary" /> {t('routePlanner.methodAssisted')}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t('routePlanner.methodAssistedDesc')}</p>
          </button>
          <button onClick={() => chooseMethod('manual')} className="rounded-lg border bg-background p-5 text-start transition hover:border-primary hover:bg-primary/5">
            <div className="flex items-center gap-2 text-base font-semibold"><PenTool className="h-5 w-5 text-primary" /> {t('routePlanner.methodManual')}</div>
            <p className="mt-2 text-sm text-muted-foreground">{t('routePlanner.methodManualDesc')}</p>
          </button>
        </div>
        <Button variant="ghost" size="sm" onClick={reset}><RotateCcw className="h-4 w-4" /> {t('routePlanner.newUpload')}</Button>
      </div>
    );
  }

  // ── Planning screen ──
  return (
    <div className={focus ? 'flex h-[calc(100dvh-0.75rem)] flex-col gap-2 p-2 lg:px-4' : 'space-y-3'}>
      {brandHeader}
      {subBanner}
      {/* Persistent capability nav — switch between Allocation / Split / Manual / Journey
          / Day Planner at any time, on the same loaded dataset. */}
      {capabilityNav()}
      {/* Workflow guide — frames the planner as a guided product (Map → … → Export),
          not an ERP screen. Focus mode only, compact. */}
      {focus && (() => {
        const steps = [
          { key: 'map', done: true },
          { key: 'routes', done: generated },
          { key: 'customers', done: history.length > 0 },
          { key: 'review', done: focusedRoutes.size > 0 || approved },
          { key: 'approve', done: approved },
          { key: 'export', done: exported },
        ];
        const current = steps.findIndex((s) => !s.done);
        return (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5 text-[11px]">
            {steps.map((s, i) => {
              const state = s.done ? 'done' : i === current ? 'current' : 'todo';
              return (
                <span key={s.key} className="inline-flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${state === 'current' ? 'border-primary bg-primary text-primary-foreground' : state === 'done' ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-muted bg-muted/40 text-muted-foreground'}`}>
                    {state === 'done' ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
                    {t(`routePlanner.wf_${s.key}` as Parameters<typeof t>[0])}
                  </span>
                  {i < steps.length - 1 && <span className="text-muted-foreground/40">›</span>}
                </span>
              );
            })}
          </div>
        );
      })()}
      {/* Toolbar */}
      <Card className={focus ? 'shrink-0 shadow-sm' : ''}>
        <CardContent className={`flex flex-wrap items-end gap-x-4 ${focus ? 'gap-y-2 p-2' : 'gap-y-3 p-3'}`}>
          {method === 'assisted' ? (
            <div>
              <label className="block text-[11px] text-muted-foreground">{t('routePlanner.routeCount')}</label>
              <div className="flex items-center gap-2">
                <Input type="number" min={1} value={routeCount} onChange={(e) => setRouteCount(e.target.value)} className="h-9 w-24" dir="ltr" />
                <Button size="sm" onClick={generate} disabled={!subCaps.canRunSplit} title={!subCaps.canRunSplit ? t('routePlanner.subLockedAction') : undefined}><Wand2 className="h-4 w-4" /> {generated ? t('routePlanner.regenerate') : t('routePlanner.generate')}</Button>
              </div>
            </div>
          ) : method === 'current' ? (
            <div className="inline-flex items-center gap-1.5 text-sm font-medium"><LayoutGrid className="h-4 w-4 text-primary" /> {t('routePlanner.methodCurrent')}</div>
          ) : (
            <div className="inline-flex items-center gap-1.5 text-sm font-medium"><PenTool className="h-4 w-4 text-primary" /> {t('routePlanner.methodManual')}</div>
          )}
          {/* Current Allocation Review: flip the whole view between Current and Proposed. */}
          {method === 'current' && (
            <div className="inline-flex self-center overflow-hidden rounded-md border">
              <button onClick={() => setAllocView('current')} className={`px-2.5 py-1.5 text-xs ${allocView === 'current' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{t('routePlanner.viewCurrent')}</button>
              <button onClick={() => setAllocView('proposed')} className={`border-s px-2.5 py-1.5 text-xs ${allocView === 'proposed' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}>{t('routePlanner.viewProposed')}</button>
            </div>
          )}
          <button onClick={() => setMethod(null)} className="self-center rounded border px-2 py-1 text-[11px] hover:bg-muted">{t('routePlanner.changeMethod')}</button>
          <div className="flex-1" />
          <Button size="sm" variant="ghost" disabled={history.length === 0} onClick={undo}><RotateCcw className="h-4 w-4" /> {t('routePlanner.undo')}</Button>
          {!approved ? (
            <Button size="sm" variant="default" disabled={reviews.length === 0 || !subCaps.canApprove} title={!subCaps.canApprove ? t('routePlanner.subLockedAction') : undefined} onClick={() => setApproved(true)}><Check className="h-4 w-4" /> {t('routePlanner.approve')}</Button>
          ) : (
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600"><Check className="h-4 w-4" /> {t('routePlanner.approved')}</span>
          )}
          <Button size="sm" variant="outline" disabled={!approved || !subCaps.canExport} title={!subCaps.canExport ? t('routePlanner.subLockedAction') : undefined} onClick={exportRoutes}><FileDown className="h-4 w-4" /> {t('routePlanner.exportRoutes')}</Button>
          <Button size="sm" variant="outline" disabled={reviews.length === 0} onClick={() => setJourneyMode(true)}><CalendarDays className="h-4 w-4" /> {t('routePlanner.jpOpenJourney')}</Button>
          <Button size="sm" variant="ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> {t('routePlanner.newUpload')}</Button>
        </CardContent>
      </Card>

      {msg && <p className={`shrink-0 rounded-md border px-3 py-1.5 text-sm ${msg.tone === 'err' ? 'border-red-300 bg-red-50 text-red-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700'}`}>{msg.text}</p>}
      {/* Verbose how-to hints are hidden in the chrome-free focus/demo mode to keep the map dominant. */}
      {!focus && method === 'assisted' && !generated && <p className="rounded-md border bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.generateHint')}</p>}
      {!focus && method === 'manual' && <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.manualHint')}</p>}
      {!focus && method === 'current' && !viewingCurrent && <p className="rounded-md border border-blue-300 bg-blue-50 px-3 py-2 text-sm text-blue-900">{t('routePlanner.currentHint')}</p>}
      {viewingCurrent && <p className="shrink-0 rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">{t('routePlanner.viewingCurrentReadonly')}</p>}
      {!focus && generated && method === 'assisted' && reviewStats && reviewStats.initial > 0 && (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {t('routePlanner.reviewSummary').replace('{flagged}', String(reviewStats.initial)).replace('{absorbed}', String(reviewStats.absorbed)).replace('{final}', String(reviewStats.final))}
        </p>
      )}

      {/* Current → Proposed diff (Current Allocation Review) — collapsible in focus mode so it never steals map space. */}
      {method === 'current' && diff && (diff.moved > 0 || diff.newRoutes > 0 || diff.removedRoutes > 0) && (
        <Card className={focus ? 'shrink-0' : ''}>
          <CardContent className="space-y-2 p-3">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span><span className="text-muted-foreground">{t('routePlanner.diffMoved')}: </span><b className="tabular-nums">{diff.moved}</b></span>
              <span><span className="text-muted-foreground">{t('routePlanner.diffUnchanged')}: </span><b className="tabular-nums">{diff.unchanged}</b></span>
              <span><span className="text-muted-foreground">{t('routePlanner.diffNewRoutes')}: </span><b className="tabular-nums">{diff.newRoutes}</b></span>
              <span><span className="text-muted-foreground">{t('routePlanner.diffRemovedRoutes')}: </span><b className="tabular-nums">{diff.removedRoutes}</b></span>
            </div>
            {diff.perRoute.length > 0 && (
              <details className="group" open={!focus}>
                <summary className="cursor-pointer list-none text-xs font-medium text-muted-foreground hover:text-foreground">
                  <span className="group-open:hidden">▸ </span><span className="hidden group-open:inline">▾ </span>{t('routePlanner.diffPerRoute').replace('{n}', String(diff.perRoute.length))}
                </summary>
                <div className="mt-1 max-h-40 overflow-y-auto">
                <table className="w-full text-xs tabular-nums">
                  <thead className="text-muted-foreground"><tr className="text-start">
                    <th className="py-1 text-start font-normal">{t('routePlanner.diffRoute')}</th>
                    <th className="text-end font-normal">{t('routePlanner.diffBefore')}</th>
                    <th className="text-end font-normal">{t('routePlanner.diffAfter')}</th>
                    <th className="text-end font-normal">{t('routePlanner.diffDelta')}</th>
                    {hasSales && <><th className="text-end font-normal">{t('routePlanner.diffSalesBefore')}</th><th className="text-end font-normal">{t('routePlanner.diffSalesAfter')}</th><th className="text-end font-normal">{t('routePlanner.diffSalesDelta')}</th></>}
                  </tr></thead>
                  <tbody>
                    {diff.perRoute.slice(0, 50).map((r) => {
                      const sd = r.afterS - r.beforeS;
                      return (
                        <tr key={r.route} className="border-t">
                          <td className="py-0.5 truncate">{routeLabelOf(r.route)}</td>
                          <td className="text-end">{r.before}</td>
                          <td className="text-end">{r.after}</td>
                          <td className={`text-end font-semibold ${r.diff > 0 ? 'text-emerald-600' : r.diff < 0 ? 'text-red-600' : ''}`}>{r.diff > 0 ? '+' : ''}{r.diff}</td>
                          {hasSales && <><td className="text-end text-muted-foreground">{fmt(r.beforeS)}</td><td className="text-end text-muted-foreground">{fmt(r.afterS)}</td><td className={`text-end font-semibold ${sd > 0 ? 'text-emerald-600' : sd < 0 ? 'text-red-600' : ''}`}>{sd > 0 ? '+' : ''}{fmt(sd)}</td></>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </div>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      <div className={focus ? 'grid min-h-0 flex-1 gap-2 lg:grid-cols-[1fr_270px]' : 'grid gap-3 lg:grid-cols-[1fr_320px]'}>
        {/* Map + selection controls. In focus mode the controls FLOAT over the map so the
            map itself fills the whole column (map-as-hero). */}
        <div className={focus ? 'relative min-h-0 flex-1' : 'space-y-2'}>
          <div className={focus ? 'pointer-events-none absolute end-2 top-2 z-[5] flex w-[min(18rem,calc(100%-1rem))] flex-col items-stretch gap-1.5' : 'space-y-2'}>
          {/* Selection mode + boundaries + focus */}
          <div className={`pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border text-sm ${focus ? 'border-white/50 bg-background/75 px-2 py-1.5 shadow-md backdrop-blur-md dark:border-white/10' : 'rounded-md bg-muted/30 px-3 py-2'}`}>
            {!focus && <span className="text-muted-foreground">{t('routePlanner.selectMode')}</span>}
            <div className={`inline-flex overflow-hidden rounded-md border ${focus ? '' : ''}`}>
              <button onClick={() => setSelectMode('pan')} title={t('routePlanner.panMode')} className={`inline-flex items-center gap-1 px-2 py-1 text-xs ${selectMode === 'pan' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><Hand className="h-3.5 w-3.5" /> {t('routePlanner.panMode')}</button>
              <button onClick={() => setSelectMode('box')} title={t('routePlanner.boxSelect')} className={`inline-flex items-center gap-1 border-s px-2 py-1 text-xs ${selectMode === 'box' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><Square className="h-3.5 w-3.5" /> {focus ? '' : t('routePlanner.boxSelect')}</button>
              <button onClick={() => setSelectMode('draw')} title={t('routePlanner.drawSelect')} className={`inline-flex items-center gap-1 border-s px-2 py-1 text-xs ${selectMode === 'draw' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}><PenTool className="h-3.5 w-3.5" /> {focus ? '' : t('routePlanner.drawSelect')}</button>
            </div>
            {!focus && <span className="text-xs text-muted-foreground">{selectMode === 'pan' ? t('routePlanner.panHint') : selectMode === 'box' ? t('routePlanner.boxHint') : t('routePlanner.drawHint')}</span>}
            <label className="ms-auto inline-flex cursor-pointer items-center gap-1 text-xs"><input type="checkbox" checked={showAllBoundaries} onChange={(e) => setShowAllBoundaries(e.target.checked)} /> <Layers className="h-3.5 w-3.5" /> {t('routePlanner.boundaries')}</label>
            {focusedRoutes.size > 0 && <Button size="sm" variant="ghost" onClick={clearFocus}><X className="h-4 w-4" /> {t('routePlanner.clearFocus')}</Button>}
          </div>

          {/* Move bar with live count + per-route breakdown */}
          <div className={`pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border text-sm ${focus ? 'border-white/50 bg-background/75 px-2 py-1.5 shadow-md backdrop-blur-md dark:border-white/10' : 'rounded-md bg-muted/30 px-3 py-2'}`}>
            {selectingInfo != null ? (
              <span className="font-medium text-primary">
                {t('routePlanner.selectingN').replace('{n}', String(selectingInfo.count))}
                {hasSales && <span> · {t('routePlanner.salesLabel')} {fmt(selectingInfo.sales)}</span>}
              </span>
            ) : (
              <span className="font-medium">
                {t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}
                {hasSales && movePreview && <span className="text-muted-foreground"> · {t('routePlanner.salesLabel')} {fmt(movePreview.totalSales)}</span>}
              </span>
            )}
            {!focus && selectingInfo == null && movePreview && movePreview.breakdown.length > 0 && (
              <span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                {t('routePlanner.fromLabel')}
                {movePreview.breakdown.slice(0, 6).map((b) => (
                  <span key={b.label} className="rounded bg-background px-1.5 py-0.5 tabular-nums">{b.label}: {b.n}{hasSales ? ` | ${fmt(b.sales)}` : ''}</span>
                ))}
                {movePreview.breakdown.length > 6 && <span>…</span>}
              </span>
            )}
            <span className="text-muted-foreground">{t('routePlanner.moveTo')}</span>
            <select className="h-9 rounded-md border bg-background px-2 text-sm" value={effectiveTarget} onChange={(e) => setTargetRoute(e.target.value)}>
              {routeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <Button size="sm" disabled={selectedIds.size === 0 || viewingCurrent} onClick={moveSelected}><MapPin className="h-4 w-4" /> {t('routePlanner.apply')}{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}</Button>
            {selectedIds.size > 0 && <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}><X className="h-4 w-4" /> {t('routePlanner.clear')}</Button>}
          </div>

          {/* Move impact preview */}
          {!viewingCurrent && selectingInfo == null && movePreview && (
            <p className="pointer-events-auto rounded-md border border-emerald-200 bg-emerald-50/90 px-3 py-1.5 text-xs text-emerald-800 backdrop-blur">
              {t('routePlanner.movePreview').replace('{n}', String(movePreview.count)).replace('{target}', targetLabel)}
              {hasSales && ` · ${t('routePlanner.salesImpact')} +${fmt(movePreview.totalSales)}`}
            </p>
          )}
          </div>

          <div className={focus ? 'h-full' : ''}>
            <SelectionMap points={points} hulls={hulls} selectedIds={selectedIds} focusIds={focusIds} routeOptions={routeOptions} selectMode={selectMode} fill={focus} onToggle={toggle} onBoxSelect={boxSelect} onMoveSingle={moveSingle} onContextMenu={(x, y) => setCtxMenu({ x, y })} onSelecting={setSelectingInfo} onSelectComplete={() => setSelectMode('pan')} />
          </div>
        </div>

        {/* Route side panel */}
        <Card className={focus ? 'flex min-h-0 flex-col self-stretch' : 'self-start'}>
          <CardContent className={focus ? 'flex min-h-0 flex-1 flex-col gap-2 p-3' : 'space-y-2 p-3'}>
            {/* Summary for selected route(s) / all — collapsed by default in focus mode so
                the route list dominates the panel. */}
            <details className="rounded-md border bg-muted/40 p-2" open={!focus}>
              <summary className="cursor-pointer list-none text-xs font-semibold hover:text-primary">
                {focusedRoutes.size ? t('routePlanner.summaryFocused').replace('{n}', String(focusedRoutes.size)) : t('routePlanner.summaryAll')}
              </summary>
              <div className="mt-1 grid grid-cols-3 gap-x-2 gap-y-1.5 text-xs">
                {([
                  [t('routePlanner.colCustomers'), String(summary.customers)],
                  [t('routePlanner.colVisits'), String(summary.weeklyVisits)],
                  [t('routePlanner.colWorkload'), `${summary.workloadHours}h`],
                  [t('routePlanner.colRadius'), `${summary.maxRadiusKm}km`],
                  [t('routePlanner.colMeanDist'), `${summary.avgMeanRadiusKm}km`],
                  [t('routePlanner.colSpan'), `${summary.maxSpanKm}km`],
                  [t('routePlanner.colCompactness'), String(summary.compactness)],
                  [t('routePlanner.colSelected'), String(selectedIds.size)],
                  ...(hasSales ? [
                    [t('routePlanner.colTotalSales'), fmt(summary.totalSales)],
                    [t('routePlanner.colAvgSales'), fmt(summary.avgSalesPerCustomer)],
                    [t('routePlanner.colSalesPct'), datasetSales > 0 ? `${Math.round((summary.totalSales / datasetSales) * 100)}%` : '—'],
                  ] as [string, string][] : []),
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label}><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-semibold tabular-nums" dir="ltr">{value}</p></div>
                ))}
              </div>
            </details>

            <div className="flex items-center justify-between gap-1">
              <p className="text-sm font-semibold">{t('routePlanner.routesTitle')} <span className="text-xs font-normal text-muted-foreground">({reviews.length})</span></p>
              <div className="flex flex-wrap justify-end gap-1">
                {focus && <button onClick={() => setCompactList((v) => !v)} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted ${compactList ? 'border-primary bg-primary/10 text-primary' : ''}`} title={t('routePlanner.compactList')}>{compactList ? '≣' : '☰'}</button>}
                <button onClick={focusAll} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted">{t('routePlanner.focusAll')}</button>
                <button onClick={clearFocus} className="rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted">{t('routePlanner.clearFocus')}</button>
                <button disabled={focusedRoutes.size === 0} onClick={() => setShowOnlySelected((v) => !v)} className={`rounded border px-1.5 py-0.5 text-[11px] hover:bg-muted disabled:opacity-40 ${showOnlySelected ? 'border-primary bg-primary/10 text-primary' : ''}`}>{showOnlySelected ? t('routePlanner.showAll') : t('routePlanner.showOnly')}</button>
              </div>
            </div>
            {/* Sort routes by count / workload / sales / sales-per-customer */}
            <div className="flex items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">{t('routePlanner.sortBy')}</span>
              <select className="h-7 rounded border bg-background px-1 text-[11px]" value={effectiveSortKey} onChange={(e) => setSortKey(e.target.value as typeof sortKey)}>
                <option value="route">{t('routePlanner.sort_route')}</option>
                <option value="customers">{t('routePlanner.sort_customers')}</option>
                <option value="workload">{t('routePlanner.sort_workload')}</option>
                {hasSales && <option value="sales">{t('routePlanner.sort_sales')}</option>}
                {hasSales && <option value="salesPerCustomer">{t('routePlanner.sort_salesPerCustomer')}</option>}
              </select>
              <button onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))} className="rounded border px-1.5 py-0.5 hover:bg-muted" title={sortDir === 'desc' ? t('routePlanner.sortDesc') : t('routePlanner.sortAsc')}>{sortDir === 'desc' ? '↓' : '↑'}</button>
            </div>
            {!focus && (
              <div className="grid grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 text-[11px] text-muted-foreground">
                <span /><span /><span /><span className="text-end">{t('routePlanner.colCustomers')}</span><span className="text-end">{hasSales ? t('routePlanner.colTotalSales') : t('routePlanner.colVisits')}</span><span className="text-end">{t('routePlanner.colWorkload')}</span>
              </div>
            )}
            <div className={`overflow-y-auto pe-1 ${focus ? 'min-h-0 flex-1 space-y-1.5' : 'max-h-[44vh] space-y-1'}`}>
              {reviews.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">—</p>}
              {sortedReviews.map((s) => {
                const on = focusedRoutes.has(s.routeId);
                const tier = salesTier.get(s.routeId);
                const pct = hasSales && datasetSales > 0 ? Math.round((s.sales / datasetSales) * 100) : 0;
                if (focus && compactList) {
                  // ── Dense single-line row (Compact List mode): max routes on screen ──
                  return (
                    <button
                      key={s.routeId}
                      onClick={() => toggleFocus(s.routeId)}
                      title={t('routePlanner.focusHint')}
                      className={`flex w-full items-center gap-1.5 rounded border border-s-[3px] py-1 pe-1.5 ps-1.5 text-start text-xs transition hover:bg-muted/60 ${on ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}
                      style={{ borderInlineStartColor: s.color }}
                    >
                      <span className={`flex h-3 w-3 shrink-0 items-center justify-center rounded-sm border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>{on && <Check className="h-2 w-2" />}</span>
                      <span className="min-w-0 flex-1 truncate font-medium">{routeLabelOf(s.routeId)}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground" dir="ltr">{s.customers}{hasSales ? ` · ${fmtShort(s.sales)}` : `· ${s.workloadHours}h`}</span>
                      {tier === 'top' && <span className="shrink-0 rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">▲</span>}
                      {tier === 'bottom' && <span className="shrink-0 rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700">▼</span>}
                    </button>
                  );
                }
                if (focus) {
                  // ── Compact route card (presentation mode): 2 lines, ~50% shorter ──
                  // Line 1: "Route 31"  ·  Line 2: "207 Cust | 1.14M SAR"
                  return (
                    <button
                      key={s.routeId}
                      onClick={() => toggleFocus(s.routeId)}
                      title={t('routePlanner.focusHint')}
                      className={`flex w-full items-center gap-2 rounded-lg border border-s-[3px] py-1.5 pe-2 ps-2 text-start transition hover:bg-muted/60 ${on ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:border-primary/40'}`}
                      style={{ borderInlineStartColor: s.color }}
                    >
                      <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 truncate text-sm font-semibold leading-tight">
                          <span className="truncate">{routeLabelOf(s.routeId)}</span>
                          {tier === 'top' && <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">{t('routePlanner.tierTop')}</span>}
                          {tier === 'bottom' && <span className="rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700">{t('routePlanner.tierBottom')}</span>}
                        </span>
                        <span className="block truncate text-xs leading-tight text-muted-foreground tabular-nums" dir="ltr">
                          {s.customers} {t('routePlanner.colCustomers')}
                          {hasSales ? ` | ${fmtShort(s.sales)} SAR · ${pct}%` : ` | ${s.weeklyVisits} ${t('routePlanner.colVisits')} · ${s.workloadHours}h`}
                        </span>
                      </span>
                    </button>
                  );
                }
                return (
                  <button
                    key={s.routeId}
                    onClick={() => toggleFocus(s.routeId)}
                    title={t('routePlanner.focusHint')}
                    className={`grid w-full grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border border-s-2 px-2 py-1.5 text-start text-xs hover:bg-muted ${on ? 'border-primary bg-primary/5' : tier === 'top' ? 'border-s-emerald-500' : tier === 'bottom' ? 'border-s-red-400' : ''}`}
                  >
                    <span className={`flex h-3.5 w-3.5 items-center justify-center rounded-sm border ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>{on && <Check className="h-2.5 w-2.5" />}</span>
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="flex items-center gap-1 truncate font-medium">{routeLabelOf(s.routeId)}{tier === 'top' && <span className="rounded bg-emerald-100 px-1 text-[9px] font-semibold text-emerald-700">{t('routePlanner.tierTop')}</span>}{tier === 'bottom' && <span className="rounded bg-red-100 px-1 text-[9px] font-semibold text-red-700">{t('routePlanner.tierBottom')}</span>}</span>
                    <span className="text-end tabular-nums" dir="ltr">{s.customers}</span>
                    <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{hasSales ? fmt(s.sales) : s.weeklyVisits}</span>
                    <span className="text-end tabular-nums text-muted-foreground" dir="ltr">{s.workloadHours}h</span>
                  </button>
                );
              })}
              {unassigned > 0 && (
                <button
                  onClick={selectNeedsReview}
                  title={t('routePlanner.selectReview')}
                  className="grid w-full grid-cols-[auto_auto_1fr_auto_auto_auto] items-center gap-x-2 rounded border border-dashed border-amber-400 bg-amber-50 px-2 py-1.5 text-start text-xs hover:bg-amber-100"
                >
                  <span />
                  <span className="inline-block h-3 w-3 rounded-full border-2 border-amber-800 bg-amber-500" />
                  <span className="truncate font-medium text-amber-900">{t('routePlanner.needsReview')}</span>
                  <span className="text-end tabular-nums text-amber-900" dir="ltr">{unassigned}</span>
                  <span /><span />
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right-click context menu — a shortcut for the toolbar Move (acts on the selection). */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="fixed z-50 w-56 rounded-md border bg-popover p-1 text-sm shadow-md" style={{ left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 240), top: ctxMenu.y }}>
            <p className="px-2 py-1 text-xs text-muted-foreground">{t('routePlanner.selectedN').replace('{n}', String(selectedIds.size))}</p>
            {selectedIds.size === 0 ? (
              <p className="px-2 py-1 text-xs text-muted-foreground">{t('routePlanner.ctxNoSel')}</p>
            ) : (
              <>
                <p className="px-2 pt-1 text-[11px] font-medium text-muted-foreground">{t('routePlanner.moveTo')}</p>
                <div className="max-h-52 overflow-y-auto">
                  {routeOptions.map((o) => (
                    <button key={o.value} onClick={() => moveSelectedTo(o.value)} className="block w-full rounded px-2 py-1 text-start hover:bg-muted">{o.label}</button>
                  ))}
                </div>
              </>
            )}
            <div className="my-1 border-t" />
            <button onClick={() => { setSelectedIds(new Set()); setCtxMenu(null); }} className="block w-full rounded px-2 py-1 text-start hover:bg-muted">{t('routePlanner.clearSelection')}</button>
          </div>
        </>
      )}

      {/* Journey Planning + Day Planner overlays (shared across all screen returns). */}
      {overlays}
    </div>
  );
}
