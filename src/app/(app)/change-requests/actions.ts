'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import { recordEvent } from '@/lib/workflow/emit';
import { getFieldLayout } from '@/lib/erp/field-governance-server';
import {
  CHANGE_REQUESTS_ENABLED,
  isApplyAllowed,
  diffChanges,
  disallowedFields,
  evaluateValidation,
} from '@/lib/change-requests';
import { getChangeRequestEntity } from '@/lib/change-requests/registry-server';

/** ── Universal Change Request — submit (Phase 2: single record) ──────────────
 *  Raise a governed change request for ONE record of a registered entity. The
 *  entire pipeline is metadata-driven (no per-entity code): resolve the entity
 *  config, enforce the create permission, load the live record, diff the changes,
 *  enforce field governance (DFG) + the entity's field whitelist, run declarative
 *  + named + reference validation, persist header/target/values with before/after,
 *  audit, and emit `change_request.submitted` (the workflow engine consumes it in
 *  Phase 3). Nothing is applied here. Flag-gated, tenant-scoped via RLS. */

export interface SubmitChangeRequestInput {
  entityKey: string;
  targetId: string;
  changes: Record<string, unknown>;
  reason?: string;
  effectiveAt?: string | null;   // ISO; future = scheduled (activation lands in a later phase)
}

export interface SubmitChangeRequestResult extends ActionResult<{ id: string }> {
  problems?: string[];
}

export async function submitChangeRequest(input: SubmitChangeRequestInput): Promise<SubmitChangeRequestResult> {
  if (!CHANGE_REQUESTS_ENABLED()) return { ok: false, error: 'disabled' };

  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };
  if (!input.entityKey || !input.targetId) return { ok: false, error: 'missing' };

  const supabase = await createClient();

  // 1) Resolve the entity metadata (company override → global default).
  const entity = await getChangeRequestEntity(supabase, input.entityKey, ctx.companyId);
  if (!entity || !entity.isActive) return { ok: false, error: 'unknown_entity' };

  // 2) Security: the apply target table must be allowlisted (defense in depth;
  //    re-checked at apply). Metadata can never point the engine at any table.
  if (!isApplyAllowed(entity.targetTable)) return { ok: false, error: 'entity_not_allowed' };

  // 3) Permission to raise a request for this entity.
  if (entity.createPermission && !hasPermission(ctx, entity.createPermission as Permission) && !ctx.isSuperAdmin) {
    return { ok: false, error: 'forbidden' };
  }

  // 4) Load the live record (RLS-scoped) for diff + before-values.
  const { data: current } = await supabase
    .from(entity.targetTable)
    .select('*')
    .eq(entity.idColumn, input.targetId)
    .maybeSingle();
  if (!current) return { ok: false, error: 'target_not_found' };
  const record = current as Record<string, unknown>;

  // 5) Entity field whitelist (when configured).
  const notAllowed = disallowedFields(input.changes, entity.allowedFields);
  if (notAllowed.length) return { ok: false, error: 'field_not_allowed', problems: notAllowed };

  // 6) Field governance (DFG): the requester must be able to EDIT every changed
  //    governed field. Ungoverned fields (not in the layout) are unrestricted here.
  const layout = await getFieldLayout(supabase, ctx, input.entityKey, record);
  const access = new Map(layout.map((f) => [f.key, f.access]));
  const govBlocked = Object.keys(input.changes).filter((k) => {
    const a = access.get(k);
    return a !== undefined && a !== 'edit' && a !== 'required';
  });
  if (govBlocked.length) return { ok: false, error: 'field_forbidden', problems: govBlocked };

  // 7) Diff — only the fields that actually change.
  const diff = diffChanges(record, input.changes, entity.allowedFields);
  if (diff.length === 0) return { ok: false, error: 'no_changes' };

  // 8) Validation — declarative + named, then DB-backed reference checks.
  const proposed = Object.fromEntries(diff.map((d) => [d.fieldKey, d.newValue]));
  const { errors, deferred } = evaluateValidation(entity.validation, proposed, entity.entityKey);
  if (errors.length) return { ok: false, error: 'validation_failed', problems: errors.map((e) => `${e.field}:${e.rule}`) };
  for (const ref of deferred.references) {
    const { data: exists } = await supabase.from(ref.table).select('id').eq('id', ref.value).maybeSingle();
    if (!exists) return { ok: false, error: 'reference_invalid', problems: [ref.field] };
  }

  // 9) Persist header + target + values (before/after).
  const effectiveAt = input.effectiveAt ?? null;
  const { data: reqRow, error: insErr } = await supabase
    .from('erp_change_requests')
    .insert({
      company_id: ctx.companyId,
      entity_key: entity.entityKey,
      scope: 'single',
      status: 'submitted',
      reason: input.reason ?? null,
      effective_at: effectiveAt,
      requested_by: ctx.userId,
      summary: { targets: 1, fields: diff.length },
    })
    .select('id')
    .single();
  if (insErr || !reqRow) return { ok: false, error: friendlyDbError(insErr ?? { message: 'insert_failed' }) };
  const id = (reqRow as { id: string }).id;

  const { error: tErr } = await supabase
    .from('erp_change_request_targets')
    .insert({ request_id: id, company_id: ctx.companyId, target_id: input.targetId });
  const { error: vErr } = await supabase.from('erp_change_request_values').insert(
    diff.map((d) => ({
      request_id: id,
      company_id: ctx.companyId,
      target_id: input.targetId,
      field_key: d.fieldKey,
      old_value: d.oldValue ?? null,
      new_value: d.newValue ?? null,
    })),
  );
  if (tErr || vErr) return { ok: false, error: friendlyDbError((tErr ?? vErr)!) };

  // 10) Audit (before/after) + emit the domain event for the workflow engine.
  await logAudit(supabase, {
    action: 'change_request.submit',
    entity: 'change_request',
    entityId: id,
    companyId: ctx.companyId,
    details: {
      entity_key: entity.entityKey,
      target_id: input.targetId,
      effective_at: effectiveAt,
      fields: diff.map((d) => ({ field: d.fieldKey, old: d.oldValue, new: d.newValue })),
    },
  });
  await recordEvent({
    eventType: 'change_request.submitted',
    entity: 'change_request',
    recordId: id,
    payload: { entity_key: entity.entityKey, target_id: input.targetId, scope: 'single', effective_at: effectiveAt },
  });

  return { ok: true, data: { id } };
}

/** ── Universal Change Request — submit (Phase 7: bulk / shared patch) ────────
 *  Raise ONE governed request that applies the SAME field changes to many records
 *  of a registered entity (e.g. update 500 customers, mass price change, reassign
 *  200 routes). Same metadata-driven gates as the single path (permission, apply
 *  allowlist, field whitelist, DFG edit access, declarative + reference validation);
 *  the shared changes are stored once (target_id NULL) and the apply engine fans
 *  them out per target with per-target before/after audit + partial-failure
 *  tolerance. Nothing is applied here. Flag-gated, tenant-scoped via RLS. */

export interface SubmitBulkChangeRequestInput {
  entityKey: string;
  targetIds: string[];
  changes: Record<string, unknown>;   // applied to every target
  reason?: string;
  effectiveAt?: string | null;
}

export async function submitBulkChangeRequest(input: SubmitBulkChangeRequestInput): Promise<SubmitChangeRequestResult> {
  if (!CHANGE_REQUESTS_ENABLED()) return { ok: false, error: 'disabled' };

  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };
  if (!input.entityKey || !Array.isArray(input.targetIds)) return { ok: false, error: 'missing' };

  const targets = [...new Set(input.targetIds.map((s) => String(s).trim()).filter(Boolean))];
  if (targets.length === 0) return { ok: false, error: 'no_targets' };

  const supabase = await createClient();

  const entity = await getChangeRequestEntity(supabase, input.entityKey, ctx.companyId);
  if (!entity || !entity.isActive) return { ok: false, error: 'unknown_entity' };
  if (!entity.supportsBulk) return { ok: false, error: 'bulk_not_supported' };
  if (targets.length > entity.bulkMax) return { ok: false, error: 'bulk_too_large', problems: [String(entity.bulkMax)] };
  if (!isApplyAllowed(entity.targetTable)) return { ok: false, error: 'entity_not_allowed' };
  if (entity.createPermission && !hasPermission(ctx, entity.createPermission as Permission) && !ctx.isSuperAdmin) {
    return { ok: false, error: 'forbidden' };
  }

  const fields = Object.keys(input.changes);
  if (fields.length === 0) return { ok: false, error: 'no_changes' };

  // Entity field whitelist.
  const notAllowed = disallowedFields(input.changes, entity.allowedFields);
  if (notAllowed.length) return { ok: false, error: 'field_not_allowed', problems: notAllowed };

  // Field governance (role-based; record-independent gate for the shared patch).
  const layout = await getFieldLayout(supabase, ctx, input.entityKey, {});
  const access = new Map(layout.map((f) => [f.key, f.access]));
  const govBlocked = fields.filter((k) => {
    const a = access.get(k);
    return a !== undefined && a !== 'edit' && a !== 'required';
  });
  if (govBlocked.length) return { ok: false, error: 'field_forbidden', problems: govBlocked };

  // Validation — declarative + named, then DB-backed reference checks.
  const { errors, deferred } = evaluateValidation(entity.validation, input.changes, entity.entityKey);
  if (errors.length) return { ok: false, error: 'validation_failed', problems: errors.map((e) => `${e.field}:${e.rule}`) };
  for (const ref of deferred.references) {
    const { data: exists } = await supabase.from(ref.table).select('id').eq('id', ref.value).maybeSingle();
    if (!exists) return { ok: false, error: 'reference_invalid', problems: [ref.field] };
  }

  // Persist header + N targets + shared values (target_id NULL = applies to all).
  const effectiveAt = input.effectiveAt ?? null;
  const { data: reqRow, error: insErr } = await supabase
    .from('erp_change_requests')
    .insert({
      company_id: ctx.companyId, entity_key: entity.entityKey, scope: 'bulk', status: 'submitted',
      reason: input.reason ?? null, effective_at: effectiveAt, requested_by: ctx.userId,
      summary: { targets: targets.length, fields: fields.length },
    })
    .select('id').single();
  if (insErr || !reqRow) return { ok: false, error: friendlyDbError(insErr ?? { message: 'insert_failed' }) };
  const id = (reqRow as { id: string }).id;

  const { error: tErr } = await supabase.from('erp_change_request_targets').insert(
    targets.map((target_id) => ({ request_id: id, company_id: ctx.companyId, target_id })),
  );
  const { error: vErr } = await supabase.from('erp_change_request_values').insert(
    fields.map((field_key) => ({ request_id: id, company_id: ctx.companyId, target_id: null, field_key, new_value: input.changes[field_key] ?? null })),
  );
  if (tErr || vErr) return { ok: false, error: friendlyDbError((tErr ?? vErr)!) };

  await logAudit(supabase, {
    action: 'change_request.submit', entity: 'change_request', entityId: id, companyId: ctx.companyId,
    details: { entity_key: entity.entityKey, scope: 'bulk', target_count: targets.length, effective_at: effectiveAt, fields: input.changes },
  });
  await recordEvent({
    eventType: 'change_request.submitted', entity: 'change_request', recordId: id,
    payload: { entity_key: entity.entityKey, scope: 'bulk', target_count: targets.length, effective_at: effectiveAt },
  });

  return { ok: true, data: { id } };
}
