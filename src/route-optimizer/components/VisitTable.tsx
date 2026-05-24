import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RouteResult } from '../types';

interface VisitTableProps {
  routes: RouteResult[];
  outstationRoutes: RouteResult[];
}

const DAY_KEYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;

export function VisitTable({ routes, outstationRoutes }: VisitTableProps) {
  const { t } = useTranslation();
  const [filterRoute, setFilterRoute] = useState<string>('');
  const [filterDay, setFilterDay] = useState<string>('');

  const allRoutes = useMemo(() => [...routes, ...outstationRoutes], [routes, outstationRoutes]);

  const rows = useMemo(() => {
    const result: Array<{
      routeLabel: string;
      routeIndex: number;
      dayIndex: number;
      dayLabel: string;
      sequence: number;
      customerNo: string;
      customerName: string;
      city: string;
      frequency: number;
      lat: number;
      lng: number;
    }> = [];

    allRoutes.forEach((route, ri) => {
      const label = ri < routes.length
        ? `${t('map.routeLabel', { number: ri + 1 })}`
        : `${t('routeCards.outstationLabel')} ${ri - routes.length + 1}`;

      route.dailyPlans.forEach((dp) => {
        dp.sequencedCustomers.forEach((c, seq) => {
          result.push({
            routeLabel: label,
            routeIndex: ri,
            dayIndex: dp.dayIndex,
            dayLabel: t('print.days.' + (DAY_KEYS[dp.dayIndex] ?? `day${dp.dayIndex}`)),
            sequence: seq + 1,
            customerNo: c.customerNo,
            customerName: c.customerNameE || c.customerNameA,
            city: c.city,
            frequency: c.weeklyFreq,
            lat: c.lat,
            lng: c.lng,
          });
        });
      });
    });

    return result;
  }, [allRoutes, routes.length, t]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filterRoute && r.routeIndex !== Number(filterRoute)) return false;
      if (filterDay && r.dayIndex !== Number(filterDay)) return false;
      return true;
    });
  }, [rows, filterRoute, filterDay]);

  return (
    <div className="space-y-4">
      <h2 className="text-h2 font-semibold">{t('visitTable.title')}</h2>

      <div className="flex flex-wrap gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium">{t('visitTable.filterByRoute')}</label>
          <select
            value={filterRoute}
            onChange={(e) => setFilterRoute(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">{t('visitTable.allRoutes')}</option>
            {allRoutes.map((_, i) => (
              <option key={i} value={i}>
                {i < routes.length
                  ? `${t('map.routeLabel', { number: i + 1 })}`
                  : `${t('routeCards.outstationLabel')} ${i - routes.length + 1}`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium">{t('visitTable.filterByDay')}</label>
          <select
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">{t('visitTable.allDays')}</option>
            {DAY_KEYS.map((key, i) => (
              <option key={i} value={i}>{t('print.days.' + key)}</option>
            ))}
          </select>
        </div>

        <div className="flex items-end">
          <span className="text-sm text-muted-foreground">
            {filtered.length} {t('visitTable.noResults') === t('visitTable.noResults') ? 'rows' : t('visitTable.noResults')}
          </span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.route')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.day')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.sequence')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.customerCode')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.customerName')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.city')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.frequency')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.latitude')}</th>
              <th className="px-3 py-2 text-start font-medium">{t('visitTable.columns.longitude')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">
                  {t('visitTable.noResults')}
                </td>
              </tr>
            ) : (
              filtered.map((row, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-3 py-2">{row.routeLabel}</td>
                  <td className="px-3 py-2">{row.dayLabel}</td>
                  <td className="px-3 py-2">{row.sequence}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.customerNo}</td>
                  <td className="px-3 py-2">{row.customerName}</td>
                  <td className="px-3 py-2">{row.city}</td>
                  <td className="px-3 py-2">{row.frequency}x</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.lat.toFixed(6)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.lng.toFixed(6)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
