import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ReceiptText,
  TrendingUp,
  Wallet,
  CheckCircle2,
  PartyPopper,
  type LucideIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ActionButton } from '@/components/salesman/ActionButton';
import { cn, formatCurrency, formatNumber } from '@/lib/utils';
import { useSalesmanDay } from '@/stores/salesmanDayStore';
import { dayStats } from '@/lib/salesman/selectors';

export function EndDayPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const status = useSalesmanDay((s) => s.status);
  const route = useSalesmanDay((s) => s.route);
  const invoices = useSalesmanDay((s) => s.invoices);
  const collections = useSalesmanDay((s) => s.collections);
  const endDay = useSalesmanDay((s) => s.endDay);

  const stats = useMemo(
    () => dayStats(route, invoices, collections),
    [route, invoices, collections],
  );
  const saleInvoices = invoices.filter((i) => i.type === 'sale').length;

  if (status === 'ended') {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-success/15 text-success">
          <PartyPopper className="h-10 w-10" />
        </div>
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{t('salesman.dayEnded')}</h1>
          <p className="text-sm text-muted-foreground">{t('salesman.dayClosedMsg')}</p>
        </div>
        <Card className="w-full space-y-2 p-4 text-sm">
          <Summary label={t('salesman.totalSales')} value={formatCurrency(stats.salesTotal)} />
          <Summary label={t('salesman.totalCollected')} value={formatCurrency(stats.collectionTotal)} />
          <Summary label={t('salesman.visitsDone')} value={`${formatNumber(stats.visited)}/${formatNumber(stats.planned)}`} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">{t('salesman.endDayTitle')}</h1>

      <section className="grid grid-cols-2 gap-2.5">
        <Tile icon={CheckCircle2} tone="success" label={t('salesman.visitsDone')} value={`${stats.visited}/${stats.planned}`} />
        <Tile icon={ReceiptText} tone="info" label={t('salesman.totalInvoices')} value={formatNumber(saleInvoices)} />
        <Tile icon={TrendingUp} tone="success" label={t('salesman.totalSales')} value={formatCurrency(stats.salesTotal)} />
        <Tile icon={Wallet} tone="default" label={t('salesman.totalCollected')} value={formatCurrency(stats.collectionTotal)} />
      </section>

      {stats.remaining > 0 && (
        <p className="rounded-lg bg-warning/10 px-3 py-2 text-center text-xs font-medium text-warning">
          {t('salesman.remaining')}: {formatNumber(stats.remaining)}
        </p>
      )}

      <ActionButton
        size="lg"
        variant="destructive"
        className="h-14 w-full text-base"
        loadingText={t('common.loading')}
        onClick={async () => {
          if (!window.confirm(t('salesman.confirmEndDay'))) return;
          endDay();
          await new Promise((r) => setTimeout(r, 250));
        }}
      >
        {t('salesman.endDayConfirm')}
      </ActionButton>

      <ActionButton variant="ghost" className="h-11 w-full text-muted-foreground" onClick={() => navigate('/salesman/my-day')}>
        {t('salesman.backToMyDay')}
      </ActionButton>
    </div>
  );
}

const TONE: Record<string, string> = {
  default: 'bg-muted text-muted-foreground',
  success: 'bg-success/10 text-success',
  info: 'bg-info/10 text-info',
};

function Tile({ icon: Icon, label, value, tone = 'default' }: { icon: LucideIcon; label: string; value: string; tone?: keyof typeof TONE }) {
  return (
    <Card className="flex items-center gap-3 p-3">
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TONE[tone])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
