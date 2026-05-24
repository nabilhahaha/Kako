import { useState, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, ArrowLeft, ArrowRight, Printer, FileSpreadsheet, LayoutDashboard } from 'lucide-react';
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
import { BeforeAfterComparison } from './BeforeAfterComparison';
import { StartPointEditor } from './StartPointEditor';
import { JourneyPlanPrint } from './JourneyPlanPrint';
import { MasterPlanPrint } from './MasterPlanPrint';
import { RouteSelector } from './RouteSelector';

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
type ResultsTab = 'dashboard' | 'map' | 'routes' | 'schedule' | 'print';

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
  fuelPricePerLiter: 2.18,
  fuelConsumption: 12,
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

  // Salesman names state
  const [salesmanNames, setSalesmanNames] = useState<Map<number, string>>(new Map());

  // Results view state
  const [resultsTab, setResultsTab] = useState<ResultsTab>('dashboard');
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);

  const handleSalesmanNameChange = useCallback((routeIndex: number, name: string) => {
    setSalesmanNames((prev) => {
      const next = new Map(prev);
      next.set(routeIndex, name);
      return next;
    });
  }, []);

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
    setResultsTab('dashboard');
    setSelectedRouteIndex(null);

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

  const hasSalesmanData = useMemo(() => {
    return scopedCustomers.some((c) => c.salesmanName && c.salesmanName.trim() !== '');
  }, [scopedCustomers]);

  const routesWithDepots = useMemo(() => {
    if (!result) return [];
    return result.routes.map((route, i) => {
      const depot = depots.get(i);
      if (!depot) return route;
      return resequenceRouteWithDepot(route, depot, params.avgSpeed, params.avgVisitTime, params.workingHoursPerDay, params.dailyKmCap);
    });
  }, [result, depots, params.avgSpeed, params.avgVisitTime, params.workingHoursPerDay, params.dailyKmCap]);

  // Filtered routes for single-route view
  const filteredRoutes = useMemo(() => {
    if (selectedRouteIndex === null) return routesWithDepots;
    if (selectedRouteIndex < routesWithDepots.length) {
      return [routesWithDepots[selectedRouteIndex]];
    }
    return [];
  }, [routesWithDepots, selectedRouteIndex]);

  const filteredOutstationRoutes = useMemo(() => {
    if (!result) return [];
    if (selectedRouteIndex === null) return result.outstationRoutes;
    const outstationIdx = selectedRouteIndex - routesWithDepots.length;
    if (outstationIdx >= 0 && outstationIdx < result.outstationRoutes.length) {
      return [result.outstationRoutes[outstationIdx]];
    }
    return [];
  }, [result, selectedRouteIndex, routesWithDepots.length]);

  // Sync print route with selected route
  const effectivePrintRoute = selectedRouteIndex !== null ? selectedRouteIndex : printRoute;

  const resultsTabs: { key: ResultsTab; label: string }[] = [
    { key: 'dashboard', label: t('kpi.title') },
    { key: 'map', label: t('routeCards.title') },
    { key: 'routes', label: t('routeCards.routeNumber', { number: '' }).trim() },
    { key: 'schedule', label: t('visitTable.title') },
    { key: 'print', label: t('print.journeyPlanTitle') },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Professional Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-800">
              <LayoutDashboard className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 tracking-tight">{t('app.title')}</h1>
              <p className="text-xs text-slate-500">{t('app.subtitle')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {result && step === 'results' && (
              <div className="flex items-center gap-2 border-r border-slate-200 pr-3 mr-1">
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  {t('excel.exportExcel')}
                </button>
              </div>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      {/* Step navigation - professional underline style */}
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-[1440px] px-6">
          <nav className="flex items-center gap-0">
            {(['import', 'configure', 'results'] as const).map((s, i) => {
              const isActive = step === s;
              const isDisabled =
                (s === 'configure' && rawCustomers.length === 0) ||
                (s === 'results' && !result && !isOptimizing);

              return (
                <button
                  key={s}
                  onClick={() => {
                    if (s === 'import') setStep('import');
                    else if (s === 'configure' && rawCustomers.length > 0) setStep('configure');
                    else if (s === 'results' && result) setStep('results');
                  }}
                  disabled={isDisabled}
                  className={`relative flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'text-blue-600'
                      : 'text-slate-500 hover:text-slate-700 disabled:text-slate-300 disabled:cursor-not-allowed'
                  }`}
                >
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold ${
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-200 text-slate-500'
                  }`}>
                    {i + 1}
                  </span>
                  <span>
                    {s === 'import' && t('import.title')}
                    {s === 'configure' && t('params.title')}
                    {s === 'results' && t('kpi.title')}
                  </span>
                  {/* Active underline indicator */}
                  {isActive && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-blue-600 rounded-t" />
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content */}
      <main className="mx-auto max-w-[1440px] px-6 py-6">
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
                  className="flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
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
                className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" /> {t('import.title')}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Results */}
        {step === 'results' && (
          <div className="space-y-0">
            {isOptimizing && (
              <div className="py-8">
                <ProgressIndicator step={progressStep} percent={progressPercent} />
              </div>
            )}

            {result && !isOptimizing && (
              <>
                {/* Results tab bar */}
                <div className="mb-6 border-b border-slate-200">
                  <nav className="flex items-center gap-0 -mb-px">
                    {resultsTabs.map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setResultsTab(tab.key)}
                        className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                          resultsTab === tab.key
                            ? 'text-blue-600 border-b-2 border-blue-600'
                            : 'text-slate-500 hover:text-slate-700 border-b-2 border-transparent'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                </div>

                {/* Quick Actions Bar */}
                <div className="mb-6 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wide mr-3">
                    {t('print.journeyPlanTitle')}:
                  </span>
                  <button
                    onClick={handleExportExcel}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {t('excel.exportExcel')}
                  </button>
                  {selectedRouteIndex !== null && (
                    <button
                      onClick={() => {
                        setPrintRoute(selectedRouteIndex);
                        setPrintDay(null);
                        setResultsTab('print');
                      }}
                      className="flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      {t('print.printJourneyPlan')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPrintRoute(null);
                      setPrintDay(null);
                      setResultsTab('print');
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Printer className="h-3.5 w-3.5" />
                    {t('print.printAll')}
                  </button>
                </div>

                {/* Main results layout: sidebar + content */}
                <div className="flex gap-6">
                  {/* Route Selector Sidebar */}
                  <div className="w-64 flex-shrink-0">
                    <RouteSelector
                      routes={routesWithDepots}
                      outstationRoutes={result.outstationRoutes}
                      selectedRouteIndex={selectedRouteIndex}
                      onSelectRoute={setSelectedRouteIndex}
                      salesmanNames={salesmanNames}
                    />
                  </div>

                  {/* Content area */}
                  <div className="flex-1 min-w-0 space-y-6">
                    {/* Dashboard tab */}
                    {resultsTab === 'dashboard' && (
                      <>
                        {hasSalesmanData && (
                          <BeforeAfterComparison customers={scopedCustomers} result={result} />
                        )}
                        <KPIDashboard result={result} params={params} />
                      </>
                    )}

                    {/* Map tab */}
                    {resultsTab === 'map' && (
                      <RouteMap
                        routes={filteredRoutes}
                        outstationRoutes={filteredOutstationRoutes}
                        onMapClick={handleMapClick}
                        depotEditRoute={depotEditRoute}
                      />
                    )}

                    {/* Routes tab */}
                    {resultsTab === 'routes' && (
                      <>
                        <RouteCards
                          routes={filteredRoutes}
                          outstationRoutes={filteredOutstationRoutes}
                          salesmanNames={salesmanNames}
                        />

                        <StartPointEditor
                          routes={routesWithDepots}
                          depots={depots}
                          onSetDepot={handleSetDepot}
                          onResetDepot={handleResetDepot}
                          onStartMapClick={setDepotEditRoute}
                          depotEditRoute={depotEditRoute}
                          salesmanNames={salesmanNames}
                          onSalesmanNameChange={handleSalesmanNameChange}
                        />
                      </>
                    )}

                    {/* Schedule tab */}
                    {resultsTab === 'schedule' && (
                      <VisitTable
                        routes={filteredRoutes}
                        outstationRoutes={filteredOutstationRoutes}
                      />
                    )}

                    {/* Print tab */}
                    {resultsTab === 'print' && (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                          <h2 className="text-base font-semibold text-slate-800 mb-4">{t('print.journeyPlanTitle')}</h2>
                          <div className="flex flex-wrap items-end gap-4">
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">{t('visitTable.filterByRoute')}</label>
                              <select
                                value={effectivePrintRoute ?? ''}
                                onChange={(e) => setPrintRoute(e.target.value ? Number(e.target.value) : null)}
                                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">{t('print.printAll')}</option>
                                {routesWithDepots.map((_, i) => (
                                  <option key={i} value={i}>{t('routeCards.routeNumber', { number: i + 1 })}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-slate-600">{t('visitTable.filterByDay')}</label>
                              <select
                                value={printDay ?? ''}
                                onChange={(e) => setPrintDay(e.target.value ? Number(e.target.value) : null)}
                                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                                selectedRoute={effectivePrintRoute}
                                selectedDay={printDay}
                                salesmanNames={salesmanNames}
                              />
                              <MasterPlanPrint result={result} />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Back button */}
                <div className="flex justify-start pt-6 pb-8">
                  <button
                    onClick={() => setStep('configure')}
                    className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
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
