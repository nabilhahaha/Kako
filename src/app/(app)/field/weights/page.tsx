import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { WeightsForm } from './weights-form';

const COMPONENTS = ['coverage', 'compliance', 'merchandising', 'oos', 'survey', 'opportunity'] as const;
type State = 'required' | 'optional' | 'disabled';

/** FE-5c — no-code weighted-scoring config. Company admins tune each component's
 *  weight + state; the resolver prefers these over the industry-pack default. */
export default async function WeightsPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  if (!ctx.company?.id || !ctx.modules.includes('field_ops') || !isAdmin) {
    return <div><PageHeader title={t('field.weights.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('field.weights.noAccess')}</CardContent></Card></div>;
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc('erp_fe_company_weights');
  const cfg = (data as { weights: Record<string, number>; states: Record<string, State>; custom: boolean } | null) ?? { weights: {}, states: {}, custom: false };
  const rows = COMPONENTS.map((c) => ({ component: c, weight: Number(cfg.weights[c] ?? 1), state: (cfg.states[c] ?? 'optional') as State }));

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <BackLink href="/field/dashboard" label={t('field.perf.back')} />
      <PageHeader title={t('field.weights.title')} description={t('field.weights.description')} />
      <WeightsForm initialRows={rows} custom={cfg.custom} />
    </div>
  );
}
