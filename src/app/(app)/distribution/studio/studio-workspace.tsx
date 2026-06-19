'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutDashboard, Scale, Map as MapIcon, Wand2, LayoutGrid, Users, Copy, Download, ArrowUpRight } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { StatCard } from '@/components/shared/stat-card';
import { buildTisDataset, type TisCustomer, type TisSource } from '@/lib/tis/dataset';
import { applyScenario, scenarioMetrics, type Scenario } from '@/lib/tis/scenario';
import { currentPlanScenario, cloneScenario, liveMetrics } from '@/lib/tis/plan-edit';
import { balanceRoutes } from '@/lib/tis/optimize-routes';
import { datasetToCsv } from '@/lib/tis/export';
import { auditTerritory } from '@/lib/tis/audit';
import { buildGeoLayers, type GeoLayerId } from '@/lib/tis/geo';
import { TerritoryAuditView } from '../territory-audit/territory-audit';
import { PlanningMap, type PlanMapPoint } from '../planning-board/planning-map';
import { PlanningCanvas, MetricsBar, routeColorMap, scenarioMapPoints } from '../planning-board/planning-canvas';

type Stage = 'overview' | 'audit' | 'map' | 'optimize' | 'plan' | 'size';
const GEO_LAYERS: GeoLayerId[] = ['coverage', 'ownership', 'whitespace', 'imbalance', 'customers'];
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
export function StudioWorkspace({ customers, asOf, source, demo }: { customers: TisCustomer[]; asOf: string; source: TisSource; demo: boolean }) {
  const { t } = useI18n();
  const dataset = useMemo(() => buildTisDataset(customers, { asOf, source }), [customers, asOf, source]);
  const defaultRouteCount = useMemo(() => Math.max(1, new Set(customers.map((c) => c.ownership.routeId).filter(Boolean)).size || 6), [customers]);

  const [scenarios, setScenarios] = useState<Scenario[]>(() => [currentPlanScenario(dataset)]);
  const [activeId, setActiveId] = useState('current');
  const [stage, setStage] = useState<Stage>('overview');
  const [geoLayer, setGeoLayer] = useState<GeoLayerId>('coverage');
  const [workingDays, setWorkingDays] = useState('5');
  const [routeCountInput, setRouteCountInput] = useState(''); // '' = auto (current route count)
  const active = scenarios.find((s) => s.id === activeId) ?? scenarios[0];
  const update = (next: Scenario) => setScenarios((list) => list.map((s) => (s.id === next.id ? next : s)));

  const audit = useMemo(() => auditTerritory(dataset), [dataset]);
  const geoLayers = useMemo(() => buildGeoLayers(dataset, audit), [dataset, audit]);
  const metrics = useMemo(() => liveMetrics(dataset, active), [dataset, active]);

  function onOptimize() {
    const rc = Math.max(0, Math.round(Number(routeCountInput))) || defaultRouteCount;
    const plan = balanceRoutes(dataset.customers, { routeCount: rc, workingDays: Number(workingDays) || 5 });
    setScenarios((list) => [...list.filter((s) => s.id !== 'optimized'), { id: 'optimized', name: t('planBoard.optimized'), assignments: plan.assignments }]);
    setActiveId('optimized');
    setStage('plan');
  }
  function onClone() {
    const id = ['A', 'B', 'C'].find((l) => !scenarios.some((s) => s.id === l));
    if (!id) return;
    setScenarios((list) => [...list, cloneScenario(active, id, `${t('planBoard.scenario')} ${id}`)]);
    setActiveId(id);
  }
  function onExport() {
    const blob = new Blob([datasetToCsv(applyScenario(dataset, active))], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `studio-plan-${active.id}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  }

  // Persistent map: scenario-route colour in Optimize/Plan, else the chosen geo layer.
  const routeColor = useMemo(() => routeColorMap(dataset, active), [dataset, active]);
  const mapPoints = useMemo<PlanMapPoint[]>(() => {
    if (stage === 'optimize' || stage === 'plan') return scenarioMapPoints(dataset, active, routeColor);
    const layer = stage === 'map' ? geoLayer : 'coverage';
    return geoLayers[layer].features.map((f) => ({ id: f.id, name: f.name, lat: f.lat, lng: f.lng, color: f.color }));
  }, [stage, geoLayer, geoLayers, dataset, active, routeColor]);

  const STAGES: { key: Stage; icon: typeof MapIcon; label: string }[] = [
    { key: 'overview', icon: LayoutDashboard, label: t('studio.overview') },
    { key: 'audit', icon: Scale, label: t('studio.audit') },
    { key: 'map', icon: MapIcon, label: t('studio.map') },
    { key: 'optimize', icon: Wand2, label: t('studio.optimize') },
    { key: 'plan', icon: LayoutGrid, label: t('studio.plan') },
    { key: 'size', icon: Users, label: t('studio.size') },
  ];

  return (
    <div className="space-y-3">
      {/* Shared toolbar: scenario tabs + actions. */}
      <div className="flex flex-wrap items-center gap-2">
        {scenarios.map((s) => (
          <button key={s.id} onClick={() => setActiveId(s.id)} className={`rounded-md border px-3 py-1.5 text-sm ${s.id === activeId ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>{s.name}</button>
        ))}
        <div className="ms-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('planBoard.optimize')}</Button>
          <Button size="sm" variant="outline" onClick={onClone}><Copy className="h-4 w-4" /> {t('planBoard.clone')}</Button>
          <Button size="sm" variant="outline" onClick={onExport}><Download className="h-4 w-4" /> {t('routeOpt.exportCsv')}</Button>
        </div>
      </div>

      <MetricsBar m={metrics} />

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
          {stage === 'plan' ? (
            <>
              <PlanningMap key="studio-map" points={mapPoints} onSelect={() => { /* Plan editing happens on the canvas below. */ }} />
              <PlanningCanvas dataset={dataset} scenario={active} onChange={update} />
              <StageLink href={STANDALONE.plan!} label={t('studio.openFull')} />
            </>
          ) : (
            <div className="flex flex-col gap-3 xl:flex-row">
              <div className="min-w-0 space-y-2 xl:flex-1">
                {stage === 'map' && (
                  <div className="flex flex-wrap gap-1 text-sm">
                    {GEO_LAYERS.filter((id) => geoLayers[id].available).map((id) => (
                      <button key={id} onClick={() => setGeoLayer(id)} className={`rounded-md border px-2.5 py-1 ${geoLayer === id ? 'bg-secondary font-medium' : 'hover:bg-muted'}`}>{t(`geo.layer_${id}`)}</button>
                    ))}
                  </div>
                )}
                <PlanningMap key="studio-map" points={mapPoints} onSelect={() => { /* read-only on non-Plan stages */ }} />
              </div>

              {/* Contextual panel. */}
              <aside className="min-w-0 space-y-3 xl:w-[380px] xl:shrink-0">
                {stage === 'overview' && <OverviewPanel audit={audit} onOptimize={onOptimize} t={t} demo={demo} />}
                {stage === 'audit' && <TerritoryAuditView audit={audit} labels={{}} />}
                {stage === 'map' && <p className="text-sm text-muted-foreground">{t('studio.mapLead')}</p>}
                {stage === 'optimize' && <OptimizePanel dataset={dataset} scenarios={scenarios} workingDays={workingDays} setWorkingDays={setWorkingDays} routeCount={routeCountInput} setRouteCount={setRouteCountInput} defaultRouteCount={defaultRouteCount} onOptimize={onOptimize} t={t} />}
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

function StageLink({ href, label }: { href: string; label: string }) {
  return <Link href={href} className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"><ArrowUpRight className="h-3.5 w-3.5" /> {label}</Link>;
}

function OverviewPanel({ audit, onOptimize, t, demo }: { audit: ReturnType<typeof auditTerritory>; onOptimize: () => void; t: (k: string) => string; demo: boolean }) {
  const h = audit.headline;
  // Guided next-step: gaps first, then balance, else fine-tune in Plan.
  const nextKey = h.gapCount > 0 ? 'studio.nextAudit' : h.worstBalancePct < 70 ? 'studio.nextOptimize' : 'studio.nextPlan';
  return (
    <div className="space-y-3">
      {demo && <p className="text-xs text-muted-foreground">{t('studio.demoNote')}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <StatCard label={t('coverage.headlineCoverage')} value={`${h.coveragePct}%`} icon={LayoutDashboard} tone="primary" hint={t('coverage.ofNCustomers').replace('{n}', String(h.customers))} />
        <StatCard label={t('territoryAudit.coverageGaps')} value={String(h.gapCount)} icon={Scale} tone="warning" />
        <StatCard label={t('territoryAudit.whiteSpace')} value={String(h.whiteSpaceCount)} icon={MapIcon} tone="info" />
        <StatCard label={t('territoryAudit.worstBalance')} value={`${h.worstBalancePct}%`} icon={Scale} tone={h.worstBalancePct >= 70 ? 'success' : 'destructive'} />
      </div>
      <Card className="bg-muted/40"><CardContent className="space-y-2 p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('studio.nextStep')}</p>
        <p className="text-sm">{t(nextKey)}</p>
        <Button size="sm" onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('studio.startOptimize')}</Button>
      </CardContent></Card>
    </div>
  );
}

function OptimizePanel({ dataset, scenarios, workingDays, setWorkingDays, routeCount, setRouteCount, defaultRouteCount, onOptimize, t }: { dataset: ReturnType<typeof buildTisDataset>; scenarios: Scenario[]; workingDays: string; setWorkingDays: (v: string) => void; routeCount: string; setRouteCount: (v: string) => void; defaultRouteCount: number; onOptimize: () => void; t: (k: string) => string }) {
  const current = scenarios.find((s) => s.id === 'current');
  const optimized = scenarios.find((s) => s.id === 'optimized');
  const cur = current ? scenarioMetrics(applyScenario(dataset, current)) : null;
  const opt = optimized ? scenarioMetrics(applyScenario(dataset, optimized)) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">{t('routeOpt.routeCount')}</Label><Input type="number" min={1} dir="ltr" className="w-24" placeholder={`${t('routeOpt.auto')} (${defaultRouteCount})`} value={routeCount} onChange={(e) => setRouteCount(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">{t('routeOpt.workingDays')}</Label><Input type="number" min={1} max={7} dir="ltr" className="w-24" value={workingDays} onChange={(e) => setWorkingDays(e.target.value)} /></div>
        <Button onClick={onOptimize}><Wand2 className="h-4 w-4" /> {t('routeOpt.generate')}</Button>
      </div>
      {cur && opt && (
        <Card><CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-xs text-muted-foreground"><tr><th className="px-3 py-2 text-start font-medium">{t('routeOpt.metric')}</th><th className="px-3 py-2 text-end font-medium">{t('routeOpt.current')}</th><th className="px-3 py-2 text-end font-medium">{t('routeOpt.optimized')}</th></tr></thead>
            <tbody>
              {([['routeOpt.routes', cur.routeCount, opt.routeCount], ['routeOpt.distance', `${(cur.distanceM / 1000).toFixed(0)} km`, `${(opt.distanceM / 1000).toFixed(0)} km`], ['routeOpt.balance', `${cur.routeBalancePct}%`, `${opt.routeBalancePct}%`], ['planBoard.valueBalance', `${cur.valueBalancePct}%`, `${opt.valueBalancePct}%`]] as const).map(([k, a, b]) => (
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
