import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Play,
  Plus,
  HandCoins,
  Undo2,
  Ban,
  History,
  Navigation,
  ArrowRight,
  ArrowLeft,
  type LucideIcon,
} from 'lucide-react';
import { ActionButton } from '@/components/salesman/ActionButton';
import { CustomerContextHeader } from '@/components/salesman/CustomerContextHeader';
import { cn } from '@/lib/utils';
import { useSalesmanDay, useCustomerView } from '@/stores/salesmanDayStore';
import { evaluateCredit } from '@/lib/salesman/credit';
import { nextStop } from '@/lib/salesman/selectors';

export function CustomerVisitPage() {
  const { customerId = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const isAr = i18n.language === 'ar';
  const NextArrow = isAr ? ArrowLeft : ArrowRight;

  const view = useCustomerView(customerId);
  const route = useSalesmanDay((s) => s.route);
  const startVisit = useSalesmanDay((s) => s.startVisit);
  const recordNoSale = useSalesmanDay((s) => s.recordNoSale);

  const stop = route.find((r) => r.customerId === customerId);
  const next = useMemo(
    () => nextStop(route.filter((r) => r.customerId !== customerId)),
    [route, customerId],
  );

  if (!view || !stop) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.noData')}</p>;
  }

  const ev = evaluateCredit({ ...view.credit, ...view.balance });
  const started = stop.status !== 'pending';

  const goNext = () => {
    if (next) navigate(`/salesman/customer/${next.customerId}`);
    else navigate('/salesman/route');
  };

  const navigateMaps = () => {
    const { lat, lng } = view.customer;
    if (lat != null && lng != null) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`, '_blank');
    } else {
      toast.error(t('common.noData'));
    }
  };

  return (
    <div className="space-y-4">
      <CustomerContextHeader view={view} visitStatus={stop.status} />

      {!started && (
        <ActionButton
          size="lg"
          className="h-14 w-full text-base"
          onClick={async () => {
            startVisit(customerId);
            await new Promise((r) => setTimeout(r, 150));
          }}
        >
          <Play />
          {t('salesman.startVisit')}
        </ActionButton>
      )}

      <section className="grid grid-cols-2 gap-2.5">
        <Tile
          icon={Plus}
          label={t('salesman.newSale')}
          tone="primary"
          disabled={!ev.canSell}
          onClick={() => navigate(`/salesman/customer/${customerId}/new-sale`)}
        />
        <Tile
          icon={HandCoins}
          label={t('salesman.collection')}
          onClick={() => navigate(`/salesman/customer/${customerId}/collection`)}
        />
        <Tile
          icon={Undo2}
          label={t('salesman.return')}
          onClick={() => navigate(`/salesman/customer/${customerId}/return`)}
        />
        <Tile
          icon={Ban}
          label={t('salesman.noSale')}
          onClick={() => {
            recordNoSale(customerId);
            toast(t('salesman.outcome_no_sale'));
            goNext();
          }}
        />
        <Tile icon={History} label={t('salesman.history')} onClick={() => navigate('/salesman/invoices')} />
        <Tile icon={Navigation} label={t('salesman.navigate')} onClick={navigateMaps} />
      </section>

      <ActionButton variant="outline" className="h-12 w-full" onClick={goNext}>
        {t('salesman.nextCustomer')}
        <NextArrow />
      </ActionButton>
    </div>
  );
}

function Tile({
  icon: Icon,
  label,
  onClick,
  disabled,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'primary';
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex h-20 flex-col items-center justify-center gap-1.5 rounded-xl border text-sm font-medium transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40',
        tone === 'primary'
          ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/15'
          : 'border-border bg-card text-foreground hover:bg-accent',
      )}
    >
      <Icon className="h-5 w-5 shrink-0" />
      <span className="w-full truncate px-2 text-center">{label}</span>
    </button>
  );
}
