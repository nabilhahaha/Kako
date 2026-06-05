'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { isKnownEntity } from '@/lib/erp/entities';
import { logAudit } from '@/lib/erp/audit';

/** ── Entity Framework: generic Notes actions ───────────────────────────────
 *
 * Build-once capability: these work for ANY registered entity via (entity,
 * record_id). A module gets notes by dropping <EntityNotes entity=… recordId=…/>
 * — no per-module action code. RLS scopes everything to the caller's company.
 */

export interface EntityNote {
  id: string;
  body: string;
  created_at: string;
  created_by: string | null;
  author_name: string | null;
}
interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

export async function listEntityNotes(entity: string, recordId: string): Promise<Result<EntityNote[]>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!isKnownEntity(entity)) return { ok: false, error: 'unknown entity' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_entity_notes')
    .select('id, body, created_at, created_by, author:erp_profiles(full_name)')
    .eq('entity', entity)
    .eq('record_id', recordId)
    .order('created_at', { ascending: false });
  if (error) return { ok: false, error: error.message };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (data ?? []).map((r: any) => ({
    id: r.id, body: r.body, created_at: r.created_at, created_by: r.created_by,
    author_name: r.author?.full_name ?? null,
  })) as EntityNote[];
  return { ok: true, data: rows };
}

export async function addEntityNote(entity: string, recordId: string, body: string): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!isKnownEntity(entity)) return { ok: false, error: 'unknown entity' };
  const text = body.trim();
  if (!text) return { ok: false, error: 'empty' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('erp_entity_notes')
    .insert({ entity, record_id: recordId, body: text, created_by: ctx.userId });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function deleteEntityNote(id: string): Promise<Result> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { error } = await supabase.from('erp_entity_notes').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };
  await logAudit(supabase, { action: 'delete', entity: 'entity_note', entityId: id, companyId: ctx.companyId });
  revalidatePath('/', 'layout');
  return { ok: true };
}
