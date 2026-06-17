'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { requireAuth, friendlyDbError, type ActionResult } from '@/lib/erp/guards';
import { hasPermission, type Permission } from '@/lib/erp/permissions';
import { getEntity } from '@/lib/erp/entities';
import { logAudit } from '@/lib/erp/audit';
import { ATTACHMENTS_BUCKET, validateAttachment, safeExtension, isFieldMediaEntity } from '@/lib/erp/attachments';

/** Generic attachments, reusable for any entity. Tenant isolation is enforced by
 *  RLS on erp_attachments + the storage bucket's company-prefix policy; manage
 *  rights map to the parent entity's own permission. */

/** The permission that gates attaching/deleting for an entity (registry first,
 *  then a small map for non-registry workflow entities). */
function entityPermission(entity: string): Permission | null {
  const reg = getEntity(entity)?.permission;
  if (reg) return reg;
  const fallback: Record<string, Permission> = {
    customer_change_request: 'customers.manage',
    credit_limit_request: 'customers.manage',
    customer_request: 'customer.request',
    workflow: 'workflow.manage',
    // Field-media-only entities (no registry record of their own): manage rights
    // map to the same field gate used to attach the evidence.
    van_load_confirmation: 'field.attach_media',
    sales_return: 'field.attach_media',
    merchandising_audit: 'field.attach_media',
    route_ride: 'field.attach_media',
  };
  return fallback[entity] ?? null;
}

export interface AttachmentView {
  id: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
  url: string | null;
  doc_type: string | null;
}

/** Active attachments for a record, each with a short-lived signed URL. */
export async function listAttachments(entity: string, recordId: string): Promise<AttachmentView[]> {
  const { ctx } = await requireAuth();
  if (!ctx || !entity || !recordId) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from('erp_attachments')
    .select('id, path, file_name, mime_type, size_bytes, uploaded_by, created_at, doc_type')
    .eq('entity', entity).eq('record_id', recordId).is('deleted_at', null)
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as (Omit<AttachmentView, 'url'> & { path: string })[];
  const out: AttachmentView[] = [];
  for (const r of rows) {
    const { data: signed } = await supabase.storage.from(ATTACHMENTS_BUCKET).createSignedUrl(r.path, 3600);
    out.push({ id: r.id, file_name: r.file_name, mime_type: r.mime_type, size_bytes: r.size_bytes, uploaded_by: r.uploaded_by, created_at: r.created_at, url: signed?.signedUrl ?? null, doc_type: r.doc_type });
  }
  return out;
}

export async function uploadAttachment(formData: FormData): Promise<ActionResult<{ id: string }>> {
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const entity = String(formData.get('entity') || '').trim();
  const recordId = String(formData.get('record_id') || '').trim();
  const file = formData.get('file');
  // Device-generated id of a queued offline photo — makes the upload idempotent.
  const clientRef = String(formData.get('client_ref') || '').trim() || null;
  // Optional document classification (e.g. cr_copy, vat_certificate) — the doc-type
  // tag is stored as-is here; CR-specific allowed-type policy lives in the CR layer.
  const docType = String(formData.get('doc_type') || '').trim() || null;
  if (!entity || !recordId || !(file instanceof File)) return { ok: false, error: 'missing' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };

  // Authorization: the entity's own manage permission, OR — for a field rep
  // attaching IMAGE evidence to a field entity (visit, van load confirmation,
  // variance, return, merchandising audit, route ride) — 'field.attach_media'.
  const perm = entityPermission(entity);
  const isFieldMedia = file.type.startsWith('image/') && isFieldMediaEntity(entity) && hasPermission(ctx, 'field.attach_media');
  if (perm && !hasPermission(ctx, perm) && !isFieldMedia) return { ok: false, error: 'forbidden' };

  const v = validateAttachment({ type: file.type, size: file.size });
  if (!v.ok) return { ok: false, error: v.error };

  const supabase = await createClient();

  // Change-request documents are authorized by READABILITY of the request itself
  // (RLS scopes it to the caller's company) — no separate permission needed.
  if (entity === 'change_request') {
    const { data: cr } = await supabase.from('erp_change_requests').select('id').eq('id', recordId).maybeSingle();
    if (!cr) return { ok: false, error: 'forbidden' };
  }

  // Idempotent retry: a media upload re-sent after a lost response is a no-op.
  if (clientRef) {
    const { data: dup } = await supabase
      .from('erp_attachments').select('id').eq('company_id', ctx.companyId).eq('client_ref', clientRef).maybeSingle();
    if (dup) return { ok: true, data: { id: (dup as { id: string }).id } };
  }

  const path = `${ctx.companyId}/${entity}/${recordId}/${randomUUID()}.${safeExtension(file.type, file.name)}`;
  const { error: upErr } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: upErr.message };

  const { data: row, error } = await supabase
    .from('erp_attachments')
    .insert({
      company_id: ctx.companyId, entity, record_id: recordId, bucket: ATTACHMENTS_BUCKET, path,
      file_name: file.name, mime_type: file.type, size_bytes: file.size, uploaded_by: ctx.userId,
      client_ref: clientRef, doc_type: docType,
    })
    .select('id').single();
  if (error) {
    await supabase.storage.from(ATTACHMENTS_BUCKET).remove([path]); // don't orphan the object
    return { ok: false, error: friendlyDbError(error) };
  }
  await logAudit(supabase, { action: 'attachment.upload', entity, entityId: recordId, companyId: ctx.companyId, details: { attachment_id: (row as { id: string }).id, file_name: file.name } });
  return { ok: true, data: { id: (row as { id: string }).id } };
}

/** Soft-delete (keeps the object; a retention job purges later). Manage rights =
 *  the parent entity's permission (locked decision). */
export async function softDeleteAttachment(id: string): Promise<ActionResult> {
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const { data: att } = await supabase
    .from('erp_attachments')
    .select('entity, record_id, company_id')
    .eq('id', id).is('deleted_at', null).maybeSingle();
  if (!att) return { ok: false, error: 'not_found' };
  const a = att as { entity: string; record_id: string; company_id: string };
  const perm = entityPermission(a.entity);
  if (perm && !hasPermission(ctx, perm)) return { ok: false, error: 'forbidden' };

  const { error } = await supabase
    .from('erp_attachments')
    .update({ deleted_at: new Date().toISOString(), deleted_by: ctx.userId })
    .eq('id', id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  await logAudit(supabase, { action: 'attachment.delete', entity: a.entity, entityId: a.record_id, companyId: a.company_id, details: { attachment_id: id } });
  return { ok: true };
}
