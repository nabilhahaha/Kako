import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { CustomerContextHeader } from '@/components/salesman/CustomerContextHeader';
import { formatCurrency } from '@/lib/utils';
import { useSalesmanDay, useCustomerView } from '@/stores/salesmanDayStore';
import { nextStop } from '@/lib/salesman/selectors';
import type { PaymentMethod } from '@/lib/salesman/types';

export function CollectionPage() {
  const { customerId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const NextArrow = isAr ? ArrowLeft : ArrowRight;

  const view = useCustomerView(customerId);
  const route = useSalesmanDay((s) => s.route);
  const recordCollection = useSalesmanDay((s) => s.recordCollection);

  const stop = route.find((r) => r.customerId === customerId);
  const outstanding = view?.balance.outstandingBalance ?? 0;

  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reference, setReference] = useState('');

  const next = useMemo(
    () => nextStop(route.filter((r) => r.customerId !== customerId)),
    [route, customerId],
  );

  if (!view || !stop) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
  }

  const valid = amount > 0;

  const confirm = async () => {
    recordCollection(customerId, amount, method, reference.trim() || null);
    await new Promise((r) => setTimeout(r, 200));
    toast.success(t('salesman.collectionSaved'));
    if (next) navigate(`/salesman/customer/${next.customerId}`, { replace: true });
    else navigate('/salesman/route', { replace: true });
  };

  return (
    <div className="space-y-4">
      <CustomerContextHeader view={view} visitStatus={stop.status} />

      <Card className="space-y-3 p-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('salesman.amountToCollect')}</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              min={0}
              value={amount || ''}
              onChange={(e) => setAmount(Math.max(0, Number(e.target.value) || 0))}
              placeholder="0"
              className="h-12 w-full rounded-lg border border-input bg-background px-3 text-lg font-bold tabular-nums outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Quick label={formatCurrency(outstanding)} onClick={() => setAmount(outstanding)} disabled={outstanding <= 0} />
            <Quick label={formatCurrency(Math.round(outstanding / 2))} onClick={() => setAmount(Math.round(outstanding / 2))} disabled={outstanding <= 0} />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground">{t('salesman.paymentMethod')}</label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(['cash', 'cheque', 'transfer'] as PaymentMethod[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMethod(m)}
                className={`h-10 rounded-lg border text-sm font-medium transition-colors active:scale-95 ${
                  method === m
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-input text-muted-foreground'
                }`}
              >
                {t(`salesman.method_${m}`)}
              </button>
            ))}
          </div>
        </div>

        {method !== 'cash' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">{t('salesman.reference')}</label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring/40"
            />
          </div>
        )}
      </Card>

      <ActionButton
        size="lg"
        className="h-14 w-full text-base"
        disabled={!valid}
        loadingText={t('common.loading')}
        onClick={confirm}
      >
        {t('salesman.confirmCollection')}
        {valid ? ` · ${formatCurrency(amount)}` : ''}
      </ActionButton>

      <ActionButton
        variant="ghost"
        className="h-11 w-full text-muted-foreground"
        onClick={() => {
          if (next) navigate(`/salesman/customer/${next.customerId}`);
          else navigate('/salesman/route');
        }}
      >
        {t('salesman.nextCustomer')}
        <NextArrow />
      </ActionButton>
    </div>
  );
}

function Quick({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-full border border-input px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground active:scale-95 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
