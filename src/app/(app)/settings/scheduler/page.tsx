import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getT } from '@/lib/i18n/server';
import { SchedulerClient, type Job } from './scheduler-client';

/** PR-2 — scheduler health dashboard (admin). */
export default async function SchedulerPage() {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const isAdmin = ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin';
  if (!ctx.company?.id || !isAdmin) {
    return <div><PageHeader title={t('scheduler.title')} /><Card><CardContent className="p-8 text-center text-muted-foreground">{t('scheduler.noAccess')}</CardContent></Card></div>;
  }
  const supabase = await createClient();
  const jobs = ((await supabase.rpc('erp_sched_jobs_list')).data as Job[]) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-3 pb-10">
      <PageHeader title={t('scheduler.title')} />
      <SchedulerClient jobs={jobs} />
    </div>
  );
}
