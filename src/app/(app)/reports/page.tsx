import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, MapPin, Undo2, Target, Truck, CreditCard, Tags, ArrowRight, type LucideIcon } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';

// Reports Center — a single hub linking the (previously scattered) report
// screens, grouped logically. Each destination enforces its own RLS/permissions.

interface ReportLink { label: string; desc: string; href: string; icon: LucideIcon }

export default async function ReportsCenterPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const groups: { title: string; reports: ReportLink[] }[] = [
    {
      title: t('home.grpSalesCollection'),
      reports: [
        { label: t('nav.items.salesSummary'), desc: t('home.descSalesSummary'), href: '/distribution/sales-summary', icon: BarChart3 },
        { label: t('nav.items.priceBook'), desc: t('home.descPriceBook'), href: '/sales/price-book', icon: Tags },
        { label: t('nav.items.creditRequests'), desc: t('home.descCreditRequests'), href: '/distribution/credit-requests', icon: CreditCard },
      ],
    },
    {
      title: t('home.grpFieldRoute'),
      reports: [
        { label: t('nav.items.journeyCompliance'), desc: t('home.descJourneyCompliance'), href: '/distribution/journey-compliance', icon: MapPin },
        { label: t('nav.items.returnsAnalysis'), desc: t('home.descReturnsAnalysis'), href: '/distribution/returns-analysis', icon: Undo2 },
        { label: t('nav.items.targetsAchievement'), desc: t('home.descTargets'), href: '/distribution/targets-achievement', icon: Target },
        { label: t('nav.items.vanReconciliation'), desc: t('home.descVanRecon'), href: '/field/van-reconciliation', icon: Truck },
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('home.reportsTitle')} description={t('home.reportsSubtitle')} />
      {groups.map((g, gi) => (
        <section key={gi} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{g.title}</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {g.reports.map((r, i) => {
              const Icon = r.icon;
              return (
                <Link key={i} href={r.href}>
                  <Card className="h-full transition-colors hover:border-primary/40">
                    <CardContent className="flex items-start gap-3 p-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 text-sm font-semibold">
                          {r.label}
                          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground rtl:rotate-180" />
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{r.desc}</p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
