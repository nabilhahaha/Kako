'use server';

import { createClient } from '@/lib/supabase/server';
import { requireAuth, type ActionResult } from '@/lib/erp/guards';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { getChangeRequestEntity } from '@/lib/change-requests/registry-server';
import { uploadAttachment } from '@/app/(app)/attachments/actions';

/** Attach a supporting document (CR copy, VAT cert, contract, …) to a change
 *  request. Reuses the generic attachment pipeline; the only added policy is that
 *  the doc type must be one the entity accepts. Authorization is the request's own
 *  readability (RLS), enforced inside uploadAttachment. Flag-gated. */
export async function attachChangeRequestDocument(formData: FormData): Promise<ActionResult<{ id: string }>> {
  if (!CHANGE_REQUESTS_ENABLED()) return { ok: false, error: 'disabled' };
  const { ctx } = await requireAuth();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  if (!ctx.companyId) return { ok: false, error: 'no_company' };

  const requestId = String(formData.get('request_id') || '').trim();
  const docType = String(formData.get('doc_type') || '').trim();
  const file = formData.get('file');
  if (!requestId || !(file instanceof File)) return { ok: false, error: 'missing' };

  const supabase = await createClient();
  const { data: cr } = await supabase.from('erp_change_requests').select('entity_key').eq('id', requestId).maybeSingle();
  if (!cr) return { ok: false, error: 'not_found' };

  // Doc type must be one the entity accepts (when it declares a whitelist).
  if (docType) {
    const entity = await getChangeRequestEntity(supabase, (cr as { entity_key: string }).entity_key, ctx.companyId);
    if (entity && entity.attachmentTypes.length > 0 && !entity.attachmentTypes.includes(docType)) {
      return { ok: false, error: 'doc_type_not_allowed' };
    }
  }

  const fd = new FormData();
  fd.append('entity', 'change_request');
  fd.append('record_id', requestId);
  if (docType) fd.append('doc_type', docType);
  fd.append('file', file, file.name);
  return uploadAttachment(fd);
}
