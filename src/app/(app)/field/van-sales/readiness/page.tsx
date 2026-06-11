import { redirect } from 'next/navigation';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { getT } from '@/lib/i18n/server';
import { hasPermission } from '@/lib/erp/permissions';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { gatherPilotReadiness } from '@/lib/van-sales/pilot-readiness-server';
import type { CheckStatus } from '@/lib/van-sales/pilot-readiness';

export const dynamic = 'force-dynamic';

// FMCG Pilot Readiness — admin diagnostic. Read-only: auto-runs the pilot
// Go/No-Go controls (Van Sales active, vans assigned + stocked, every SKU
// positively priced, single base UoM, approved customers, return reasons, sane
// policy) for the caller's company. Gated to admins (settings.branches) — NOT to
// the Van Sales flag, so it can report when the flag/toggle is the blocker.
export default async function VanSalesReadinessPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'settings.branches') && !ctx.isSuperAdmin) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const report = await gatherPilotReadiness(supabase, ctx);

  const icon = (s: CheckStatus) =>
    s === 'pass' ? <CheckCircle2 className="h-5 w-5 text-success" />
      : s === 'fail' ? <XCircle className="h-5 w-5 text-destructive" />
        : <AlertTriangle className="h-5 w-5 text-warning" />;
  const tone = (s: CheckStatus) => (s === 'pass' ? 'success' : s === 'fail' ? 'destructive' : 'warning');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title={t('vanSales.readiness.title')} description={t('vanSales.readiness.subtitle')} />

      {/* Summary banner */}
      <Card className={report.ready ? 'border-success/40' : 'border-destructive/40'}>
        <CardContent className="flex items-start gap-3 pt-6">
          {report.ready ? <CheckCircle2 className="h-7 w-7 shrink-0 text-success" /> : <XCircle className="h-7 w-7 shrink-0 text-destructive" />}
          <div>
            <div className="text-lg font-bold">
              {report.ready ? t('vanSales.readiness.ready') : t('vanSales.readiness.notReady', { count: report.blockingFailures })}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {report.ready ? t('vanSales.readiness.readyDesc') : t('vanSales.readiness.notReadyDesc')}
              {report.warnings > 0 && <> · {t('vanSales.readiness.warnings', { count: report.warnings })}</>}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Checks */}
      <ul className="space-y-2">
        {report.checks.map((c) => (
          <li key={c.key}>
            <Card>
              <CardContent className="flex items-start gap-3 p-4">
                <span className="mt-0.5 shrink-0">{icon(c.status)}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.label}</span>
                    <Badge variant={tone(c.status)}>{t(`vanSales.readiness.${c.status}`)}</Badge>
                    {c.blocking && c.status === 'fail' && <Badge variant="outline">{t('vanSales.readiness.blocking')}</Badge>}
                  </div>
                  {c.detail && <p className="mt-1 text-sm text-muted-foreground" dir="auto">{c.detail}</p>}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      <p className="text-xs text-muted-foreground">{t('vanSales.readiness.runbookNote')}</p>
    </div>
  );
}
