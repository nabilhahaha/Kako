import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { GovernanceClient, type Change } from './governance-client';

const STATES = ['draft', 'review', 'approved', 'published', 'rolled_back'] as const;

/** CG-2 — mobile-first governance console: change dashboard + authoring. */
export default async function GovernancePage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  if (!ctx.company?.id || !isAdmin) {
    return <div><PageHeader title={t('governance.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('governance.noAccess')}</CardContent></Card></div>;
  }
  const sp = await searchParams;
  const supabase = await createClient();
  const all = ((await supabase.rpc('erp_cfg_changes_list')).data as Change[]) ?? [];
  const counts = Object.fromEntries(STATES.map((s) => [s, all.filter((c) => c.state === s).length]));
  const filtered = sp.state ? all.filter((c) => c.state === sp.state) : all;

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <PageHeader title={t('governance.title')} />
      <div className="grid grid-cols-5 gap-1.5">
        {STATES.map((s) => <Kpi key={s} label={t(`governance.cards.${s}`)} value={counts[s] ?? 0} />)}
      </div>
      <GovernanceClient changes={filtered} activeState={sp.state ?? null} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-2 text-center"><div className="text-lg font-semibold tabular-nums">{value}</div><div className="text-[9px] leading-tight text-muted-foreground">{label}</div></CardContent></Card>;
}
