import { redirect } from 'next/navigation';
import { Wallet, AlertTriangle, Receipt, FileText, Boxes, User } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { formatCurrency } from '@/lib/utils';
import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { BackLink } from '@/components/shared/back-link';
import { ActivityTimeline } from '@/components/home/activity-timeline';
import { QuickNav, type QuickLink } from '@/components/home/home-widgets';
import { customerActivity } from '@/app/(app)/home-actions';

// Customer 360 — a record overview + unified activity timeline (invoices +
// payments), RLS-scoped. Additive sub-route of the customer detail page.

export default async function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { id } = await params;
  const { t } = await getT();

  const res = await customerActivity(id);
  if (!res.ok || !res.data) redirect(`/customers/${id}`);
  const data = res.data;

  return (
    <div className="space-y-6">
      <BackLink href={`/customers/${id}`} label={t('home.back')} />
      <PageHeader title={data.name} description={t('home.c360Subtitle')} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('home.balance')} value={formatCurrency(data.balance)} icon={Wallet} tone={data.balance > 0 ? 'warning' : 'success'} />
        <StatCard label={t('home.overdue')} value={String(data.overdue)} icon={AlertTriangle} tone={data.overdue > 0 ? 'destructive' : 'success'} />
        <StatCard label={t('home.invoices')} value={String(data.invoiceCount)} icon={Receipt} tone="info" />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('salesman.actions')}</h2>
        <QuickNav links={[
          { label: t('salesman.actNewInvoice'), href: '/sales/invoices', icon: Receipt },
          { label: t('salesman.actPrintStatement'), href: `/customers/${id}/statement/print`, icon: FileText },
          { label: t('salesman.actStock'), href: '/inventory', icon: Boxes },
          { label: t('salesman.actCustomer'), href: `/customers/${id}`, icon: User },
        ] satisfies QuickLink[]} />
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('home.activity')}</h2>
        <ActivityTimeline events={data.timeline} emptyTitle={t('home.noActivity')} />
      </section>
    </div>
  );
}
