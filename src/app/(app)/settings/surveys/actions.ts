'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { scoreSurvey, validateSurvey, type SurveyQuestion, type SurveyAnswers } from '@/lib/erp/survey';

/** ── Survey engine — server actions ────────────────────────────────────────
 *  Build surveys (survey.manage) and submit responses (field.sales). Submission
 *  scores the response server-side with the pure survey engine and stores it for
 *  the Perfect Store score. RLS scopes everything to the company. */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function manageGuard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'survey.manage')) return { ctx: null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export async function saveSurvey(input: {
  id?: string; name: string; nameAr?: string; description?: string; questions: SurveyQuestion[]; isActive?: boolean;
}): Promise<Result<{ id: string }>> {
  const { ctx, error } = await manageGuard();
  if (!ctx) return { ok: false, error };
  if (!input.name?.trim()) return { ok: false, error: 'name required' };
  const invalid = validateSurvey({ questions: input.questions });
  if (invalid) return { ok: false, error: invalid };

  const supabase = await createClient();
  const payload = {
    name: input.name.trim(), name_ar: input.nameAr?.trim() || null,
    description: input.description?.trim() || null, questions: input.questions,
    is_active: input.isActive !== false,
  };
  if (input.id) {
    const { error: e } = await supabase.from('erp_surveys').update({ ...payload, updated_by: ctx.userId }).eq('id', input.id);
    if (e) return { ok: false, error: e.message };
    await logAudit(supabase, { action: 'update', entity: 'survey', entityId: input.id });
    revalidatePath('/settings/surveys');
    return { ok: true, data: { id: input.id } };
  }
  const { data, error: e } = await supabase.from('erp_surveys').insert({ ...payload, created_by: ctx.userId }).select('id').single();
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'create', entity: 'survey', entityId: (data as { id: string }).id });
  revalidatePath('/settings/surveys');
  return { ok: true, data: data as { id: string } };
}

export async function deleteSurvey(id: string): Promise<Result> {
  const { ctx, error } = await manageGuard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: e } = await supabase.from('erp_surveys').delete().eq('id', id);
  if (e) return { ok: false, error: e.message };
  await logAudit(supabase, { action: 'delete', entity: 'survey', entityId: id });
  revalidatePath('/settings/surveys');
  return { ok: true };
}

/** Submit a survey response for a customer (field reps). Scores server-side. */
export async function submitSurveyResponse(input: {
  surveyId: string; customerId: string; visitId?: string | null; answers: SurveyAnswers;
}): Promise<Result<{ score: number }>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!hasPermission(ctx, 'field.sales') && !hasPermission(ctx, 'survey.manage')) return { ok: false, error: 'unauthorized' };
  if (!input.surveyId || !input.customerId) return { ok: false, error: 'missing ids' };

  const supabase = await createClient();
  const { data: survey, error: sErr } = await supabase.from('erp_surveys').select('questions').eq('id', input.surveyId).maybeSingle();
  if (sErr || !survey) return { ok: false, error: sErr?.message ?? 'survey not found' };
  const questions = ((survey as { questions: SurveyQuestion[] }).questions) ?? [];
  const result = scoreSurvey({ questions }, input.answers);

  const { error: e } = await supabase.from('erp_survey_responses').insert({
    survey_id: input.surveyId, customer_id: input.customerId, visit_id: input.visitId ?? null,
    answers: input.answers, score: result.score, created_by: ctx.userId,
  });
  if (e) return { ok: false, error: e.message };
  revalidatePath('/distribution/assortment');
  return { ok: true, data: { score: result.score } };
}
