import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ArrowLeft, ArrowRight } from 'lucide-react';
import type { RawCustomer, Customer, OptimizationParams, OptimizationResult, Depot, WorkerMessage, RouteResult, DayPlan } from '../types';
import { monthlyToWeekly } from '../algorithms/frequency';
import { solveRoundTripTsp } from '../algorithms/tsp';
import { exportToExcel, generateGoogleMapsUrl } from '../excelExport';
import { LanguageSwitcher } from './LanguageSwitcher';
import { DataImport } from './DataImport';
import { PlanningScope } from './PlanningScope';
import { OptimizationParamsPanel } from './OptimizationParams';
import { ProgressIndicator } from './ProgressIndicator';
import { RouteMap } from './RouteMap';
import { RouteCards } from './RouteCards';
import { VisitTable } from './VisitTable';
import { KPIDashboard } from './KPIDashboard';
import { StartPointEditor } from './StartPointEditor';
import { JourneyPlanPrint } from './JourneyPlanPrint';
import { MasterPlanPrint } from './MasterPlanPrint';

import '../i18n';

const DAY_NAMES = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'];

function resequenceRouteWithDepot(
  route: RouteResult,
  depot: Depot,
  avgSpeed: number,
  avgVisitTimeMin: number,
  workingHoursPerDay: number,
  dailyKmCap: number,
): RouteResult {
  const avgVisitTimeHrs = avgVisitTimeMin / 60;
  const newDailyPlans: DayPlan[] = route.dailyPlans.map((dp) => {
    const customers = dp.sequencedCustomers;
    if (customers.length === 0) {
      return { ...dp, distanceKm: 0, travelTimeHours: 0, visitTimeHours: 0, totalHours: 0, googleMapsUrl: '' };
    }

    const tspPoints = customers.map((c) => ({ index: c.index, lat: c.lat, lng: c.lng }));
    const tspResult = solveRoundTripTsp(depot, tspPoints);

    const custMap = new Map(customers.map((c) => [c.index, c]));
    const sequenced = tspResult.orderedIndices.map((idx) => custMap.get(idx)!).filter(Boolean);

    const distanceKm = tspResult.totalDistance;
    const travelTimeHours = distanceKm / avgSpeed;
    const visitTimeHours = sequenced.length * avgVisitTimeHrs;
    const totalHours = travelTimeHours + visitTimeHours;

    return {
      ...dp,
      sequencedCustomers: sequenced,
      distanceKm,
      travelTimeHours,
      visitTimeHours,
      totalHours,
      googleMapsUrl: generateGoogleMapsUrl(depot, sequenced),
    };
  });

  const weeklyKm = newDailyPlans.reduce((s, dp) => s + dp.distanceKm, 0);
  const monthlyKm = weeklyKm * 4;
  const activeDays = newDailyPlans.filter((dp) => dp.sequencedCustomers.length > 0);
  const avgDailyHours = activeDays.length > 0
    ? activeDays.reduce((s, dp) => s + dp.totalHours, 0) / activeDays.length
    : 0;
  const totalVisitHrs = newDailyPlans.reduce((s, dp) => s + dp.visitTimeHours, 0);
  const totalHrs = newDailyPlans.reduce((s, dp) => s + dp.totalHours, 0);
  const sellingTimeRatio = totalHrs > 0 ? totalVisitHrs / totalHrs : 0;

  const warnings: string[] = [];
  for (const dp of newDailyPlans) {
    if (dp.totalHours > workingHoursPerDay) warnings.push(`${DAY_NAMES[dp.dayIndex]}: hours exceeded (${dp.totalHours.toFixed(1)}h)`);
    if (dailyKmCap > 0 && dp.distanceKm > dailyKmCap) warnings.push(`${DAY_NAMES[dp.dayIndex]}: km exceeded (${dp.distanceKm.toFixed(0)} km)`);
  }
  if (sellingTimeRatio < 0.4) warnings.push('Low selling time ratio');

  return {
    ...route,
    depot,
    dailyPlans: newDailyPlans,
    weeklyKm,
    monthlyKm,
    avgDailyHours,
    sellingTimeRatio,
    warnings,
  };
}

type Step = 'import' | 'configure' | 'results';

const DEFAULT_PARAMS: OptimizationParams = {
  distributionMethod: 'count',
  numberOfRoutes: 10,
  customersPerRoute: 80,
  workingDaysPerWeek: 6,
  avgVisitTime: 20,
  workingHoursPerDay: 8,
  avgSpeed: 30,
  frequencySource: 'automatic',
  uniformFrequency: 1,
  outlierDistance: 50,
  createOutstationRoutes: true,
  outlierLinkDistance: 30,
  dailyKmCap: 0,
};

export function RouteOptimizerApp() {
  const { t } = useTranslation();

  // Step management
  const [step, setStep] = useState<Step>('import');

  // Import state
  const [rawCustomers, setRawCustomers] = useState<RawCustomer[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Scope state
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [excludeInactive, setExcludeInactive] = useState(true);

  // Params state
  const [params, setParams] = useState<OptimizationParams>(DEFAULT_PARAMS);

  // Optimization state
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [result, setResult] = useState<OptimizationResult | null>(null);

  // Depot state
  const [depots, setDepots] = useState<Map<number, Depot>>(new Map());
  const [depotEditRoute, setDepotEditRoute] = useState<number | null>(null);

  // Print state
  const [printRoute, setPrintRoute] = useState<number | null>(null);
  const [printDay, setPrintDay] = useState<number | null>(null);

  // Derived data
  const cities = useMemo(() => {
    const set = new Set(rawCustomers.map((c) => c.city).filter(Boolean));
    return Array.from(set).sort();
  }, [rawCustomers]);

  const branches = useMemo(() => {
    const set = new Set(rawCustomers.map((c) => c.branch || c.newBranch).filter(Boolean));
    return Array.from(set).sort();
  }, [rawCustomers]);

  const scopedCustomers = useMemo((): Customer[] => {
    return rawCustomers
      .filter((c) => {
        if (excludeInactive && c.inactive) return false;
        if (selectedCity && c.city !== selectedCity) return false;
        if (selectedBranch && (c.branch !== selectedBranch && c.newBranch !== selectedBranch)) return false;
        return true;
      })
      .map((c, i) => ({
        index: i,
        customerNo: c.customerNo,
        customerNameE: c.customerNameE,
        customerNameA: c.customerNameA,
        lat: c.latitude,
        lng: c.longitude,
        city: c.city || c.dynamicCity,
        branch: c.branch || c.newBranch,
        monthlyVisits: c.monthlyVisits,
        weeklyFreq: monthlyToWeekly(c.monthlyVisits),
        salesmanName: c.salesmanName,
        customerType: c.customerType,
      }));
  }, [rawCustomers, selectedCity, selectedBranch, excludeInactive]);

  const handleImport = useCallback((customers: RawCustomer[]) => {
    setRawCustomers(customers);
    setResult(null);
    setStep('configure');
  }, []);

  const handleRunOptimization = useCallback(() => {
    if (scopedCustomers.length === 0) return;

    setIsOptimizing(true);
    setProgressStep('distributing');
    setProgressPercent(0);
    setResult(null);
    setStep('results');

    const worker = new Worker(
      new URL('../algorithms/optimizer.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress':
          setProgressStep(msg.step);
          setProgressPercent(msg.percent);
          break;
        case 'result':
          setResult(msg.result);
          setIsOptimizing(false);
          worker.terminate();
          break;
        case 'error':
          setImportError(msg.message);
          setIsOptimizing(false);
          setStep('configure');
          worker.terminate();
          break;
      }
    };

    worker.onerror = () => {
      setImportError('Optimization failed unexpectedly');
      setIsOptimizing(false);
      setStep('configure');
      worker.terminate();
    };

    worker.postMessage({ type: 'optimize', customers: scopedCustomers, params });
  }, [scopedCustomers, params]);

  const handleSetDepot = useCallback((routeIndex: number, depot: Depot) => {
    setDepots((prev) => {
      const next = new Map(prev);
      next.set(routeIndex, depot);
      return next;
    });
    setDepotEditRoute(null);
  }, []);

  const handleResetDepot = useCallback((routeIndex: number) => {
    setDepots((prev) => {
      const next = new Map(prev);
      next.delete(routeIndex);
      return next;
    });
  }, []);

  const handleMapClick = useCallback((routeIndex: number, lat: number, lng: number) => {
    handleSetDepot(routeIndex, { lat, lng, source: 'map' });
  }, [handleSetDepot]);

  const handleExportExcel = useCallback(() => {
    if (result) {
      exportToExcel(result, scopedCustomers, 'en');
    }
  }, [result, scopedCustomers]);

  const routesWithDepots = useMemo(() => {
    if (!result) return [];
    return result.routes.map((route, i) => {
      const depot = depots.get(i);
      if (!depot) return route;
      return resequenceRouteWithDepot(route, depot, params.avgSpeed, params.avgVisitTime, params.workingHoursPerDay, params.dailyKmCap);
    });
  }, [result, depots, params.avgSpeed, params.avgVisitTime, params.workingHoursPerDay, params.dailyKmCap]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-h1 font-bold text-primary">{t('app.title')}</h1>
            <p className="text-caption text-muted-foreground">{t('app.subtitle')}</p>
          </div>
          <div className="flex items-center gap-3">
            {result && (
              <>
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 rounded-lg bg-success px-3 py-2 text-sm font-medium text-success-foreground hover:bg-success/90"
                >
                  <Download className="h-4 w-4" />
                  {t('excel.exportExcel')}
                </button>
              </>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Step navigation */}
      <div className="mx-auto max-w-7xl px-4 py-3">
        <div className="flex items-center gap-2">
          {(['import', 'configure', 'results'] as const).map((s, i) => (
            <button
              key={s}
              onClick={() => {
                if (s === 'import') setStep('import');
                else if (s === 'configure' && rawCustomers.length > 0) setStep('configure');
                else if (s === 'results' && result) setStep('results');
              }}
              disabled={
                (s === 'configure' && rawCustomers.length === 0) ||
                (s === 'results' && !result && !isOptimizing)
              }
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                step === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 disabled:opacity-40'
              }`}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-background/20 text-xs font-bold">
                {i + 1}
              </span>
              {s === 'import' && t('import.title')}
              {s === 'configure' && t('params.title')}
              {s === 'results' && t('kpi.title')}
            </button>
          ))}
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-6">
        {/* Step 1: Import */}
        {step === 'import' && (
          <div className="space-y-6">
            <DataImport
              onImport={handleImport}
              importedCount={rawCustomers.length}
              cities={cities}
              branches={branches}
              error={importError}
              onError={setImportError}
            />
            {rawCustomers.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => setStep('configure')}
                  className="flex items-center gap-2 rounded-lg bg-primary px-6 py-2 text-sm font-medium text-primary-foreground"
                >
                  {t('scope.title')} <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Configure */}
        {step === 'configure' && (
          <div className="space-y-8">
            <PlanningScope
              customers={rawCustomers}
              cities={cities}
              branches={branches}
              selectedCity={selectedCity}
              selectedBranch={selectedBranch}
              excludeInactive={excludeInactive}
              onCityChange={setSelectedCity}
              onBranchChange={setSelectedBranch}
              onExcludeInactiveChange={setExcludeInactive}
              scopeCount={scopedCustomers.length}
            />

            <OptimizationParamsPanel
              params={params}
              onChange={setParams}
              onRun={handleRunOptimization}
              isOptimizing={isOptimizing}
              customerCount={scopedCustomers.length}
            />

            <div className="flex justify-between">
              <button
                onClick={() => setStep('import')}
                className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
              >
                <ArrowLeft className="h-4 w-4" /> {t('import.title')}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && (
          <div className="space-y-8">
            {isOptimizing && (
              <ProgressIndicator step={progressStep} percent={progressPercent} />
            )}

            {result && !isOptimizing && (
              <>
                <KPIDashboard result={result} />

                <RouteMap
                  routes={routesWithDepots}
                  outstationRoutes={result.outstationRoutes}
                  onMapClick={handleMapClick}
                  depotEditRoute={depotEditRoute}
                />

                <RouteCards
                  routes={routesWithDepots}
                  outstationRoutes={result.outstationRoutes}
                />

                <StartPointEditor
                  routes={routesWithDepots}
                  depots={depots}
                  onSetDepot={handleSetDepot}
                  onResetDepot={handleResetDepot}
                  onStartMapClick={setDepotEditRoute}
                  depotEditRoute={depotEditRoute}
                />

                <VisitTable
                  routes={routesWithDepots}
                  outstationRoutes={result.outstationRoutes}
                />

                {/* Print section */}
                <div className="space-y-4">
                  <h2 className="text-h2 font-semibold">{t('print.journeyPlanTitle')}</h2>
                  <div className="flex flex-wrap items-center gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-medium">{t('visitTable.filterByRoute')}</label>
                      <select
                        value={printRoute ?? ''}
                        onChange={(e) => setPrintRoute(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                      >
                        <option value="">{t('print.printAll')}</option>
                        {routesWithDepots.map((_, i) => (
                          <option key={i} value={i}>{t('routeCards.routeNumber', { number: i + 1 })}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium">{t('visitTable.filterByDay')}</label>
                      <select
                        value={printDay ?? ''}
                        onChange={(e) => setPrintDay(e.target.value ? Number(e.target.value) : null)}
                        className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
                      >
                        <option value="">{t('visitTable.allDays')}</option>
                        {['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'].map((day, i) => (
                          <option key={i} value={i}>{t(`print.days.${day}`)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end gap-2">
                      <JourneyPlanPrint
                        routes={routesWithDepots}
                        outstationRoutes={result.outstationRoutes}
                        selectedRoute={printRoute}
                        selectedDay={printDay}
                      />
                      <MasterPlanPrint result={result} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-start pb-8">
                  <button
                    onClick={() => setStep('configure')}
                    className="flex items-center gap-2 rounded-lg bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
                  >
                    <ArrowLeft className="h-4 w-4" /> {t('params.title')}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
