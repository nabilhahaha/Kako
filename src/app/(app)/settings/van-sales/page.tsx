import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';
import { loadVanSalesSettings, DEFAULT_VAN_SALES_SETTINGS } from '@/lib/van-sales/settings-server';
import { VanSalesAdminForm } from './admin-form';

export const dynamic = 'force-dynamic';

// Van Sales — admin enablement + policy (company admin). Master toggle + safe
// policy, with pointers to the engines that configure the approval chain,
// variance review and overdue behavior. Gated by the platform flag + settings.branches.
export default async function VanSalesAdminPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!VAN_SALES_ENABLED()) notFound();
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const settings = ctx.companyId ? await loadVanSalesSettings(supabase, ctx.companyId) : DEFAULT_VAN_SALES_SETTINGS;

  const sections: { title: string; desc: string; href?: string }[] = [
    { title: t('vanSales.admin.sectionConfirmation'), desc: t('vanSales.admin.sectionConfirmationDesc') },
    { title: t('vanSales.admin.sectionApproval'), desc: t('vanSales.admin.sectionApprovalDesc'), href: '/settings/workflows' },
    { title: t('vanSales.admin.sectionVariance'), desc: t('vanSales.admin.sectionVarianceDesc'), href: '/settings/workflows' },
    { title: t('vanSales.admin.sectionOverdue'), desc: t('vanSales.admin.sectionOverdueDesc') },
    { title: t('vanSales.admin.sectionPrinting'), desc: t('vanSales.admin.sectionPrintingDesc') },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.admin.title')} description={t('vanSales.admin.subtitle')} />
      <VanSalesAdminForm initial={settings} />
      <div className="space-y-2">
        {sections.map((s) => {
          const body = (
            <CardContent className="flex items-center justify-between gap-3 pt-6">
              <div>
                <div className="text-sm font-medium">{s.title}</div>
                <div className="text-xs text-muted-foreground">{s.desc}</div>
              </div>
              {s.href && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />}
            </CardContent>
          );
          return s.href ? (
            <Link key={s.title} href={s.href} className="block"><Card className="transition-colors hover:bg-secondary/50">{body}</Card></Link>
          ) : (
            <Card key={s.title}>{body}</Card>
          );
        })}
      </div>
    </div>
  );
}
