import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { SurveyForm, type ExecSurvey } from './survey-form';

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function FieldSurveyPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'survey.manage')) redirect('/dashboard');

  const { t, locale } = await getT();
  const supabase = await createClient();

  const [surveys, customer] = await Promise.all([
    safe(async () => (await supabase.from('erp_surveys').select('id, name, name_ar, questions').eq('is_active', true).order('name', { ascending: true })).data ?? [], [] as unknown[]),
    safe(async () => (await supabase.from('erp_customers').select('name, name_ar').eq('id', customerId).maybeSingle()).data as { name: string; name_ar: string | null } | null, null),
  ]);
  const customerName = customer ? (locale === 'ar' && customer.name_ar ? customer.name_ar : customer.name) : customerId.slice(0, 8);

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.survey.execTitle')} description={customerName} />
      {(surveys as unknown[]).length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('retail.survey.noActive')}</CardContent></Card>
      ) : (
        <SurveyForm customerId={customerId} surveys={surveys as ExecSurvey[]} offlineEnabled={MOBILE_ENABLED()} />
      )}
    </div>
  );
}
