import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { SurveyBuilder, type SurveyRow } from './survey-builder';

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function SurveysPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'survey.manage')) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const surveys = await safe(async () =>
    (await supabase.from('erp_surveys').select('id, name, name_ar, description, questions, is_active').order('created_at', { ascending: false })).data ?? [],
  [] as unknown[]);

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.survey.title')} description={t('retail.survey.subtitle')} />
      <SurveyBuilder surveys={surveys as SurveyRow[]} />
    </div>
  );
}
