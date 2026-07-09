import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ReceiptText, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn, formatCurrency } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';

const PAY_TONE: Record<string, string> = {
  paid: 'bg-success/15 text-success',
  partial: 'bg-warning/15 text-warning',
  unpaid: 'bg-destructive/15 text-destructive',
};

export function InvoicesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const Chevron = isAr ? ChevronLeft : ChevronRight;
  const invoices = useSalesmanDay((s) => s.invoices);

  if (invoices.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground">
        <ReceiptText className="h-10 w-10 opacity-40" />
        <p className="text-sm">{t('salesman.noInvoices')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('salesman.invoices')}</h1>
      <ul className="space-y-2">
        {invoices.map((inv) => (
          <li key={inv.id}>
            <Card
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/salesman/invoice/${inv.id}`)}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/salesman/invoice/${inv.id}`)}
              className="flex cursor-pointer items-center gap-3 p-3 transition-all active:scale-[0.99]"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold tabular-nums">{inv.number}</p>
                  {inv.type === 'return' && (
                    <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                      {t('salesman.return')}
                    </span>
                  )}
                </div>
                <p className="truncate text-[11px] text-muted-foreground" title={inv.customerName}>
                  {inv.customerName}
                </p>
              </div>
              <div className="shrink-0 text-end">
                <p className="text-sm font-bold tabular-nums">{formatCurrency(inv.total)}</p>
                <span className={cn('inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold', PAY_TONE[inv.paymentStatus])}>
                  {t(`salesman.pay_${inv.paymentStatus}`)}
                </span>
              </div>
              <Chevron className="h-5 w-5 shrink-0 text-muted-foreground" />
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
