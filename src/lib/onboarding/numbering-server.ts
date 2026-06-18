'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';
import { logAudit } from '@/lib/erp/audit';
import {
  DOC_TYPE_DEFS, currentFromNext, isNextNumberAllowed, nextFromCurrent,
  previewNumber, sanitizePrefix,
} from './numbering';

/**
 * Document Numbering — server actions over the existing `erp_sequences` (no new
 * tables). RLS already scopes sequences to the caller's branches
 * (`branch_id = ANY(erp_user_branch_ids())`); the action layer requires the
 * company-config capability (`settings.branches`) and audits writes.
 *
 * The issuing engine (erp_next_number) is untouched. Saving only sets a row's
 * prefix and counter, and the counter can never move below an already-issued
 * number — so historical document numbers can never be reused.
 */

interface Result<T = unknown> { ok: boolean; error?: string; data?: T }

async function guard() {
  const ctx = await getUserContext();
  if (!ctx) return { ctx: null as null, error: 'unauthorized' as const };
  if (!hasPermission(ctx, 'settings.branches')) return { ctx: null as null, error: 'unauthorized' as const };
  return { ctx, error: null };
}

export interface NumberingBranch { id: string; name: string; nameAr: string | null; code: string }

export interface NumberingRow {
  seqType: string;
  prefix: string;
  nextNumber: number;     // the number the next document will receive
  started: boolean;       // whether a sequence row already exists
  preview: string;        // PREFIX-BRANCHCODE-NNNNNN
}

export interface NumberingData {
  branches: NumberingBranch[];
  branchId: string | null;
  branchCode: string | null;
  rows: NumberingRow[];
}

/** Load the company's branches + the numbering rows for one branch (defaults to
 *  the first). Document types with no sequence yet are shown with engine
 *  defaults so the admin sees the full set. */
export async function loadNumbering(branchId?: string): Promise<Result<NumberingData>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  const supabase = await createClient();

  const { data: branchRows, error: bErr } = await supabase
    .from('erp_branches')
    .select('id, name, name_ar, code')
    .eq('company_id', ctx.companyId!)
    .order('name', { ascending: true });
  if (bErr) return { ok: false, error: bErr.message };

  const branches: NumberingBranch[] = ((branchRows as Record<string, unknown>[]) ?? []).map((r) => ({
    id: String(r.id), name: String(r.name), nameAr: (r.name_ar as string) ?? null, code: String(r.code ?? ''),
  }));
  if (branches.length === 0) return { ok: true, data: { branches: [], branchId: null, branchCode: null, rows: [] } };

  const selected = branches.find((b) => b.id === branchId) ?? branches[0];

  const { data: seqRows, error: sErr } = await supabase
    .from('erp_sequences')
    .select('seq_type, prefix, current_val')
    .eq('branch_id', selected.id);
  if (sErr) return { ok: false, error: sErr.message };

  const bySeq = new Map<string, { prefix: string; current_val: number }>();
  for (const r of (seqRows as Record<string, unknown>[] | null) ?? []) {
    bySeq.set(String(r.seq_type), { prefix: String(r.prefix), current_val: Number(r.current_val) });
  }

  const rows: NumberingRow[] = DOC_TYPE_DEFS.map((d) => {
    const existing = bySeq.get(d.key);
    const prefix = existing?.prefix ?? d.defaultPrefix;
    const nextNumber = nextFromCurrent(existing ? existing.current_val : null);
    return {
      seqType: d.key,
      prefix,
      nextNumber,
      started: Boolean(existing),
      preview: previewNumber(prefix, selected.code, nextNumber),
    };
  });

  return { ok: true, data: { branches, branchId: selected.id, branchCode: selected.code, rows } };
}

/** Save a document type's prefix + next number for a branch. Guards the counter
 *  so it can never reuse an already-issued number. */
export async function saveNumbering(input: {
  branchId: string;
  seqType: string;
  prefix: string;
  nextNumber: number;
}): Promise<Result<{ nextNumber: number; preview: string }>> {
  const { ctx, error } = await guard();
  if (!ctx) return { ok: false, error };
  if (!input.branchId) return { ok: false, error: 'missing branch' };
  if (!DOC_TYPE_DEFS.some((d) => d.key === input.seqType)) return { ok: false, error: 'unknown_type' };

  const def = DOC_TYPE_DEFS.find((d) => d.key === input.seqType)!;
  const prefix = sanitizePrefix(input.prefix) || def.defaultPrefix;

  const supabase = await createClient();

  // Confirm the branch belongs to the caller's company (defence in depth on top
  // of RLS) and fetch its code for the preview.
  const { data: branch, error: bErr } = await supabase
    .from('erp_branches')
    .select('id, code')
    .eq('id', input.branchId)
    .eq('company_id', ctx.companyId!)
    .maybeSingle();
  if (bErr) return { ok: false, error: bErr.message };
  if (!branch) return { ok: false, error: 'invalid branch' };

  // Existing counter (if any) — the floor for the new next number.
  const { data: existing, error: eErr } = await supabase
    .from('erp_sequences')
    .select('current_val')
    .eq('branch_id', input.branchId)
    .eq('seq_type', input.seqType)
    .maybeSingle();
  if (eErr) return { ok: false, error: eErr.message };

  const existingCurrent = existing ? Number((existing as { current_val: number }).current_val) : null;
  if (!isNextNumberAllowed(input.nextNumber, existingCurrent)) {
    return { ok: false, error: 'number_too_low' };
  }

  const newCurrent = currentFromNext(input.nextNumber);
  const { error: upErr } = await supabase
    .from('erp_sequences')
    .upsert(
      { branch_id: input.branchId, seq_type: input.seqType, prefix, current_val: newCurrent },
      { onConflict: 'branch_id,seq_type' },
    );
  if (upErr) return { ok: false, error: upErr.message };

  await logAudit(supabase, {
    action: 'update', entity: 'document_numbering', entityId: input.branchId,
    details: { seqType: input.seqType, prefix, nextNumber: input.nextNumber }, companyId: ctx.companyId,
  });
  revalidatePath('/settings/numbering');
  const code = String((branch as { code: string }).code ?? '');
  return { ok: true, data: { nextNumber: input.nextNumber, preview: previewNumber(prefix, code, input.nextNumber) } };
}
