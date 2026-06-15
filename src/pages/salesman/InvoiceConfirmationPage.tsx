import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  CheckCircle2,
  Printer,
  HandCoins,
  ArrowRight,
  ArrowLeft,
  Home,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { cn, formatCurrency } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';
import { nextStop } from '@/lib/salesman/selectors';

const PAY_TONE: Record<string, string> = {
  paid: 'bg-success/15 text-success',
  partial: 'bg-warning/15 text-warning',
  unpaid: 'bg-destructive/15 text-destructive',
};

export function InvoiceConfirmationPage() {
  const { invoiceId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const NextArrow = isAr ? ArrowLeft : ArrowRight;

  const invoice = useSalesmanDay((s) => s.invoices.find((i) => i.id === invoiceId));
  const route = useSalesmanDay((s) => s.route);

  const next = useMemo(
    () => nextStop(route.filter((r) => r.customerId !== invoice?.customerId)),
    [route, invoice?.customerId],
  );

  if (!invoice) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
  }

  const remaining = Math.max(0, invoice.total - invoice.paidAmount);

  const goNext = () => {
    if (next) navigate(`/salesman/customer/${next.customerId}`, { replace: true });
    else navigate('/salesman/route', { replace: true });
  };

  return (
    <div className="flex min-h-[78vh] flex-col">
      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="h-11 w-11" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-bold text-foreground">{t('salesman.invoiceSaved')}</h1>
          <p className="truncate text-sm text-muted-foreground">{invoice.customerName}</p>
        </div>

        <Card className="w-full space-y-2 p-4 text-sm">
          <Row label={t('salesman.invoiceNumber')}>
            <span className="font-bold tabular-nums">{invoice.number}</span>
          </Row>
          <Row label={t('salesman.totalAmount')}>
            <span className="font-bold tabular-nums">{formatCurrency(invoice.total)}</span>
          </Row>
          <Row label={t('salesman.paymentStatus')}>
            <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-semibold', PAY_TONE[invoice.paymentStatus])}>
              {t(`salesman.pay_${invoice.paymentStatus}`)}
            </span>
          </Row>
          {remaining > 0 && (
            <Row label={t('salesman.outstanding')}>
              <span className="font-bold tabular-nums text-destructive">{formatCurrency(remaining)}</span>
            </Row>
          )}
        </Card>
      </div>

      {/* Actions: primary = Go to Next Customer */}
      <div className="space-y-2.5">
        <ActionButton size="lg" className="h-14 w-full text-base" onClick={goNext}>
          {next ? t('salesman.goToNextCustomer') : t('salesman.allDone')}
          <NextArrow />
        </ActionButton>

        <div className="grid grid-cols-2 gap-2.5">
          <ActionButton
            variant="outline"
            className="h-12"
            feedback
            onClick={async () => {
              await new Promise((r) => setTimeout(r, 300));
              toast.success(t('salesman.printed'));
            }}
            loadingText={t('common.loading')}
          >
            <Printer />
            {t('salesman.printInvoice')}
          </ActionButton>
          <ActionButton
            variant="outline"
            className="h-12"
            onClick={() =>
              navigate(`/salesman/customer/${invoice.customerId}/collection`, { replace: true })
            }
          >
            <HandCoins />
            {t('salesman.collectPayment')}
          </ActionButton>
        </div>

        <ActionButton
          variant="ghost"
          className="h-11 w-full text-muted-foreground"
          onClick={() => navigate('/salesman/my-day', { replace: true })}
        >
          <Home />
          {t('salesman.backToMyDay')}
        </ActionButton>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
