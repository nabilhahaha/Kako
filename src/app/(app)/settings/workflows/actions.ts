'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { validateWorkflow, type BuilderDefinition } from '@/lib/workflow/builder/validation';
import { simulateWorkflow, type SimulationResult } from '@/lib/workflow/builder/simulate';
import type { RuntimeStep } from '@/lib/workflow/executors/types';
import type { WorkflowStepType } from '@/lib/workflow/types';

const STEP_TYPES = ['approval', 'reject', 'notification', 'task', 'update_record', 'api_call', 'delay', 'escalation', 'condition'];
const STEP_COLS = 'id,step_no,step_type,name,config,approver_type,approver_ref,sla_hours,escalate_to,condition,next_on_success,next_on_failure';

function rowToRuntimeStep(r: Record<string, unknown>): RuntimeStep {
  return {
    id: String(r.id), stepNo: Number(r.step_no), stepType: String(r.step_type ?? 'approval') as WorkflowStepType,
    name: (r.name as string) ?? null, config: (r.config as Record<string, unknown>) ?? {},
    approverType: (r.approver_type as string) ?? null, approverRef: (r.approver_ref as string) ?? null,
    slaHours: (r.sla_hours as number) ?? null, escalateTo: (r.escalate_to as string) ?? null,
    condition: (r.condition as Record<string, unknown>) ?? null,
    nextOnSuccess: (r.next_on_success as string) ?? null, nextOnFailure: (r.next_on_failure as string) ?? null,
  };
}

/** ── Workflow Builder Lite — definition + step management ──────────────────
 *  Gated on workflow.manage; RLS backstops with company-admin/owner. Companies
 *  build their own definitions (global templates are owner-managed). */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'workflow.manage')) return { ctx: null, error: 'unauthorized' as const };
  if (!ctx.companyId) return { ctx: null, error: 'no company' as const };
  return { ctx, error: null };
}

export async function createDefinition(
  key: string, entity: string, nameAr: string, nameEn: string,
): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const k = key.trim(); const e = entity.trim();
  if (!k || !e) return { ok: false, error: 'key and entity required' };
  const supabase = await createClient();
  const { data, error: err } = await supabase
    .from('erp_workflow_definitions')
    .insert({ company_id: ctx.companyId, key: k, entity: e, name_ar: nameAr.trim() || k, name_en: nameEn.trim() || null })
    .select('id').single();
  if (err) return { ok: false, error: err.code === '23505' ? 'a definition with this key exists' : err.message };
  revalidatePath('/settings/workflows');
  return { ok: true, data: { id: (data as { id: string }).id } };
}

export async function addStep(input: {
  definitionId: string; stepNo: number; nameAr: string; approverType: string; approverRef?: string;
  mode: string; requiredApprovals: number; thresholdAmount?: number | null;
}): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!['company_admin', 'user', 'role'].includes(input.approverType)) return { ok: false, error: 'invalid approver type' };
  if (!['sequential', 'parallel'].includes(input.mode)) return { ok: false, error: 'invalid mode' };
  const condition = input.thresholdAmount != null && Number.isFinite(input.thresholdAmount)
    ? { when: 'amount', op: 'gt', value: String(input.thresholdAmount) }
    : null;
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_steps').insert({
    definition_id: input.definitionId,
    step_no: Math.max(1, Math.floor(input.stepNo || 1)),
    name_ar: input.nameAr.trim() || null,
    approver_type: input.approverType,
    approver_ref: input.approverRef?.trim() || null,
    mode: input.mode,
    required_approvals: Math.max(1, Math.floor(input.requiredApprovals || 1)),
    condition,
  });
  if (err) return { ok: false, error: err.code === '23505' ? 'step number already exists' : err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function deleteStep(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_steps').delete().eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function setDefinitionActive(id: string, isActive: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase
    .from('erp_workflow_definitions').update({ is_active: isActive, updated_at: new Date().toISOString() }).eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

export async function deleteDefinition(id: string): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_definitions').delete().eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

// ── Phase 1 builder: trigger/step editors, publish/archive, templates, simulate ──

/** Edit a DRAFT definition (name/description/entity/trigger/visibility). Published
 *  definitions are immutable — editing requires a new draft (clone). */
export async function updateDefinition(id: string, fields: {
  nameAr?: string; nameEn?: string; description?: string; entity?: string;
  triggerEvent?: string | null; triggerConfig?: Record<string, unknown>; visibility?: string;
}): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: def } = await supabase.from('erp_workflow_definitions').select('status').eq('id', id).maybeSingle();
  if ((def as { status?: string } | null)?.status === 'published') {
    return { ok: false, error: 'published workflows are immutable — clone to a new draft to edit' };
  }
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.userId };
  if (fields.nameAr !== undefined) patch.name_ar = fields.nameAr.trim() || null;
  if (fields.nameEn !== undefined) patch.name_en = fields.nameEn.trim() || null;
  if (fields.description !== undefined) patch.description = fields.description.trim() || null;
  if (fields.entity !== undefined) patch.entity = fields.entity.trim();
  if (fields.triggerEvent !== undefined) patch.trigger_event = fields.triggerEvent || null;
  if (fields.triggerConfig !== undefined) patch.trigger_config = fields.triggerConfig;
  if (fields.visibility !== undefined) patch.visibility = fields.visibility;
  const { error: err } = await supabase.from('erp_workflow_definitions').update(patch).eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Create or update a generalized step (any of the 9 executor types). */
export async function upsertStep(input: {
  id?: string; definitionId: string; stepNo: number; stepType: string; name?: string;
  config?: Record<string, unknown>; condition?: Record<string, unknown> | null;
  approverType?: string | null; approverRef?: string | null; mode?: string; requiredApprovals?: number;
  slaHours?: number | null; escalateTo?: string | null; nextOnSuccess?: string | null; nextOnFailure?: string | null;
}): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!STEP_TYPES.includes(input.stepType)) return { ok: false, error: `invalid step_type '${input.stepType}'` };
  const supabase = await createClient();
  const row: Record<string, unknown> = {
    definition_id: input.definitionId, step_no: Math.max(1, Math.floor(input.stepNo || 1)),
    step_type: input.stepType, name: input.name?.trim() || null,
    config: input.config ?? {}, condition: input.condition ?? null,
    approver_type: input.approverType ?? null, approver_ref: input.approverRef?.trim() || null,
    mode: input.mode ?? 'sequential', required_approvals: Math.max(1, Math.floor(input.requiredApprovals || 1)),
    sla_hours: input.slaHours ?? null, escalate_to: input.escalateTo ?? null,
    next_on_success: input.nextOnSuccess ?? null, next_on_failure: input.nextOnFailure ?? null,
  };
  const { error: err } = input.id
    ? await supabase.from('erp_workflow_steps').update(row).eq('id', input.id)
    : await supabase.from('erp_workflow_steps').insert(row);
  if (err) return { ok: false, error: err.code === '23505' ? 'step number already exists' : err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Validate a definition (reuses the runtime executor validators). */
export async function validateDefinition(id: string): Promise<Result<{ errors: string[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: def } = await supabase.from('erp_workflow_definitions').select('entity,trigger_event,trigger_config').eq('id', id).maybeSingle();
  if (!def) return { ok: false, error: 'not found' };
  const { data: steps } = await supabase.from('erp_workflow_steps').select(STEP_COLS).eq('definition_id', id).order('step_no');
  const bd: BuilderDefinition = {
    entity: String((def as Record<string, unknown>).entity), triggerEvent: ((def as Record<string, unknown>).trigger_event as string) ?? null,
    triggerConfig: ((def as Record<string, unknown>).trigger_config as Record<string, unknown>) ?? {},
  };
  const errors = validateWorkflow(bd, ((steps ?? []) as Record<string, unknown>[]).map(rowToRuntimeStep));
  return { ok: true, data: { errors } };
}

/** Publish: validate → immutable version snapshot → status=published, bump version. */
export async function publishDefinition(id: string): Promise<Result<{ version: number; errors?: string[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: defRow } = await supabase.from('erp_workflow_definitions')
    .select('id,company_id,key,entity,name_ar,name_en,description,trigger,trigger_event,trigger_config,visibility,latest_version').eq('id', id).maybeSingle();
  if (!defRow) return { ok: false, error: 'not found' };
  const def = defRow as Record<string, unknown>;
  const { data: stepRows } = await supabase.from('erp_workflow_steps').select(STEP_COLS).eq('definition_id', id).order('step_no');
  const steps = ((stepRows ?? []) as Record<string, unknown>[]);
  const bd: BuilderDefinition = { entity: String(def.entity), triggerEvent: (def.trigger_event as string) ?? null, triggerConfig: (def.trigger_config as Record<string, unknown>) ?? {} };
  const errors = validateWorkflow(bd, steps.map(rowToRuntimeStep));
  if (errors.length) return { ok: false, error: `validation failed: ${errors.join('; ')}`, data: { version: 0, errors } };

  const newVersion = Number(def.latest_version ?? 0) + 1;
  const { error: snapErr } = await supabase.from('erp_workflow_definition_versions').insert({
    company_id: def.company_id, definition_id: id, version: newVersion,
    snapshot: { definition: def, steps }, published_by: ctx.userId,
  });
  if (snapErr) return { ok: false, error: snapErr.message };
  const { error: upErr } = await supabase.from('erp_workflow_definitions').update({
    status: 'published', is_active: true, latest_version: newVersion, version: newVersion,
    published_at: new Date().toISOString(), published_by: ctx.userId, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (upErr) return { ok: false, error: upErr.message };
  revalidatePath('/settings/workflows');
  return { ok: true, data: { version: newVersion } };
}

/** Archive (stop matching new events) or unarchive (back to draft). */
export async function archiveDefinition(id: string, archived: boolean): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { error: err } = await supabase.from('erp_workflow_definitions')
    .update({ status: archived ? 'archived' : 'draft', is_active: !archived, updated_at: new Date().toISOString() }).eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Clone a definition (template use / version restore) into a new DRAFT. */
export async function cloneDefinition(id: string, visibility: 'company' | 'private' = 'company'): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: src } = await supabase.from('erp_workflow_definitions').select('key,entity,name_ar,name_en,description,trigger,trigger_event,trigger_config').eq('id', id).maybeSingle();
  if (!src) return { ok: false, error: 'not found' };
  const s = src as Record<string, unknown>;
  const newKey = `${String(s.key)}-copy-${Math.random().toString(36).slice(2, 6)}`;
  const { data: created, error: cErr } = await supabase.from('erp_workflow_definitions').insert({
    company_id: ctx.companyId, key: newKey, entity: s.entity, name_ar: s.name_ar, name_en: s.name_en, description: s.description,
    trigger: s.trigger ?? 'manual', trigger_event: s.trigger_event, trigger_config: s.trigger_config ?? {},
    status: 'draft', visibility, owner_id: visibility === 'private' ? ctx.userId : null, created_by: ctx.userId,
  }).select('id').single();
  if (cErr) return { ok: false, error: cErr.message };
  const newId = (created as { id: string }).id;
  const { data: steps } = await supabase.from('erp_workflow_steps').select(STEP_COLS).eq('definition_id', id).order('step_no');
  for (const st of ((steps ?? []) as Record<string, unknown>[])) {
    await supabase.from('erp_workflow_steps').insert({
      definition_id: newId, step_no: st.step_no, step_type: st.step_type, name: st.name, config: st.config ?? {},
      condition: st.condition, approver_type: st.approver_type, approver_ref: st.approver_ref,
      sla_hours: st.sla_hours, escalate_to: st.escalate_to, next_on_success: null, next_on_failure: null,
    });
  }
  revalidatePath('/settings/workflows');
  return { ok: true, data: { id: newId } };
}

/** Dry-run simulation against real data (no run, no side effects). */
export async function simulateDefinition(input: {
  definitionId: string; entity: string; recordId: string; contextJson?: string; approvals?: Record<number, 'approved' | 'rejected'>;
}): Promise<Result<SimulationResult>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  let context: Record<string, unknown> = {};
  if (input.contextJson?.trim()) {
    try { context = JSON.parse(input.contextJson); } catch { return { ok: false, error: 'context must be valid JSON' }; }
  }
  const supabase = await createClient();
  const sim = await simulateWorkflow(supabase, ctx.companyId!, ctx.userId, {
    definitionId: input.definitionId, entity: input.entity, recordId: input.recordId, context, approvals: input.approvals,
  });
  return { ok: true, data: sim };
}
