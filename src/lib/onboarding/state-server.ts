'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { setStepStatus, mergeDraft, type OnboardingStepStatus, type StepStatusMap } from './state';

/**
 * Onboarding wizard state — server actions (load / save-step / complete) over
 * `erp_onboarding_state`. RLS scopes every row to the caller's company; the
 * action layer additionally requires the company-setup capability
 * (`integrations.manage`, the same gate as the existing onboarding cockpit).
 * Completion flips the existing `erp_companies.setup_done` — no new flag.
 */

export interface OnboardingState {
  companyId: string;
  templateKey: string | null;
  currentStep: string | null;
  stepStatus: StepStatusMap;
  draft: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'integrations.manage')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

function rowToState(r: Record<string, unknown>): OnboardingState {
  return {
    companyId: String(r.company_id),
    templateKey: (r.template_key as string) ?? null,
    currentStep: (r.current_step as string) ?? null,
    stepStatus: (r.step_status as StepStatusMap) ?? {},
    draft: (r.draft as Record<string, unknown>) ?? {},
    startedAt: String(r.started_at),
    completedAt: (r.completed_at as string) ?? null,
    updatedAt: String(r.updated_at),
  };
}

/** Load (or lazily create) the company's onboarding state. */
export async function loadOnboardingState(): Promise<Result<OnboardingState>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const { data, error: selErr } = await supabase
    .from('erp_onboarding_state')
    .select('company_id, template_key, current_step, step_status, draft, started_at, completed_at, updated_at')
    .eq('company_id', ctx.companyId!)
    .maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (data) return { ok: true, data: rowToState(data as Record<string, unknown>) };

  // First entry → create an empty state (RLS WITH CHECK enforces own company).
  const { data: created, error: insErr } = await supabase
    .from('erp_onboarding_state')
    .insert({ company_id: ctx.companyId!, updated_by: ctx.userId })
    .select('company_id, template_key, current_step, step_status, draft, started_at, completed_at, updated_at')
    .single();
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true, data: rowToState(created as Record<string, unknown>) };
}

/** Save progress for one step: status and/or a draft patch; sets current_step. */
export async function saveOnboardingStep(input: {
  step: string;
  status?: OnboardingStepStatus;
  draftPatch?: Record<string, unknown>;
  templateKey?: string;
}): Promise<Result<OnboardingState>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.step) return { ok: false, error: 'missing step' };

  const current = await loadOnboardingState();
  if (!current.ok || !current.data) return current;
  const s = current.data;

  const nextStatus = input.status ? setStepStatus(s.stepStatus, input.step, input.status) : s.stepStatus;
  const nextDraft = input.draftPatch ? mergeDraft(s.draft, input.step, input.draftPatch) : s.draft;

  const supabase = await createClient();
  const { data, error: upErr } = await supabase
    .from('erp_onboarding_state')
    .update({
      step_status: nextStatus,
      draft: nextDraft,
      current_step: input.step,
      template_key: input.templateKey ?? s.templateKey,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq('company_id', ctx.companyId!)
    .select('company_id, template_key, current_step, step_status, draft, started_at, completed_at, updated_at')
    .single();
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath('/settings/onboarding');
  return { ok: true, data: rowToState(data as Record<string, unknown>) };
}

/** Finalize onboarding: stamp completed_at and flip the existing setup_done flag. */
export async function completeOnboarding(): Promise<Result<{ completedAt: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: upErr } = await supabase
    .from('erp_onboarding_state')
    .update({ completed_at: now, updated_at: now, updated_by: ctx.userId })
    .eq('company_id', ctx.companyId!);
  if (upErr) return { ok: false, error: upErr.message };

  // Reuse the existing company flag — no new completion concept.
  const { error: cErr } = await supabase
    .from('erp_companies').update({ setup_done: true }).eq('id', ctx.companyId!);
  if (cErr) return { ok: false, error: cErr.message };

  revalidatePath('/settings/onboarding');
  return { ok: true, data: { completedAt: now } };
}
