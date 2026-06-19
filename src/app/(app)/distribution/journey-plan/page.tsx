import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { getT } from '@/lib/i18n/server';
import { DEFAULT_FREQUENCY_RULES } from '@/lib/route-optimization/frequency';
import type { Profile } from '@/lib/erp/types';
import { JourneyPlanGenerator } from './journey-plan-generator';

/**
 * CJ-1 — Journey-Plan generation wizard. Reuses the route-optimization generator
 * + frequency engine + outlet grades to propose a weekly plan per route, with
 * conflict detection, and company-configurable visit-frequency rules. No new
 * business logic; writes the existing erp_journey_plans.
 */
export default async function JourneyPlanPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const { t } = await getT();

  const supabase = await createClient();
  const [{ data: routes }, { data: reps }, { data: ruleRows }] = await Promise.all([
    supabase.from('erp_routes').select('id, name, name_ar, rep_id').eq('is_active', true).order('name'),
    supabase.rpc('erp_assignable_reps'),
    supabase.from('erp_visit_frequency_rules').select('classification, visits_per_week').eq('is_active', true),
  ]);

  const configured = ((ruleRows as { classification: string; visits_per_week: number }[] | null) ?? [])
    .map((r) => ({ classification: r.classification, visitsPerWeek: Number(r.visits_per_week) }));
  const rules = configured.length > 0 ? configured : DEFAULT_FREQUENCY_RULES.map((r) => ({ ...r }));

  return (
    <div>
      <PageHeader title={t('journeyPlan.title')} description={t('journeyPlan.description')} />
      <JourneyPlanGenerator
        routes={(routes as { id: string; name: string; name_ar: string | null; rep_id: string | null }[]) ?? []}
        reps={(reps as Pick<Profile, 'id' | 'full_name' | 'email'>[]) ?? []}
        initialRules={rules}
      />
    </div>
  );
}
