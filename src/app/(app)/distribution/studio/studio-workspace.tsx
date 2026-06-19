'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Scale, Map as MapIcon, Wand2, LayoutGrid, Users, Copy, Download, ArrowUpRight, Upload, FileDown, Info, RotateCcw, Check } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/shared/stat-card';
import { buildTisDataset, isValidGeo, type TisCustomer, type TisDataset, type TisSource } from '@/lib/tis/dataset';
import { applyScenario, scenarioMetrics, type Scenario } from '@/lib/tis/scenario';
import { currentPlanScenario, cloneScenario, setAssignment } from '@/lib/tis/plan-edit';
import { balanceRoutes, validateConstraints, type RouteConstraints } from '@/lib/tis/optimize-routes';
import { datasetToCsv, TIS_CSV_COLUMNS } from '@/lib/tis/export';
import { buildTisDatasetFromRows, type TisUploadRow } from '@/lib/tis/upload';
import { auditTerritory } from '@/lib/tis/audit';
import { initialScope, scopeCustomerIds, type ScopeState } from '@/lib/tis/scope';
import { TerritoryAuditView } from '../territory-audit/territory-audit';
import { PlanningMap, type PlanMapPoint } from '../planning-board/planning-map';
import { PlanningCanvas, MetricsBar, routeColorMap, COVER_HEX, PALETTE } from '../planning-board/planning-canvas';
import { ScopeBar } from '../planning-board/scope-bar';
import { parseTisUpload } from './import-actions';

type Stage = 'import' | 'overview' | 'audit' | 'map' | 'optimize' | 'plan' | 'export' | 'size';
interface ImportPreview { rows: TisUploadRow[]; total: number; mapped: number; columns: string[] }
type ColorMode = 'route' | 'salesman' | 'coverage' | 'territory' | 'grade';
type BalanceBy = 'workload' | 'value' | 'count';
interface OptConfig { routeCount: string; workingDays: string; balanceBy: BalanceBy; maxPerRoute: string; maxVisitsPerDay: string; advanced: boolean }
const GRADE_HEX: Record<string, string> = { a: '#16a34a', b: '#2563eb', c: '#d97706', d: '#dc2626' };
const NEUTRAL = '#94a3b8';
/** Sorted-id → palette colour map (categorical layers: salesman / region). */
function catColors(ids: (string | null | undefined)[]): Map<string, string> {
  const u = [...new Set(ids.filter((x): x is string => !!x))].sort();
  return new Map(u.map((id, i) => [id, PALETTE[i % PALETTE.length]]));
}
/** Each stage's standalone deep-link (discoverability + back-compat). */
const STANDALONE: Partial<Record<Stage, string>> = {
  audit: '/distribution/territory-audit',
  map: '/distribution/geo',
  optimize: '/distribution/route-optimizer',
  plan: '/distribution/planning-board',
};

/**
 * Territory Intelligence Studio (STUDIO-1) — one map-centric workspace with sub-nav
 * Overview → Audit → Map → Optimize → Plan → Size, over ONE shared dataset +
 * scenario state. Composition only: every stage reuses an existing engine/surface
 * (auditTerritory · buildGeoLayers · balanceRoutes · scenario engine · PlanningCanvas).
 * Read-only + export; no Apply. Pure client-side over the shared dataset.
 */
export function StudioWorkspace({ customers, asOf, source, demo, labels = {} }: { customers: TisCustomer[]; asOf: string; source: TisSource; demo: boolean; labels?: Record<string, string> }) {
  const { t } = useI18n();
  // Imported customers (from an uploaded CSV/XLSX/JSON) replace the server-loaded
  // set for the rest of the session — Import → Audit → Optimize → Plan → Export.
  const [imported, setImported] = useState<TisCustomer[] | null>(null);
  const effective = imported ?? customers;
  const dataset = useMemo(() => buildTisDataset(effective, { asOf, source: imported ? 'upload' : source }), [effective, imported, asOf, source]);
  const defaultRouteCount = useMemo(() => Math.max(1, new Set(effective.map((c) => c.ownership.routeId).filter(Boolean)).size || 6), [effective]);
  const sample = demo && !imported; // viewing the bundled demo, not the manager's data

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [currentPlanScenario(dataset)]);
  const [activeId, setActiveId] = useState('current');
  const [stage, setStage] = useState<Stage>('overview');
  const [colorMode, setColorMode] = useState<ColorMode>('coverage');
  // Optimize config — Simple: routeCount · workingDays · balanceBy. Advanced: caps.
  const [opt, setOpt] = useState<OptConfig>({ routeCount: '', workingDays: '5', balanceBy: 'workload', maxPerRoute: '', maxVisitsPerDay: '', advanced: false });
  const [scope, setScope] = useState<ScopeState>(() => initialScope(dataset.customers));
  const [importMsg, setImportMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const update = (next: Scenario) => setScenarios((list) => list.map((s) => (s.id === next.id ? next : s)));

  // ── Shared scope: ONE working set drives every stage + the persistent map ──
  const applied = useMemo(() => applyScenario(dataset, active), [dataset, active]);
  const scopeIds = useMemo(() => scopeCustomerIds(applied.customers, scope), [applied, scope]);
  const working = useMemo(() => applied.customers.filter((c) => scopeIds.has(c.id)), [applied, scopeIds]);
  const scopedDataset: TisDataset = useMemo(() => ({ ...dataset, customers: working }), [dataset, working]);
  const scopedRouteCount = useMemo(() => new Set(working.map((c) => c.ownership.routeId).filter(Boolean)).size, [working]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setImporting(true); setImportMsg(null); setPreview(null);
    setStage('import');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await parseTisUpload(fd);
      if (!res.ok) { setImportMsg({ tone: 'err', text: t(`studio.${res.error}`) }); return; }
      // Preview first — do NOT replace the dataset until the manager confirms.
      setPreview({ rows: res.rows, total: res.total, mapped: res.mapped, columns: res.columns });
    } catch {
      setImportMsg({ tone: 'err', text: t('studio.err_parse') });
    } finally {
      setImporting(false);
    }
  }
  function confirmImport() {
    if (!preview) return;
    const ds = buildTisDatasetFromRows(preview.rows, { source: 'upload' });
    setImported(ds.customers);
    setScenarios([currentPlanScenario(ds)]);
    setActiveId('current');
    setScope(initialScope(ds.customers));
    setImportMsg({ tone: 'ok', text: t('studio.importOk').replace('{n}', String(ds.customers.length)).replace('{total}', String(preview.total)) });
    setPreview(null);
    setStage('audit');
  }
  function cancelImport() { setPreview(null); setImportMsg(null); }
  function resetToLive() {
    setImported(null);
    setScenarios([currentPlanScenario(buildTisDataset(customers, { asOf, source }))]);
    setActiveId('current');
    setScope(initialScope(customers));
    setPreview(null);
    setImportMsg({ tone: 'ok', text: t('studio.resetDone') });
  }
  function onTemplate() {
    const example = [
      'C001,C001,Sample Market,21.5810,39.1650,sm-1,,,R-1,R-1,a,weekly,12000,on_track,82',
      'C002,C002,Sample Grocery,21.5430,39.1720,sm-1,,,R-1,R-1,c,monthly,3000,under_covered,55',
    ];
    const csv = [TIS_CSV_COLUMNS.join(','), ...example].join('\n');
    downloadCsv(csv, 'tis-import-template.csv');
  }

  // All findings/metrics are computed over the SCOPED working set.
  const audit = useMemo(() => auditTerritory(scopedDataset), [scopedDataset]);
  const metrics = useMemo(() => scenarioMetrics(scopedDataset), [scopedDataset]);

  // ── Map colouring (Color By: Route · Salesman · Coverage · Territory · Grade) ──
  const routeColor = useMemo(() => routeColorMap(dataset, active), [dataset, active]);
  const routeIndex = useMemo(() => {
    const ids = [...new Set(applied.customers.map((c) => c.ownership.routeId).filter((r): r is string => !!r))].sort();
    return new Map(ids.map((id, i) => [id, i]));
  }, [applied]);
  const routeLabel = (id: string | null | undefined) => (id ? labels[id] ?? `${t('routeOpt.route')} ${(routeIndex.get(id) ?? 0) + 1}` : '');
  const nameLabel = (id: string | null | undefined) => (id ? labels[id] ?? id : '');
  const salesmanColors = useMemo(() => catColors(working.map((c) => c.ownership.salesmanId)), [working]);
  const regionColors = useMemo(() => catColors(working.map((c) => c.ownership.regionId)), [working]);
  const availableModes = useMemo<ColorMode[]>(() => ([
    working.some((c) => c.ownership.routeId) ? 'route' : null,
    working.some((c) => c.ownership.salesmanId) ? 'salesman' : null,
    working.some((c) => c.coverage) ? 'coverage' : null,
    working.some((c) => c.ownership.regionId) ? 'territory' : null,
    working.some((c) => c.grade) ? 'grade' : null,
  ].filter((m): m is ColorMode => m != null)), [working]);
  const mode: ColorMode = availableModes.includes(colorMode) ? colorMode : (availableModes[0] ?? 'coverage');
  const colorOf = (c: TisCustomer): string => {
    switch (mode) {
      case 'route': return c.ownership.routeId ? routeColor.get(c.ownership.routeId) ?? NEUTRAL : '#cbd5e1';
      case 'salesman': return c.ownership.salesmanId ? salesmanColors.get(c.ownership.salesmanId) ?? NEUTRAL : '#cbd5e1';
      case 'coverage': return c.coverage ? COVER_HEX[c.coverage] ?? NEUTRAL : '#cbd5e1';
      case 'territory': return c.ownership.regionId ? regionColors.get(c.ownership.regionId) ?? NEUTRAL : '#cbd5e1';
      case 'grade': return c.grade ? GRADE_HEX[c.grade] ?? NEUTRAL : '#cbd5e1';
    }
  };
  const legend = useMemo<{ label: string; color: string }[]>(() => {
    const seen = new Map<string, string>();
    for (const c of working) {
      let key = '', label = '', col = '';
      if (mode === 'route') { key = c.ownership.routeId ?? ''; label = routeLabel(c.ownership.routeId) || t('planBoard.unassigned'); col = colorOf(c); }
      else if (mode === 'salesman') { key = c.ownership.salesmanId ?? ''; label = nameLabel(c.ownership.salesmanId) || t('planBoard.unassignedSalesman'); col = colorOf(c); }
      else if (mode === 'coverage') { key = c.coverage ?? ''; label = (c.coverage ?? '—').replace(/_/g, ' '); col = colorOf(c); }
      else if (mode === 'territory') { key = c.ownership.regionId ?? ''; label = nameLabel(c.ownership.regionId) || t('planBoard.unassigned'); col = colorOf(c); }
      else { key = c.grade ?? ''; label = (c.grade ?? '—').toUpperCase(); col = colorOf(c); }
      if (!seen.has(key)) seen.set(key, JSON.stringify({ label, color: col }));
    }
    return [...seen.values()].map((v) => JSON.parse(v) as { label: string; color: string }).slice(0, 16);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [working, mode, labels, routeColor, salesmanColors, regionColors]);

  function onOptimize() {
    const rc = Math.max(0, Math.round(Number(opt.routeCount))) || scopedRouteCount || defaultRouteCount;
    // Optimize only the in-scope customers; overlay onto the active plan so
    // out-of-scope routes are untouched.
    const constraints: RouteConstraints = {
      routeCount: rc,
      workingDays: Number(opt.workingDays) || 5,
      balanceBy: opt.balanceBy,
      ...(Number(opt.maxPerRoute) > 0 ? { maxPerRoute: Number(opt.maxPerRoute) } : {}),
      ...(Number(opt.maxVisitsPerDay) > 0 ? { maxVisitsPerDay: Number(opt.maxVisitsPerDay) } : {}),
    };
    const plan = balanceRoutes(working, constraints);
    const merged = plan.assignments.reduce((sc, a) => setAssignment(sc, a), { ...active, id: 'optimized', name: t('planBoard.optimized') });
    setScenarios((list) => [...list.filter((s) => s.id !== 'optimized'), merged]);
    setActiveId('optimized');
    setColorMode('route');
    setStage('plan');
  }
  function onClone() {
    const id = ['A', 'B', 'C'].find((l) => !scenarios.some((s) => s.id === l));
    if (!id) return;
    setScenarios((list) => [...list, cloneScenario(active, id, `${t('planBoard.scenario')} ${id}`)]);
    setActiveId(id);
  }
  function onExport() {
    downloadCsv(datasetToCsv(applyScenario(dataset, active)), `studio-plan-${active.id}.csv`);
  }

  // Persistent map = the SCOPED working set, coloured by the active mode, with full
  // customer meta for the click popup — so map and board always agree.
  const mapPoints = useMemo<PlanMapPoint[]>(() => working.filter((c) => isValidGeo(c.geo)).map((c) => ({
    id: c.id, name: c.name, lat: c.geo!.lat, lng: c.geo!.lng, color: colorOf(c),
    meta: { code: c.code, route: routeLabel(c.ownership.routeId), salesman: nameLabel(c.ownership.salesmanId), grade: c.grade, coverage: c.coverage },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  })), [working, mode, routeColor, salesmanColors, regionColors, labels]);

  const STAGES: { key: Stage; icon: typeof MapIcon; label: string }[] = [
    { key: 'import', icon: Upload, label: t('studio.import') },
    { key: 'overview', icon: LayoutDashboard, label: t('studio.overview') },
    { key: 'audit', icon: Scale, label: t('studio.audit') },
    { key: 'map', icon: MapIcon, label: t('studio.map') },
    { key: 'optimize', icon: Wand2, label: t('studio.optimize') },
    { key: 'plan', icon: LayoutGrid, label: t('studio.plan') },
    { key: 'export', icon: Download, label: t('studio.export') },
    { key: 'size', icon: Users, label: t('studio.size') },
  ];

  // Shared map block: Color By control + legend + the persistent (read-only) map.
  const colorControls = availableModes.length > 1 ? (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t('planBoard.colorBy')}:</span>
      {availableModes.map((m) => (
        <button key={m} onClick={() => setColorMode(m)} className={`rounded-md border px-2.5 py-1 text-xs ${mode === m ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>{t(`planBoard.color_${m}`)}</button>
      ))}
    </div>
  ) : null;
  const legendEl = legend.length > 0 ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border bg-muted/20 px-2 py-1.5 text-xs">
      <span className="text-muted-foreground">{t('planBoard.legend')}:</span>
      {legend.map((l) => (
        <span key={l.label + l.color} className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />{l.label}</span>
      ))}
    </div>
  ) : null;
  const mapEl = <PlanningMap key="studio-map" points={mapPoints} onSelect={() => { /* read-only popups in the Studio map */ }} />;

  return (
    <div className="space-y-3">
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.json,.txt" className="hidden" onChange={onFile} />

      {/* First-run / sample-data banner — explains the demo and points to Import. */}
      {sample && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-info/40 bg-info/10 px-3 py-2 text-sm">
          <Info className="h-4 w-4 shrink-0 text-info" />
          <span>{t('studio.sampleBanner')}</span>
          <Button size="sm" className="ms-auto" onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {t('studio.importData')}</Button>
        </div>
      )}

      {/* Shared toolbar: scenario tabs + actions. */}
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => setActiveId(s.id)} className={`rounded-md border px-3 py-1.5 text-sm ${s.id === activeId ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>{s.name}</button>
        ))}
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={importing}><Upload className="h-4 w-4" /> {t('studio.import')}</Button>
          <Button size="sm" variant="outline" onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('planBoard.optimize')}</Button>
          <Button size="sm" variant="outline" onClick={onClone}><Copy className="h-4 w-4" /> {t('planBoard.clone')}</Button>
          <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}</Button>
        </div>
      </div>

      {/* Shared scope bar — Region → Salesman → Route drives EVERY stage + the map. */}
      {stage !== 'import' && <ScopeBar customers={applied.customers} scope={scope} onChange={setScope} labels={labels} />}

      {stage !== 'import' && <MetricsBar m={metrics} />}

      <div className="flex flex-col gap-3 lg:flex-row">
        {/* Sub-nav (left on desktop, horizontal scroll on mobile). */}
        <nav className="flex gap-1 overflow-x-auto lg:w-44 lg:flex-col lg:overflow-visible">
          {STAGES.map(({ key, icon: Icon, label }) => (
            <button key={key} onClick={() => setStage(key)} className={`inline-flex shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm lg:w-full ${stage === key ? 'border-primary bg-secondary font-medium' : 'hover:bg-muted'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </nav>

        {/* Centre: the map is the anchor. Non-Plan stages keep a contextual panel
            beside the map (right on wide screens, below on narrow); the Plan stage
            gives the map full width and docks the route boards beneath it. */}
        <div className="min-w-0 flex-1 space-y-3">
          {stage === 'import' ? (
            <ImportPanel t={t} importing={importing} message={importMsg} sample={sample} imported={imported != null} count={dataset.customers.length} preview={preview} onPick={() => fileRef.current?.click()} onTemplate={onTemplate} onConfirm={confirmImport} onCancel={cancelImport} onReset={resetToLive} />
          ) : stage === 'export' ? (
            <ExportPanel t={t} count={dataset.customers.length} scenarioName={active.name} onExport={onExport} />
          ) : stage === 'plan' ? (
            <>
              {colorControls}
              {mapEl}
              {legendEl}
              <PlanningCanvas dataset={dataset} scenario={active} onChange={update} labels={labels} scopeIds={scopeIds} />
              <StageLink href={STANDALONE.plan!} label={t('studio.openFull')} />
            </>
          ) : (
            <div className="flex flex-col gap-3 xl:flex-row">
              <div className="min-w-0 space-y-2 xl:flex-1">
                {colorControls}
                {mapEl}
                {legendEl}
              </div>

              {/* Contextual panel. */}
              <aside className="min-w-0 space-y-3 xl:w-[380px] xl:shrink-0">
                {stage === 'overview' && <OverviewPanel audit={audit} onOptimize={onOptimize} onImport={() => setStage('import')} onDrill={setStage} t={t} sample={sample} />}
                {stage === 'audit' && <TerritoryAuditView audit={audit} labels={labels} />}
                {stage === 'map' && <p className="text-sm text-muted-foreground">{t('studio.mapLead')}</p>}
                {stage === 'optimize' && <OptimizePanel dataset={scopedDataset} scenarios={scenarios} opt={opt} setOpt={setOpt} defaultRouteCount={scopedRouteCount || defaultRouteCount} onOptimize={onOptimize} t={t} />}
                {stage === 'size' && <NeedsPanel text={t('studio.sizeSoon')} />}
                {STANDALONE[stage] && <StageLink href={STANDALONE[stage]!} label={t('studio.openFull')} />}
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function downloadCsv(csv: string, filename: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function StageLink({ href, label }: { href: string; label: string }) {
  // Open standalone tools in a new tab so the in-session Studio (scenario/import/
  // scope) is never lost.
  return <Link href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"><ArrowUpRight className="h-3.5 w-3.5" /> {label}</Link>;
}

function OverviewPanel({ audit, onOptimize, onImport, onDrill, t, sample }: { audit: ReturnType<typeof auditTerritory>; onOptimize: () => void; onImport: () => void; onDrill: (s: Stage) => void; t: (k: string) => string; sample: boolean }) {
  const h = audit.headline;
  // Guided next-step: when on sample data, import first; else gaps → balance → Plan.
  const nextKey = sample ? 'studio.nextImport' : h.gapCount > 0 ? 'studio.nextAudit' : h.worstBalancePct < 70 ? 'studio.nextOptimize' : 'studio.nextPlan';
  return (
    <div className="space-y-3">
      {sample && <p className="text-xs text-muted-foreground">{t('studio.demoNote')}</p>}
      {/* Clickable KPIs drill into the relevant stage. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button onClick={() => onDrill('audit')} className="text-start"><StatCard label={t('coverage.headlineCoverage')} value={`${h.coveragePct}%`} icon={LayoutDashboard} tone="primary" hint={t('coverage.ofNCustomers').replace('{n}', String(h.customers))} /></button>
        <button onClick={() => onDrill('audit')} className="text-start"><StatCard label={t('territoryAudit.coverageGaps')} value={String(h.gapCount)} icon={Scale} tone="warning" /></button>
        <button onClick={() => onDrill('map')} className="text-start"><StatCard label={t('territoryAudit.whiteSpace')} value={String(h.whiteSpaceCount)} icon={MapIcon} tone="info" /></button>
        <button onClick={() => onDrill('optimize')} className="text-start"><StatCard label={t('territoryAudit.worstBalance')} value={`${h.worstBalancePct}%`} icon={Scale} tone={h.worstBalancePct >= 70 ? 'success' : 'destructive'} /></button>
      </div>
      <Card className="bg-muted/40"><CardContent className="space-y-2 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('studio.nextStep')}</p>
        <p className="text-sm">{t(nextKey)}</p>
        {sample
          ? <Button size="sm" onClick={onImport}><Upload className="h-4 w-4" /> {t('studio.importData')}</Button>
          : <Button size="sm" onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('studio.startOptimize')}</Button>}
      </CardContent></Card>
    </div>
  );
}

function ImportPanel({ t, importing, message, sample, imported, count, preview, onPick, onTemplate, onConfirm, onCancel, onReset }: {
  t: (k: string) => string; importing: boolean; message: { tone: 'ok' | 'err'; text: string } | null; sample: boolean; imported: boolean; count: number;
  preview: ImportPreview | null; onPick: () => void; onTemplate: () => void; onConfirm: () => void; onCancel: () => void; onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{t('studio.importTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('studio.importLead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onPick} disabled={importing}><Upload className="h-4 w-4" /> {importing ? t('studio.importing') : t('studio.chooseFile')}</Button>
          <Button variant="outline" onClick={onTemplate}><FileDown className="h-4 w-4" /> {t('studio.downloadTemplate')}</Button>
          {imported && <Button variant="outline" onClick={onReset}><RotateCcw className="h-4 w-4" /> {t('studio.resetLive')}</Button>}
        </div>
        {message && <p className={`text-sm ${message.tone === 'ok' ? 'text-success' : 'text-destructive'}`}>{message.text}</p>}

        {/* Preview + confirmation — nothing is replaced until the manager confirms. */}
        {preview && (
          <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-sm font-medium">{t('studio.previewTitle')}</p>
            <p className="text-sm">{t('studio.previewSummary').replace('{n}', String(preview.rows.length)).replace('{total}', String(preview.total)).replace('{mapped}', String(preview.mapped))}</p>
            <div className="flex flex-wrap gap-1">
              {preview.columns.map((c) => <span key={c} className="rounded-full border bg-background px-2 py-0.5 text-[11px]" dir="ltr">{c}</span>)}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b text-muted-foreground"><tr><th className="px-2 py-1 text-start font-medium">{t('studio.pv_name')}</th><th className="px-2 py-1 text-start font-medium">{t('studio.pv_grade')}</th><th className="px-2 py-1 text-start font-medium">{t('studio.pv_freq')}</th><th className="px-2 py-1 text-start font-medium">{t('studio.pv_geo')}</th></tr></thead>
                <tbody>
                  {preview.rows.slice(0, 5).map((r, i) => (
                    <tr key={i} className="border-b last:border-0"><td className="px-2 py-1">{r.name ?? r.code ?? r.id ?? '—'}</td><td className="px-2 py-1 uppercase">{r.grade ?? '—'}</td><td className="px-2 py-1">{r.frequency ?? '—'}</td><td className="px-2 py-1" dir="ltr">{r.lat != null && r.lng != null ? '✓' : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={onConfirm}><Check className="h-4 w-4" /> {t('studio.confirmImport')}</Button>
              <Button size="sm" variant="outline" onClick={onCancel}>{t('studio.cancel')}</Button>
            </div>
          </div>
        )}

        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{t('studio.importColumns')}</p>
          <p className="mt-1 break-words font-mono" dir="ltr">{TIS_CSV_COLUMNS.join(', ')}</p>
          <p className="mt-2">{t('studio.importHint')}</p>
        </div>
        <p className="text-xs text-muted-foreground">
          {sample ? t('studio.importSampleNote') : t('studio.importCurrentNote').replace('{n}', String(count))}
        </p>
      </CardContent>
    </Card>
  );
}

function ExportPanel({ t, count, scenarioName, onExport }: { t: (k: string) => string; count: number; scenarioName: string; onExport: () => void }) {
  return (
    <Card>
      <CardContent className="space-y-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{t('studio.exportTitle')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('studio.exportLead')}</p>
        </div>
        <p className="text-sm text-muted-foreground">{t('studio.exportScope').replace('{name}', scenarioName).replace('{n}', String(count))}</p>
        <Button onClick={onExport}><Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}</Button>
        <p className="text-xs text-muted-foreground">{t('studio.exportNote')}</p>
      </CardContent>
    </Card>
  );
}

function OptimizePanel({ dataset, scenarios, opt, setOpt, defaultRouteCount, onOptimize, t }: { dataset: ReturnType<typeof buildTisDataset>; scenarios: Scenario[]; opt: OptConfig; setOpt: (v: OptConfig) => void; defaultRouteCount: number; onOptimize: () => void; t: (k: string) => string }) {
  const current = scenarios.find((s) => s.id === 'current');
  const optimized = scenarios.find((s) => s.id === 'optimized');
  const cur = current ? scenarioMetrics(applyScenario(dataset, current)) : null;
  const optM = optimized ? scenarioMetrics(applyScenario(dataset, optimized)) : null;
  const set = (patch: Partial<OptConfig>) => setOpt({ ...opt, ...patch });
  // Feasibility: validate the requested constraints over the in-scope customers.
  const rc = Math.max(0, Math.round(Number(opt.routeCount))) || defaultRouteCount;
  const feas = validateConstraints(dataset.customers, {
    routeCount: rc, workingDays: Number(opt.workingDays) || 5,
    ...(Number(opt.maxPerRoute) > 0 ? { maxPerRoute: Number(opt.maxPerRoute) } : {}),
    ...(Number(opt.maxVisitsPerDay) > 0 ? { maxVisitsPerDay: Number(opt.maxVisitsPerDay) } : {}),
  });
  const BALANCE: BalanceBy[] = ['workload', 'value', 'count'];
  return (
    <div className="space-y-3">
      {/* Simple Mode: the whole job for most companies. */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">{t('routeOpt.routeCount')}</Label><Input type="number" min={1} dir="ltr" className="w-24" placeholder={`${t('routeOpt.auto')} (${defaultRouteCount})`} value={opt.routeCount} onChange={(e) => set({ routeCount: e.target.value })} /></div>
        <div className="space-y-1"><Label className="text-xs">{t('routeOpt.workingDays')}</Label><Input type="number" min={1} max={7} dir="ltr" className="w-24" value={opt.workingDays} onChange={(e) => set({ workingDays: e.target.value })} /></div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">{t('routeOpt.balanceBy')}</Label>
        <div className="flex flex-wrap gap-1">
          {BALANCE.map((b) => (
            <button key={b} onClick={() => set({ balanceBy: b })} className={`rounded-md border px-2.5 py-1 text-xs ${opt.balanceBy === b ? 'border-primary bg-secondary font-medium' : 'hover:bg-muted'}`}>{t(`routeOpt.bal_${b}`)}</button>
          ))}
        </div>
      </div>

      {/* Advanced (collapsed by default — Simplicity Model). */}
      <button onClick={() => set({ advanced: !opt.advanced })} className="text-xs text-primary hover:underline">{opt.advanced ? t('routeOpt.hideAdvanced') : t('routeOpt.advanced')}</button>
      {opt.advanced && (
        <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/20 p-2">
          <div className="space-y-1"><Label className="text-xs">{t('routeOpt.maxPerRoute')}</Label><Input type="number" min={1} dir="ltr" className="w-24" value={opt.maxPerRoute} onChange={(e) => set({ maxPerRoute: e.target.value })} /></div>
          <div className="space-y-1"><Label className="text-xs">{t('routeOpt.maxVisitsPerDay')}</Label><Input type="number" min={1} dir="ltr" className="w-24" value={opt.maxVisitsPerDay} onChange={(e) => set({ maxVisitsPerDay: e.target.value })} /></div>
        </div>
      )}

      {/* Inline feasibility recommendation (shown in Simple — no need to open Advanced). */}
      {!feas.feasible && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
          <span>{t('routeOpt.infeasibleHint').replace('{n}', String(feas.recommendedRoutes))}</span>
          <Button size="sm" variant="outline" className="ms-auto" onClick={() => set({ routeCount: String(feas.recommendedRoutes) })}>{t('routeOpt.useRecommended').replace('{n}', String(feas.recommendedRoutes))}</Button>
        </div>
      )}

      <Button onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('routeOpt.generate')}</Button>

      {cur && optM && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start font-medium">{t('routeOpt.metric')}</th><th className="px-3 py-2 text-end font-medium">{t('routeOpt.current')}</th><th className="px-3 py-2 text-end font-medium">{t('routeOpt.optimized')}</th></tr></thead>
            <tbody>
              {([['routeOpt.routes', cur.routeCount, optM.routeCount], ['routeOpt.distance', `${(cur.distanceM / 1000).toFixed(0)} km`, `${(optM.distanceM / 1000).toFixed(0)} km`], ['routeOpt.balance', `${cur.routeBalancePct}%`, `${optM.routeBalancePct}%`], ['planBoard.valueBalance', `${cur.valueBalancePct}%`, `${optM.valueBalancePct}%`]] as const).map(([k, a, b]) => (
                <tr key={k} className="border-b last:border-0"><td className="px-3 py-2">{t(k)}</td><td className="px-3 py-2 text-end tabular-nums text-muted-foreground" dir="ltr">{a}</td><td className="px-3 py-2 text-end font-medium tabular-nums" dir="ltr">{b}</td></tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}

function NeedsPanel({ text }: { text: string }) {
  return <Card className="border-dashed"><CardContent className="p-6 text-center text-sm text-muted-foreground">{text}</CardContent></Card>;
}
