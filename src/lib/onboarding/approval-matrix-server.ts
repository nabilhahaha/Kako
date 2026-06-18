'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { publishDefinition } from '@/app/(app)/settings/workflows/actions';
import {
  APPROVAL_SCENARIOS, scenarioByKey, tiersToStepRows, stepRowsToTiers, validateTiers,
  type MatrixTier,
} from './approval-matrix';

/**
 * Approval Matrix — server actions. A friendly authoring surface that writes the
 * SAME erp_workflow_definitions + erp_workflow_steps the manual builder writes,
 * then publishes via the existing publishDefinition (validation + version
 * snapshot reused). A company definition reusing a scenario's canonical key
 * overrides the global seed through the existing resolver. No new tables, no new
 * engine. Gated on workflow.manage; RLS additionally requires company-admin.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'workflow.manage')) return { ctx: null as null, error: 'unauthorized' as const };
  if (!ctx.companyId) return { ctx: null as null, error: 'no_company' as const };
  return { ctx, error: null };
}

export interface RoleOption { key: string; nameAr: string }

export interface ScenarioState {
  key: string;
  entity: string;
  amountTiered: boolean;
  active: boolean;        // a published, active company definition exists
  tiers: MatrixTier[];    // current approver tiers (empty = not configured)
}

export interface ApprovalMatrixData {
  scenarios: ScenarioState[];
  roles: RoleOption[];
}

/** Load every scenario's current company definition (if any) + the role picker. */
export async function loadApprovalMatrix(): Promise<Result<ApprovalMatrixData>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const keys = APPROVAL_SCENARIOS.map((s) => s.key);
  const [{ data: defs, error: dErr }, { data: roles, error: rErr }] = await Promise.all([
    supabase
      .from('erp_workflow_definitions')
      .select('id, key, status, is_active')
      .eq('company_id', ctx.companyId)
      .in('key', keys),
    supabase.from('erp_roles').select('key, name_ar, rank').order('rank', { ascending: true }),
  ]);
  if (dErr) return { ok: false, error: dErr.message };
  if (rErr) return { ok: false, error: rErr.message };

  const defRows = ((defs as Record<string, unknown>[]) ?? []);
  const defByKey = new Map(defRows.map((d) => [String(d.key), d]));

  // Pull steps for the company definitions we found, in one query.
  const defIds = defRows.map((d) => String(d.id));
  let stepsByDef = new Map<string, Record<string, unknown>[]>();
  if (defIds.length) {
    const { data: steps, error: sErr } = await supabase
      .from('erp_workflow_steps')
      .select('definition_id, step_no, approver_type, approver_ref, condition')
      .in('definition_id', defIds);
    if (sErr) return { ok: false, error: sErr.message };
    stepsByDef = ((steps as Record<string, unknown>[]) ?? []).reduce((m, s) => {
      const k = String(s.definition_id);
      (m.get(k) ?? m.set(k, []).get(k)!).push(s);
      return m;
    }, new Map<string, Record<string, unknown>[]>());
  }

  const scenarios: ScenarioState[] = APPROVAL_SCENARIOS.map((sc) => {
    const def = defByKey.get(sc.key);
    const defId = def ? String(def.id) : null;
    const rows = defId ? (stepsByDef.get(defId) ?? []) : [];
    const tiers = stepRowsToTiers(rows.map((r) => ({
      step_no: Number(r.step_no), approver_type: (r.approver_type as string) ?? null,
      approver_ref: (r.approver_ref as string) ?? null, condition: r.condition,
    })));
    return {
      key: sc.key,
      entity: sc.entity,
      amountTiered: sc.amountTiered,
      active: Boolean(def && def.is_active && def.status === 'published'),
      tiers,
    };
  });

  const roleOptions: RoleOption[] = ((roles as Record<string, unknown>[]) ?? []).map((r) => ({
    key: String(r.key), nameAr: String(r.name_ar ?? r.key),
  }));

  return { ok: true, data: { scenarios, roles: roleOptions } };
}

/** Create or update a scenario's company workflow definition + steps from tiers,
 *  then publish it (reusing the existing publish path). */
export async function saveApprovalMatrix(input: { scenarioKey: string; tiers: MatrixTier[] }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };

  const scenario = scenarioByKey(input.scenarioKey);
  if (!scenario) return { ok: false, error: 'unknown_scenario' };

  const problems = validateTiers(input.tiers, scenario.amountTiered);
  if (problems.length) return { ok: false, error: problems[0] };

  const supabase = await createClient();

  // 1. Find (or create) the company definition reusing the scenario's key.
  const { data: existing, error: exErr } = await supabase
    .from('erp_workflow_definitions')
    .select('id, status')
    .eq('company_id', ctx.companyId)
    .eq('key', scenario.key)
    .maybeSingle();
  if (exErr) return { ok: false, error: exErr.message };

  let defId: string;
  if (existing) {
    defId = String((existing as { id: string }).id);
    // Re-open to draft so steps are editable (published defs are immutable).
    const { error: upErr } = await supabase
      .from('erp_workflow_definitions')
      .update({ status: 'draft', is_active: true, updated_at: new Date().toISOString(), updated_by: ctx.userId })
      .eq('id', defId);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { data: created, error: cErr } = await supabase
      .from('erp_workflow_definitions')
      .insert({
        company_id: ctx.companyId,
        key: scenario.key,
        entity: scenario.entity,
        name_ar: scenario.key,
        trigger: scenario.trigger,
        trigger_event: scenario.triggerEvent ?? null,
        status: 'draft',
        visibility: 'company',
        created_by: ctx.userId,
      })
      .select('id')
      .single();
    if (cErr) return { ok: false, error: cErr.code === '23505' ? 'duplicate' : cErr.message };
    defId = String((created as { id: string }).id);
  }

  // 2. Replace steps wholesale (delete then insert the compiled tiers).
  const { error: delErr } = await supabase.from('erp_workflow_steps').delete().eq('definition_id', defId);
  if (delErr) return { ok: false, error: delErr.message };

  const stepRows = tiersToStepRows(input.tiers, scenario.amountTiered).map((s) => ({
    definition_id: defId,
    step_no: s.stepNo,
    step_type: 'approval',
    approver_type: s.approverType,
    approver_ref: s.approverRef,
    mode: 'sequential',
    required_approvals: 1,
    condition: s.condition,
  }));
  if (stepRows.length) {
    const { error: insErr } = await supabase.from('erp_workflow_steps').insert(stepRows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  // 3. Publish via the EXISTING path (validation + immutable version snapshot).
  const pub = await publishDefinition(defId);
  if (!pub.ok) return { ok: false, error: pub.error ?? 'publish_failed' };

  await logAudit(supabase, {
    action: 'approval_matrix.save', entity: 'workflow_definition', entityId: defId,
    companyId: ctx.companyId, details: { scenario: scenario.key, tiers: input.tiers.length },
  });
  revalidatePath('/settings/approval-matrix');
  revalidatePath('/settings/workflows');
  return { ok: true };
}

/** Turn a scenario off (deactivate the company definition; the global seed, if
 *  any, resumes). Does not delete history. */
export async function deactivateApprovalScenario(input: { scenarioKey: string }): Promise<Result> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const scenario = scenarioByKey(input.scenarioKey);
  if (!scenario) return { ok: false, error: 'unknown_scenario' };

  const supabase = await createClient();
  const { error: upErr } = await supabase
    .from('erp_workflow_definitions')
    .update({ is_active: false, status: 'archived', updated_at: new Date().toISOString(), updated_by: ctx.userId })
    .eq('company_id', ctx.companyId)
    .eq('key', scenario.key);
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, {
    action: 'approval_matrix.deactivate', entity: 'workflow_definition', entityId: scenario.key, companyId: ctx.companyId,
  });
  revalidatePath('/settings/approval-matrix');
  return { ok: true };
}
