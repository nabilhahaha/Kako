import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  UserRound,
  Route as RouteIcon,
  Plus,
  HandCoins,
  Undo2,
  Boxes,
  ReceiptText,
  LogOut,
  Sunrise,
  CheckCircle2,
  Target,
  Clock,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';
import { dayStats, nextStop } from '@/lib/salesman/selectors';

export function MyDayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const status = useSalesmanDay((s) => s.status);
  const openDay = useSalesmanDay((s) => s.openDay);
  const route = useSalesmanDay((s) => s.route);
  const invoices = useSalesmanDay((s) => s.invoices);
  const collections = useSalesmanDay((s) => s.collections);

  const stats = useMemo(
    () => dayStats(route, invoices, collections),
    [route, invoices, collections],
  );
  const next = useMemo(() => nextStop(route), [route]);

  const goNext = () => {
    if (next) navigate(`/salesman/customer/${next.customerId}`);
    else navigate('/salesman/route');
  };

  if (status === 'closed') {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Sunrise className="h-10 w-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{t('salesman.myDay')}</h1>
          <p className="text-sm text-muted-foreground">{t('salesman.dayClosed')}</p>
        </div>
        <ActionButton
          size="lg"
          className="h-14 w-full max-w-xs text-base"
          loadingText={t('common.loading')}
          onClick={async () => {
            openDay();
            await new Promise((r) => setTimeout(r, 250));
            navigate('/salesman/route');
          }}
        >
          {t('salesman.openDay')}
        </ActionButton>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <section className="grid grid-cols-2 gap-2.5">
        <Kpi icon={RouteIcon} tone="info" label={t('salesman.planned')} value={formatNumber(stats.planned)} />
        <Kpi icon={CheckCircle2} tone="success" label={t('salesman.visited')} value={formatNumber(stats.visited)} />
        <Kpi icon={Clock} tone="warning" label={t('salesman.remaining')} value={formatNumber(stats.remaining)} />
        <Kpi icon={Target} tone="info" label={t('salesman.productiveCalls')} value={formatNumber(stats.productive)} />
        <Kpi icon={TrendingUp} tone="success" label={t('salesman.salesTotal')} value={formatCurrency(stats.salesTotal)} />
        <Kpi icon={Wallet} tone="default" label={t('salesman.collectionTotal')} value={formatCurrency(stats.collectionTotal)} />
      </section>

      {/* Primary action */}
      <ActionButton
        size="lg"
        className="h-14 w-full text-base"
        disabled={!next}
        onClick={goNext}
      >
        <RouteIcon />
        {next ? t('salesman.nextCustomer') : t('salesman.allDone')}
      </ActionButton>

      {/* Action grid */}
      <section className="grid grid-cols-2 gap-2.5">
        <Action icon={UserRound} label={t('salesman.customers')} onClick={() => navigate('/salesman/route')} />
        <Action
          icon={Plus}
          label={t('salesman.newSale')}
          tone="primary"
          disabled={!next}
          onClick={() => next && navigate(`/salesman/customer/${next.customerId}/new-sale`)}
        />
        <Action
          icon={HandCoins}
          label={t('salesman.collection')}
          disabled={!next}
          onClick={() => next && navigate(`/salesman/customer/${next.customerId}/collection`)}
        />
        <Action
          icon={Undo2}
          label={t('salesman.returns')}
          disabled={!next}
          onClick={() => next && navigate(`/salesman/customer/${next.customerId}/return`)}
        />
        <Action icon={Boxes} label={t('salesman.vanStock')} onClick={() => navigate('/salesman/van-stock')} />
        <Action icon={ReceiptText} label={t('salesman.invoices')} onClick={() => navigate('/salesman/invoices')} />
      </section>

      <ActionButton variant="outline" className="h-12 w-full" onClick={() => navigate('/salesman/end-day')}>
        <LogOut />
        {t('salesman.endDay')}
      </ActionButton>
    </div>
  );
}

const TONE: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  info: 'bg-info/10 text-info',
};

function Kpi({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: keyof typeof TONE;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold tabular-nums text-foreground">{value}</p>
      </div>
    </Card>
  );
}

function Action({
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
