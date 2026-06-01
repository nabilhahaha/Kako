import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { PromotionsClient, type Promotion } from './promotions-client';

interface Summary { active: number; upcoming: number; expired: number; budget: number; cost: number; actual_sales: number }

/** TPM-2 — mobile-first promotion dashboard + list (scope-aware). */
export default async function PromotionsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.company?.id || !ctx.modules.includes('field_ops')) {
    return <div><PageHeader title={t('commercial.tpm.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('commercial.tpm.noAccess')}</CardContent></Card></div>;
  }
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  const supabase = await createClient();
  const [list, summary] = await Promise.all([
    supabase.rpc('erp_tpm_promotions_list'),
    supabase.rpc('erp_tpm_summary'),
  ]);
  const s = (summary.data as Summary) ?? { active: 0, upcoming: 0, expired: 0, budget: 0, cost: 0, actual_sales: 0 };
  const n = (x: number) => Number(x).toLocaleString();

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <BackLink href="/commercial" label={t('commercial.tpm.back')} />
      <PageHeader title={t('commercial.tpm.title')} />
      <div className="grid grid-cols-3 gap-2">
        <Kpi label={t('commercial.tpm.cards.active')} value={n(s.active)} />
        <Kpi label={t('commercial.tpm.cards.upcoming')} value={n(s.upcoming)} />
        <Kpi label={t('commercial.tpm.cards.expired')} value={n(s.expired)} />
        <Kpi label={t('commercial.tpm.cards.budget')} value={n(s.budget)} />
        <Kpi label={t('commercial.tpm.cards.actualSales')} value={n(s.actual_sales)} />
        <Kpi label={t('commercial.tpm.cards.cost')} value={n(s.cost)} />
      </div>
      <PromotionsClient promotions={(list.data as Promotion[]) ?? []} isAdmin={isAdmin} />
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return <Card><CardContent className="p-2.5 text-center"><div className="text-lg font-semibold tabular-nums">{value}</div><div className="text-[10px] text-muted-foreground">{label}</div></CardContent></Card>;
}
