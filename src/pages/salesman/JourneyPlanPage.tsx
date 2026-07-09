import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, MapPin, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';
import { nextStop } from '@/lib/salesman/selectors';
import { evaluateCredit } from '@/lib/salesman/credit';
import type { VisitStatus } from '@/lib/salesman/types';

const DOT: Record<VisitStatus, string> = {
  pending: 'bg-muted-foreground/40',
  in_progress: 'bg-info',
  visited: 'bg-success',
  skipped: 'bg-muted-foreground/40',
};

export function JourneyPlanPage() {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const navigate = useNavigate();
  const Chevron = isAr ? ChevronLeft : ChevronRight;

  const route = useSalesmanDay((s) => s.route);
  const customers = useSalesmanDay((s) => s.customers);
  const creditLimits = useSalesmanDay((s) => s.creditLimits);
  const balances = useSalesmanDay((s) => s.balances);

  const next = useMemo(() => nextStop(route), [route]);
  const visited = route.filter((r) => r.status === 'visited').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('salesman.todayRoute')}</h1>
        <span className="text-sm font-semibold tabular-nums text-muted-foreground">
          {visited}/{route.length}
        </span>
      </div>

      <ul className="space-y-2">
        {route.map((stop) => {
          const c = customers[stop.customerId];
          const ev = evaluateCredit({
            ...creditLimits[stop.customerId],
            ...balances[stop.customerId],
          });
          const isNext = next?.customerId === stop.customerId;
          const name = isAr ? c.nameAr : c.name;
          const area = isAr ? c.areaAr : c.area;
          return (
            <li key={stop.id}>
              <Card
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/salesman/customer/${stop.customerId}`)}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/salesman/customer/${stop.customerId}`)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 p-3 transition-all active:scale-[0.99]',
                  isNext && 'border-primary/40 ring-1 ring-primary/30',
                )}
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold tabular-nums">
                  {stop.status === 'visited' ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    stop.sequence
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn('h-2 w-2 shrink-0 rounded-full', DOT[stop.status])} />
                    <p className="truncate text-sm font-semibold text-foreground" title={name}>
                      {name}
                    </p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.code} · {area}</span>
                  </div>
                  {stop.status === 'visited' && stop.outcome ? (
                    <span className="mt-1 inline-block rounded bg-success/10 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                      {t(`salesman.outcome_${stop.outcome}`)}
                    </span>
                  ) : !ev.canSell ? (
                    <span className="mt-1 inline-block rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      {t('salesman.outcome_collection')} · {formatCurrency(balances[stop.customerId].outstandingBalance)}
                    </span>
                  ) : null}
                </div>
                <Chevron className="h-5 w-5 shrink-0 text-muted-foreground" />
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
