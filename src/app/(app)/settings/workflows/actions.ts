'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { validateWorkflow, type BuilderDefinition } from '@/lib/workflow/builder/validation';
import { simulateWorkflow, type SimulationResult } from '@/lib/workflow/builder/simulate';
import type { StepPatch } from '@/lib/workflow/builder/graph-model';
import type { RuntimeStep } from '@/lib/workflow/executors/types';
import type { WorkflowStepType } from '@/lib/workflow/types';
import { validateTemplateDefinition, templateToRows, type TemplateDefinition } from '@/lib/workflow-builder';
import { logAudit } from '@/lib/erp/audit';

const STEP_TYPES = ['approval', 'reject', 'notification', 'task', 'update_record', 'api_call', 'delay', 'escalation', 'condition'];
const STEP_COLS = 'id,step_no,step_type,name,config,approver_type,approver_ref,sla_hours,escalate_to,condition,next_on_success,next_on_failure';

type Db = Awaited<ReturnType<typeof createClient>>;

/** Copy steps into a new definition, remapping branch targets (old step id →
 *  new step id) so success/failure branches survive a clone/restore. */
async function copyStepsRemapped(supabase: Db, sourceSteps: Record<string, unknown>[], newDefId: string): Promise<void> {
  const oldIdToStepNo = new Map<string, number>();
  for (const st of sourceSteps) oldIdToStepNo.set(String(st.id), Number(st.step_no));
  // pass 1: insert with branches nulled, capturing step_no → new id.
  const newIdByStepNo = new Map<number, string>();
  for (const st of sourceSteps) {
    const { data } = await supabase.from('erp_workflow_steps').insert({
      definition_id: newDefId, step_no: st.step_no, step_type: st.step_type, name: st.name,
      config: st.config ?? {}, condition: st.condition, approver_type: st.approver_type, approver_ref: st.approver_ref,
      sla_hours: st.sla_hours, escalate_to: st.escalate_to, next_on_success: null, next_on_failure: null,
    }).select('id').single();
    if (data) newIdByStepNo.set(Number(st.step_no), (data as { id: string }).id);
  }
  // pass 2: remap branch targets to the freshly inserted ids.
  const mapTarget = (oldId: unknown): string | null => {
    if (!oldId) return null;
    const sn = oldIdToStepNo.get(String(oldId));
    return sn != null ? newIdByStepNo.get(sn) ?? null : null;
  };
  for (const st of sourceSteps) {
    const newId = newIdByStepNo.get(Number(st.step_no));
    if (!newId) continue;
    const ns = mapTarget(st.next_on_success);
    const nf = mapTarget(st.next_on_failure);
    if (ns || nf) await supabase.from('erp_workflow_steps').update({ next_on_success: ns, next_on_failure: nf }).eq('id', newId);
  }
}

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

/** Clone a definition (template use / save-as-template) into a new DRAFT.
 *  Visibility 'global' is RLS-gated to the platform owner. */
export async function cloneDefinition(id: string, visibility: 'company' | 'private' | 'global' = 'company'): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: src } = await supabase.from('erp_workflow_definitions').select('key,entity,name_ar,name_en,description,trigger,trigger_event,trigger_config').eq('id', id).maybeSingle();
  if (!src) return { ok: false, error: 'not found' };
  const s = src as Record<string, unknown>;
  const newKey = `${String(s.key)}-copy-${Math.random().toString(36).slice(2, 6)}`;
  const { data: created, error: cErr } = await supabase.from('erp_workflow_definitions').insert({
    company_id: visibility === 'global' ? null : ctx.companyId, key: newKey, entity: s.entity,
    name_ar: s.name_ar, name_en: s.name_en, description: s.description,
    trigger: s.trigger ?? 'manual', trigger_event: s.trigger_event, trigger_config: s.trigger_config ?? {},
    status: 'draft', visibility, owner_id: visibility === 'private' ? ctx.userId : null, created_by: ctx.userId,
  }).select('id').single();
  if (cErr) return { ok: false, error: cErr.message };
  const newId = (created as { id: string }).id;
  const { data: steps } = await supabase.from('erp_workflow_steps').select(STEP_COLS).eq('definition_id', id).order('step_no');
  await copyStepsRemapped(supabase, (steps ?? []) as Record<string, unknown>[], newId);
  revalidatePath('/settings/workflows');
  return { ok: true, data: { id: newId } };
}

/** Promote a template up a tier: private → company, or company → global
 *  (global is RLS-gated to the platform owner). */
export async function promoteDefinition(id: string, to: 'company' | 'global'): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const patch: Record<string, unknown> = { visibility: to, owner_id: null, updated_at: new Date().toISOString(), updated_by: ctx.userId };
  if (to === 'global') patch.company_id = null;
  const { error: err } = await supabase.from('erp_workflow_definitions').update(patch).eq('id', id);
  if (err) return { ok: false, error: err.message };
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Restore a past immutable version into a new editable DRAFT (from its snapshot). */
export async function restoreVersion(definitionId: string, version: number): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  const { data: ver } = await supabase.from('erp_workflow_definition_versions')
    .select('snapshot').eq('definition_id', definitionId).eq('version', version).maybeSingle();
  if (!ver) return { ok: false, error: 'version not found' };
  const snap = (ver as { snapshot?: { definition?: Record<string, unknown>; steps?: Record<string, unknown>[] } }).snapshot ?? {};
  const d = snap.definition ?? {};
  const srcSteps = snap.steps ?? [];
  const newKey = `${String(d.key ?? 'workflow')}-v${version}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: created, error: cErr } = await supabase.from('erp_workflow_definitions').insert({
    company_id: ctx.companyId, key: newKey, entity: d.entity, name_ar: d.name_ar, name_en: d.name_en, description: d.description,
    trigger: d.trigger ?? 'manual', trigger_event: d.trigger_event, trigger_config: d.trigger_config ?? {},
    status: 'draft', visibility: 'company', created_by: ctx.userId,
  }).select('id').single();
  if (cErr) return { ok: false, error: cErr.message };
  const newId = (created as { id: string }).id;
  await copyStepsRemapped(supabase, srcSteps, newId);
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

// ── Phase 2 canvas: VISUAL-ONLY persistence (no execution / runtime / rules) ──

interface CanvasMeta { viewport?: { x: number; y: number; zoom: number }; trigger?: { x: number; y: number }; notes?: string }

/** Persist node positions + canvas metadata only. Pure presentation — the
 *  runtime never reads these. Allowed regardless of status (layout is visual). */
export async function saveLayout(definitionId: string, positions: { id: string; ui_position: { x: number; y: number } }[], canvasMeta?: CanvasMeta): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();
  for (const p of positions) {
    await supabase.from('erp_workflow_steps').update({ ui_position: p.ui_position }).eq('id', p.id).eq('definition_id', definitionId);
  }
  if (canvasMeta) await supabase.from('erp_workflow_definitions').update({ canvas_meta: canvasMeta }).eq('id', definitionId);
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Batch-persist the canvas graph to the SAME step rows the runtime executes.
 *  This is persistence only — it reuses the engine schema and then the existing
 *  validateWorkflow; it contains no execution, runtime, or business logic.
 *  Draft-only (published definitions are immutable — clone to edit). */
export async function saveGraph(input: {
  definitionId: string; steps: StepPatch[]; deletedIds?: string[]; canvasMeta?: CanvasMeta;
}): Promise<Result<{ errors: string[] }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const { data: defRow } = await supabase.from('erp_workflow_definitions').select('status,entity,trigger_event,trigger_config').eq('id', input.definitionId).maybeSingle();
  if (!defRow) return { ok: false, error: 'not found' };
  const def = defRow as Record<string, unknown>;
  if (def.status === 'published') return { ok: false, error: 'published workflows are immutable — clone to a new draft to edit' };

  for (const s of input.steps) {
    if (!STEP_TYPES.includes(s.step_type)) return { ok: false, error: `invalid step_type '${s.step_type}'` };
  }

  // 1. Park every existing row at a DISTINCT temp step_no (negative) so the
  //    1..N target range is free and there is no transient unique collision.
  const { data: before } = await supabase.from('erp_workflow_steps').select('id').eq('definition_id', input.definitionId);
  const existingIds = ((before ?? []) as { id: string }[]).map((r) => r.id);
  for (let i = 0; i < existingIds.length; i++) {
    await supabase.from('erp_workflow_steps').update({ step_no: -(i + 1) }).eq('id', existingIds[i]);
  }

  // 2. Upsert incoming steps (branches included; next_on_* are plain uuids, no FK).
  const keepIds = new Set(input.steps.map((s) => s.id));
  if (input.steps.length) {
    const rows = input.steps.map((s) => ({
      id: s.id, definition_id: input.definitionId, step_no: s.step_no, step_type: s.step_type,
      name: s.name, config: s.config ?? {}, condition: s.condition,
      approver_type: s.approver_type, approver_ref: s.approver_ref, sla_hours: s.sla_hours, escalate_to: s.escalate_to,
      next_on_success: s.next_on_success, next_on_failure: s.next_on_failure, ui_position: s.ui_position,
    }));
    const { error: upErr } = await supabase.from('erp_workflow_steps').upsert(rows, { onConflict: 'id' });
    if (upErr) return { ok: false, error: upErr.message };
  }

  // 3. Delete any prior rows no longer present (still parked at a negative step_no).
  const toDelete = existingIds.filter((id) => !keepIds.has(id));
  if (toDelete.length) {
    const { error: delErr } = await supabase.from('erp_workflow_steps').delete().in('id', toDelete);
    if (delErr) return { ok: false, error: delErr.message };
  }

  // 4. Canvas metadata (visual-only).
  if (input.canvasMeta) await supabase.from('erp_workflow_definitions').update({ canvas_meta: input.canvasMeta }).eq('id', input.definitionId);

  // 5. Validate via the EXISTING validator (no duplicate rules).
  const { data: freshSteps } = await supabase.from('erp_workflow_steps').select(STEP_COLS).eq('definition_id', input.definitionId).order('step_no');
  const bd: BuilderDefinition = { entity: String(def.entity), triggerEvent: (def.trigger_event as string) ?? null, triggerConfig: (def.trigger_config as Record<string, unknown>) ?? {} };
  const errors = validateWorkflow(bd, ((freshSteps ?? []) as Record<string, unknown>[]).map(rowToRuntimeStep));

  revalidatePath('/settings/workflows');
  return { ok: true, data: { errors } };
}

// ── 8A Workflow Builder: instantiate a catalog template into a draft definition ──

export interface TemplateListItem {
  id: string; code: string; nameAr: string; nameEn: string; category: string; entity: string; isGlobal: boolean;
}

/** Active templates visible to the tenant (global seeds + own). Gated on workflow.manage. */
export async function listWorkflowTemplates(): Promise<TemplateListItem[]> {
  const { ctx } = await guard();
  if (!ctx) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_workflow_templates')
    .select('id, company_id, code, name_en, name_ar, category, entity, is_active')
    .eq('is_active', true)
    .order('category');
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id), code: String(r.code), nameAr: String(r.name_ar), nameEn: String(r.name_en),
    category: String(r.category), entity: String(r.entity), isGlobal: r.company_id == null,
  }));
}

/** Clone a catalog template into a NEW DRAFT definition (+ steps) owned by the
 *  tenant, reusing the existing engine tables via the pure templateToRows mapper.
 *  Audited. The draft can then be reviewed/edited/published like any definition. */
export async function instantiateTemplate(templateId: string): Promise<Result<{ id: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const { data: tpl } = await supabase
    .from('erp_workflow_templates')
    .select('code, name_ar, name_en, definition')
    .eq('id', templateId).maybeSingle();
  if (!tpl) return { ok: false, error: 'template not found' };
  const t = tpl as { code: string; name_ar: string; name_en: string; definition: TemplateDefinition };

  const problems = validateTemplateDefinition(t.definition);
  if (problems.length) return { ok: false, error: `invalid template: ${problems.join('; ')}` };

  const key = `${t.code}-${Math.random().toString(36).slice(2, 6)}`;
  const { definition, steps } = templateToRows(t.definition, {
    companyId: ctx.companyId!, key, nameAr: t.name_ar, nameEn: t.name_en,
  });

  const { data: created, error: cErr } = await supabase
    .from('erp_workflow_definitions')
    .insert({ ...definition, status: 'draft', visibility: 'company', created_by: ctx.userId })
    .select('id').single();
  if (cErr) return { ok: false, error: cErr.message };
  const newId = (created as { id: string }).id;

  const stepRows = steps.map((s) => ({ ...s, definition_id: newId }));
  const { error: sErr } = await supabase.from('erp_workflow_steps').insert(stepRows);
  if (sErr) {
    await supabase.from('erp_workflow_definitions').delete().eq('id', newId); // don't orphan
    return { ok: false, error: sErr.message };
  }

  await logAudit(supabase, {
    action: 'workflow.template.instantiate', entity: 'workflow_definition', entityId: newId,
    companyId: ctx.companyId!, details: { template_code: t.code, steps: steps.length },
  });
  revalidatePath('/settings/workflows');
  return { ok: true, data: { id: newId } };
}
