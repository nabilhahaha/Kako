import { useTranslation } from 'react-i18next';
import { AlertTriangle, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { evaluateCredit } from '@/lib/salesman/credit';
import type { CustomerView, VisitStatus } from '@/lib/salesman/types';

const VISIT_TONE: Record<VisitStatus, string> = {
  pending: 'bg-muted text-muted-foreground',
  in_progress: 'bg-info/15 text-info',
  visited: 'bg-success/15 text-success',
  skipped: 'bg-muted text-muted-foreground',
};

interface Props {
  view: CustomerView;
  visitStatus: VisitStatus;
}

/** Sticky customer context kept visible across all in-visit screens. */
export function CustomerContextHeader({ view, visitStatus }: Props) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const { customer, credit, balance } = view;

  const ev = evaluateCredit({ ...credit, ...balance });
  const name = isAr ? customer.nameAr : customer.name;
  const area = isAr ? customer.areaAr : customer.area;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold leading-tight text-foreground" title={name}>
            {name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {customer.code} · {area}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold',
            VISIT_TONE[visitStatus],
          )}
        >
          {t(`salesman.status_${visitStatus}`)}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <Field label={t('salesman.creditLimit')}>
          {credit.cashOnly || credit.creditLimit <= 0 ? (
            <span className="font-semibold text-warning">{t('salesman.cashOnly')}</span>
          ) : (
            <span className="font-semibold tabular-nums">{formatCurrency(credit.creditLimit)}</span>
          )}
        </Field>
        <Field label={t('salesman.outstanding')}>
          <span className="font-semibold tabular-nums">{formatCurrency(balance.outstandingBalance)}</span>
        </Field>
        <Field label={t('salesman.overdue')}>
          {balance.overdueAmount > 0 ? (
            <span className="font-semibold tabular-nums text-destructive">
              {formatCurrency(balance.overdueAmount)} · {balance.overdueDays}d
            </span>
          ) : (
            <span className="font-semibold text-success">—</span>
          )}
        </Field>
        <Field label={t('salesman.lastInvoice')}>
          <span className="font-semibold tabular-nums">{balance.lastInvoiceDate ?? '—'}</span>
        </Field>
      </div>

      {!ev.canSell ? (
        <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">{t('salesman.creditBlocked')}</p>
            {ev.reasons
              .filter((r) => r !== 'cash_only')
              .map((r) => (
                <p key={r} className="leading-tight">
                  {t(`salesman.reason_${r}`)}
                </p>
              ))}
          </div>
        </div>
      ) : !ev.cashOnly ? (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-xs text-success">
          <Wallet className="h-4 w-4 shrink-0" />
          <span className="font-medium">
            {t('salesman.availableCredit')}: {formatCurrency(ev.availableCredit)}
          </span>
        </div>
      ) : null}
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="truncate">{children}</div>
    </div>
  );
}
