import { useTranslation } from 'react-i18next';
import { MapPin, Route, Users } from 'lucide-react';
import type { RouteResult } from '../types';

interface RouteSelectorProps {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
  selectedRouteIndex: number | null; // null = all
  onSelectRoute: (index: number | null) => void;
  salesmanNames: Map<number, string>;
}

export function RouteSelector({
  routes,
  outstationRoutes,
  selectedRouteIndex,
  onSelectRoute,
  salesmanNames,
}: RouteSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="w-full rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          {t('visitTable.filterByRoute')}
        </h3>
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        {/* All Routes option */}
        <button
          onClick={() => onSelectRoute(null)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors border-l-4 ${
            selectedRouteIndex === null
              ? 'border-l-blue-600 bg-blue-50 text-slate-900 font-medium'
              : 'border-l-transparent hover:bg-slate-50 text-slate-600'
          }`}
        >
          <div className="flex h-7 w-7 items-center justify-center rounded bg-slate-200">
            <Route className="h-3.5 w-3.5 text-slate-600" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block font-medium text-slate-800">{t('print.printAll')}</span>
            <span className="block text-xs text-slate-500">
              {routes.length + outstationRoutes.length} {t('routeCards.title').toLowerCase()}
            </span>
          </div>
        </button>

        {/* Separator */}
        <div className="border-t border-slate-100 mx-3" />

        {/* Normal routes */}
        {routes.map((route, i) => {
          const isSelected = selectedRouteIndex === i;
          const salesmanName = salesmanNames.get(i);

          return (
            <button
              key={`r-${i}`}
              onClick={() => onSelectRoute(isSelected ? null : i)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-l-4 ${
                isSelected
                  ? 'border-l-blue-600 bg-blue-50 text-slate-900 font-medium'
                  : 'border-l-transparent hover:bg-slate-50 text-slate-600'
              }`}
            >
              {/* Color dot */}
              <div
                className="h-3 w-3 rounded-full flex-shrink-0 ring-1 ring-slate-200"
                style={{ backgroundColor: route.color }}
              />

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-800">
                    {t('routeCards.routeNumber', { number: i + 1 })}
                  </span>
                  {salesmanName && (
                    <span className="text-xs text-slate-500 truncate">
                      — {salesmanName}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                  <span className="flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {route.totalCustomers}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {route.weeklyKm.toFixed(0)} km
                  </span>
                </div>
              </div>

              {/* Warning indicator */}
              {route.warnings.length > 0 && (
                <div className="h-2 w-2 rounded-full bg-amber-400 flex-shrink-0" />
              )}
            </button>
          );
        })}

        {/* Outstation routes */}
        {outstationRoutes.length > 0 && (
          <>
            <div className="border-t border-slate-100 mx-3 my-1" />
            <div className="px-4 py-1.5">
              <span className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                {t('routeCards.outstation')}
              </span>
            </div>
            {outstationRoutes.map((route, i) => {
              const globalIndex = routes.length + i;
              const isSelected = selectedRouteIndex === globalIndex;

              return (
                <button
                  key={`o-${i}`}
                  onClick={() => onSelectRoute(isSelected ? null : globalIndex)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-l-4 ${
                    isSelected
                      ? 'border-l-blue-600 bg-blue-50 text-slate-900 font-medium'
                      : 'border-l-transparent hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div
                    className="h-3 w-3 rounded-full flex-shrink-0 ring-1 ring-slate-200"
                    style={{ backgroundColor: route.color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">
                        {t('routeCards.outstation')} {i + 1}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {route.totalCustomers}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {route.weeklyKm.toFixed(0)} km
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
