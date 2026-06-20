'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  COVERAGE_STATUS_KEY,
  COVERAGE_STATUS_VARIANT,
  COVERAGE_STATUS_ORDER,
} from '@/lib/distribution/journey-plan/coverage-status-ui';
import type { CoverageStatus } from '@/lib/distribution/journey-plan/coverage-status';

export interface CoverageRow {
  id: string;
  name: string;
  code: string | null;
  salesmanName: string | null;
  routeName: string | null;
  status: CoverageStatus;
  expected: number;
  actual: number;
}

interface FilterOption { id: string; name: string }

interface Props {
  rows: CoverageRow[];
  salesmen: FilterOption[];
  routes: FilterOption[];
  status: string;
  salesmanId: string;
  routeId: string;
}

/**
 * CJ-3 Customer Coverage list (exception management). Read-only: rows are the
 * pure coverage read-model (planned cadence vs actual visits, 28d). Filters
 * (status · salesman · route) drive server searchParams — manager/supervisor
 * visibility is RLS-scoped on the server. No business logic here.
 */
export function CoverageList({ rows, salesmen, routes, status, salesmanId, routeId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('coverage.filterStatus')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={status}
            onChange={(e) => setParam('status', e.target.value)}
          >
            <option value="">{t('coverage.filterAll')}</option>
            {COVERAGE_STATUS_ORDER.map((s) => (
              <option key={s} value={s}>{t(COVERAGE_STATUS_KEY[s])}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('coverage.filterSalesman')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={salesmanId}
            onChange={(e) => setParam('salesman', e.target.value)}
          >
            <option value="">{t('coverage.allSalesmen')}</option>
            {salesmen.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t('coverage.filterRoute')}</span>
          <select
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={routeId}
            onChange={(e) => setParam('route', e.target.value)}
          >
            <option value="">{t('coverage.allRoutes')}</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <span className="ms-auto self-center text-xs text-muted-foreground">
          {t('coverage.countLabel').replace('{n}', String(rows.length))}
        </span>
      </div>

      {/* Desktop table */}
      <Card className="hidden sm:block">
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b text-start text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">{t('coverage.colCustomer')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('coverage.colStatus')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.colExpected')}</th>
                <th className="px-3 py-2 text-end font-medium">{t('coverage.colActual')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('coverage.colSalesman')}</th>
                <th className="px-3 py-2 text-start font-medium">{t('coverage.colRoute')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link href={`/customers?id=${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                    {r.code && <span className="ms-2 text-xs text-muted-foreground" dir="ltr">{r.code}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={COVERAGE_STATUS_VARIANT[r.status]}>{t(COVERAGE_STATUS_KEY[r.status])}</Badge>
                  </td>
                  <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{r.expected}</td>
                  <td className="px-3 py-2 text-end tabular-nums" dir="ltr">{r.actual}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.salesmanName ?? '—'}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.routeName ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">{t('coverage.empty')}</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Mobile cards */}
      <div className="space-y-2 sm:hidden">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-1 p-3">
              <div className="flex items-center justify-between gap-2">
                <Link href={`/customers?id=${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                <Badge variant={COVERAGE_STATUS_VARIANT[r.status]}>{t(COVERAGE_STATUS_KEY[r.status])}</Badge>
              </div>
              <div className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span dir="ltr">{t('coverage.colActual')}: {r.actual}/{r.expected}</span>
                {r.salesmanName && <span>{r.salesmanName}</span>}
                {r.routeName && <span>{r.routeName}</span>}
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">{t('coverage.empty')}</p>
        )}
      </div>
    </div>
  );
}
