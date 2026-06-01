'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { friendlyDbError, type ActionResult } from '@/lib/erp/guards';

/** ── Configuration Governance — console actions (CG-2) ──────────────────────
 *  Thin wrappers over the admin-only erp_cfg_* RPCs. */
async function ok() { const ctx = await getUserContext(); return !!ctx?.company?.id; }

export interface ChangeInput {
  id?: string | null; title: string; config_type: string; config_ref: string; enabled: boolean; kind: string;
  audience_kind: string; audience_ids: string[]; pilot_ids: string[];
}

export async function saveChange(ch: ChangeInput): Promise<ActionResult<{ id: string }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cfg_change_save', {
    p_config_type: ch.config_type, p_config_ref: ch.config_ref, p_title: ch.title,
    p_payload: { enabled: ch.enabled, kind: ch.kind },
    p_audience: { kind: ch.audience_kind, ids: ch.audience_ids.filter(Boolean) },
    p_pilot: ch.pilot_ids.filter(Boolean), p_id: ch.id ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/governance');
  return { ok: true, data: data as { id: string } };
}

export async function setChangeState(id: string, state: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cfg_set_state', { p_id: id, p_state: state });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/governance'); revalidatePath(`/governance/${id}`);
  return { ok: true };
}

export async function publishChange(id: string): Promise<ActionResult<{ ok: boolean; issues: unknown[] }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cfg_publish', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/governance'); revalidatePath(`/governance/${id}`);
  return { ok: true, data: data as { ok: boolean; issues: unknown[] } };
}

export async function rollbackChange(id: string): Promise<ActionResult> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.rpc('erp_cfg_rollback', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/governance'); revalidatePath(`/governance/${id}`);
  return { ok: true };
}

export async function newVersion(id: string): Promise<ActionResult<{ id: string }>> {
  if (!(await ok())) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('erp_cfg_new_version', { p_id: id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath('/governance');
  return { ok: true, data: data as { id: string } };
}
