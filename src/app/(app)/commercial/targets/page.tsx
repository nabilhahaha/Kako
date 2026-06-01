import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { TargetsClient, type Target } from './targets-client';

function firstOfMonth(d?: string) { const x = d ? new Date(d) : new Date(); return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-01`; }

/** CP-6 — target management: manual entry, CSV import (validated) / export, lifecycle. */
export default async function TargetsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('commercial.targetsTitle')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('commercial.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const month = firstOfMonth(sp.month);
  const supabase = await createClient();
  let targets: Target[] = [];
  try { targets = ((await supabase.rpc('erp_cp_targets_list', { p_period: month })).data as Target[]) ?? []; } catch { /* */ }

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <BackLink href="/commercial" label={t('commercial.back')} />
      <PageHeader title={t('commercial.targetsTitle')} />
      <TargetsClient month={month} initial={targets} />
    </div>
  );
}
