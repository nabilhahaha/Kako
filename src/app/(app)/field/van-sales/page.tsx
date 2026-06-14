import Link from 'next/link';
import { redirect, notFound } from 'next/navigation';
import {
  Truck, MapPin, Map as MapIcon, ShoppingCart, Undo2, HandCoins, Boxes, ClipboardCheck, ClipboardList, RefreshCw, Play, CheckCircle2, Users, type LucideIcon,
} from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { VAN_SALES_ENABLED } from '@/lib/van-sales';
import { loadVanDayState } from '@/lib/van-sales/day-server';

export const dynamic = 'force-dynamic';

// Van Sales — the salesman's "My Day" shell (Phase A). Flag-gated KAKO_VAN_SALES.
// Ties the mobile spine together over the EXISTING field routes; the day status
// comes from the work session (read-only). Sell/Collect/Confirm-Load/Reconcile
// land in later phases and show a "Coming soon" chip until then.

interface SpineStep {
  key: 'customer' | 'confirmLoad' | 'journey' | 'route' | 'sell' | 'return' | 'collect' | 'stock' | 'reconcile' | 'merchandising' | 'offline';
  icon: LucideIcon;
  href?: string; // omit = coming soon (hidden from the salesman — F5)
}

const STEPS: SpineStep[] = [
  // F1: customer-first entry — pick a customer once, then Statement/Collect/Sell/Return.
  { key: 'customer', icon: Users, href: '/field/van-sales/customers' },
  { key: 'confirmLoad', icon: Truck },                         // Phase B (no href ⇒ hidden)
  { key: 'journey', icon: MapPin, href: '/field/journey' },
  { key: 'route', icon: MapIcon, href: '/field/route' },
  { key: 'sell', icon: ShoppingCart, href: '/field/van-sales/sell' },
  { key: 'return', icon: Undo2, href: '/field/van-sales/return' },
  { key: 'collect', icon: HandCoins, href: '/field/van-sales/collect' },
  { key: 'stock', icon: Boxes, href: '/field/stock' },
  { key: 'reconcile', icon: ClipboardCheck, href: '/field/van-reconciliation' },
  { key: 'merchandising', icon: ClipboardList, href: '/field/survey' },
  { key: 'offline', icon: RefreshCw, href: '/field/offline' },
];

export default async function VanSalesMyDayPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!VAN_SALES_ENABLED()) notFound();
  const isSalesman = hasPermission(ctx, 'field.sales') || ctx.memberships.some((m) => m.role === 'salesman');
  if (!isSalesman && !ctx.isSuperAdmin) redirect('/dashboard');
  const isAdmin = hasPermission(ctx, 'settings.branches') || ctx.isSuperAdmin;

  const { t } = await getT();
  const { state } = await loadVanDayState(ctx);

  const tone = state === 'open' ? 'success' : state === 'closed' ? 'secondary' : 'outline';

  return (
    <div className="space-y-6">
      <PageHeader title={t('vanSales.myDayTitle')} description={t('vanSales.myDaySubtitle')} />

      {/* Day status + primary CTA */}
      <Card>
        <CardContent className="flex items-center justify-between gap-3 pt-6">
          <Badge variant={tone}>{t(`vanSales.state.${state}`)}</Badge>
          {state === 'not_started' && (
            <Link href="/today" className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Play className="h-4 w-4" /> {t('vanSales.start')}
            </Link>
          )}
          {state === 'open' && (
            <Link href="/field/van-reconciliation" className="inline-flex h-10 items-center gap-2 rounded-md border border-input px-4 text-sm font-medium hover:bg-secondary">
              <CheckCircle2 className="h-4 w-4" /> {t('vanSales.endDaySettle')}
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Spine — only actionable tiles (F5: coming-soon tiles without an href are
          hidden from the salesman). Customer-first tile leads the daily flow. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {STEPS.filter((s) => s.href).map((s) => {
          const Icon = s.icon;
          return (
            <Link key={s.key} href={s.href!} className="block">
              <Card className="h-full transition-colors hover:bg-secondary/50">
                <CardContent className="flex h-full flex-col items-start gap-2 pt-6">
                  <Icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{t(`vanSales.steps.${s.key}`)}</span>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Admin: pilot readiness diagnostic */}
      {isAdmin && (
        <Link href="/field/van-sales/readiness" className="block">
          <Card className="transition-colors hover:bg-secondary/50">
            <CardContent className="flex items-center gap-3 py-4">
              <ClipboardCheck className="h-5 w-5 text-primary" />
              <div>
                <div className="text-sm font-medium">{t('vanSales.readiness.title')}</div>
                <div className="text-xs text-muted-foreground">{t('vanSales.readiness.subtitle')}</div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}
    </div>
  );
}
