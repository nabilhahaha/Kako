import { redirect } from 'next/navigation';
import { requireNonRetailAdmin } from '@/lib/erp/guards';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { getT } from '@/lib/i18n/server';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { GradeManager, type GradeData } from './grade-manager';

async function safe<T>(fn: () => Promise<T>, fb: T): Promise<T> { try { return await fn(); } catch { return fb; } }

export default async function OutletGradesPage() {
  await requireNonRetailAdmin();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!hasPermission(ctx, 'grade.manage')) redirect('/dashboard');

  const { t } = await getT();
  const supabase = await createClient();
  const [bands, factors] = await Promise.all([
    safe(async () => (await supabase.from('erp_outlet_grades').select('id, code, name, name_ar, min_score, rank, is_active').order('rank', { ascending: false })).data ?? [], [] as unknown[]),
    safe(async () => (await supabase.from('erp_outlet_grade_factors').select('factor, weight').order('factor', { ascending: true })).data ?? [], [] as unknown[]),
  ]);
  const data: GradeData = { bands: bands as GradeData['bands'], factors: factors as GradeData['factors'] };
  const ready = data.bands.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader title={t('retail.grade.title')} description={t('retail.grade.subtitle')} />
      {!ready && <Card><CardContent className="p-4 text-sm text-muted-foreground">{t('retail.grade.drift')}</CardContent></Card>}
      <GradeManager data={data} />
    </div>
  );
}
