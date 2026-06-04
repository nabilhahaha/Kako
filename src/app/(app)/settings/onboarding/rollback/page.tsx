import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Undo2 } from 'lucide-react';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { getEntity } from '@/lib/erp/entities';
import { buildRollbackList, type RollbackJobLike } from '@/lib/erp/import-rollback';
import { RollbackList, type RollbackItem } from './rollback-list';

// Import Rollback View — undo a whole import by deleting rows stamped with its
// import_job_id. Only reversible for entities that record import_job_id. No new
// tables; the action records a marker in erp_import_jobs.error_log.

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function RollbackPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'integrations.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const jobs = await safe(async () => {
    const { data } = await supabase
      .from('erp_import_jobs')
      .select('id, target_entity, file_name, status, total_rows, success_rows, created_at, error_log')
      .order('created_at', { ascending: false })
      .limit(100);
    return (data ?? []) as RollbackJobLike[];
  }, []);

  const rows = buildRollbackList(jobs);
  const label = (key: string) => {
    const e = getEntity(key);
    return e ? (locale === 'ar' ? e.labelAr : e.labelEn) : key || '—';
  };
  const items: RollbackItem[] = rows.map((r) => ({ ...r, entityLabel: label(r.entityKey) }));

  return (
    <div className="space-y-6">
      <Link href="/settings/onboarding" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t('onboarding.title')}
      </Link>
      <PageHeader title={t('onboarding.rollback.title')} description={t('onboarding.rollback.subtitle')} />

      <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning">
        <Undo2 className="me-1 inline h-4 w-4" /> {t('onboarding.rollback.intro')}
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('onboarding.rollback.empty')}</CardContent></Card>
      ) : (
        <RollbackList items={items} />
      )}
    </div>
  );
}
