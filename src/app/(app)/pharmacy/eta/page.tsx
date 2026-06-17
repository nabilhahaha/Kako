import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { getFeatureFlags } from '@/lib/erp/feature-flags';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { etaReadiness } from './actions';

export const dynamic = 'force-dynamic';

/** ETA e-invoicing activation readiness — a checklist of what's needed to switch on. */
export default async function PharmacyEtaPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const perms = ctx.permissions as string[];
  if (!(perms.includes('reports.view') || perms.includes('settings.users') || ctx.isSuperAdmin)) redirect('/dashboard');

  const supabase = await createClient();
  const flags = await getFeatureFlags(supabase, ctx.companyId);
  if (flags['pharmacy.eta_einvoicing'] !== true) redirect('/pharmacy/dashboard');

  const r = await etaReadiness();
  if (!r) redirect('/pharmacy/dashboard');
  const pct = r.requiredTotal > 0 ? Math.round((r.requiredMet / r.requiredTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      <PageHeader title={t('pharmEta.title')} description={t('pharmEta.description')} />

      <Card><CardContent className="flex flex-wrap items-center gap-4 pt-6">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{t('pharmEta.readiness')}</div>
          <div className="flex items-center gap-2 text-2xl font-bold">
            {pct}%
            {r.ready ? <Badge variant="success">{t('pharmEta.ready')}</Badge> : <Badge variant="secondary">{t('pharmEta.notReady')}</Badge>}
          </div>
          <div className="mt-2 h-2 w-full max-w-md overflow-hidden rounded-full bg-secondary">
            <div className={`h-full ${r.ready ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('pharmEta.metOf', { met: r.requiredMet, total: r.requiredTotal })}</p>
        </div>
        <Link href="/settings/einvoice" className={buttonVariants({ variant: 'outline' })}>{t('pharmEta.configure')}</Link>
      </CardContent></Card>

      <Card><CardContent className="divide-y p-0">
        {r.checks.map((c) => (
          <div key={c.key} className="flex items-start gap-3 p-3">
            {c.ok
              ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
              : c.level === 'required'
                ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                : <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {t(`pharmEta.check.${c.key}`)}
                {c.level === 'recommended' && <Badge variant="outline" className="text-[10px]">{t('pharmEta.recommended')}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground">{t(`pharmEta.hint.${c.key}`)}{c.detail ? ` · ${c.detail}` : ''}</p>
            </div>
          </div>
        ))}
      </CardContent></Card>

      {r.enabled && !r.ready && (
        <p className="text-sm text-amber-600">{t('pharmEta.enabledButIncomplete')}</p>
      )}
    </div>
  );
}
