import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { isFieldMediaEntity } from '@/lib/erp/attachments';
import { uploadAttachment } from '@/app/(app)/attachments/actions';

// Offline media intake — POST /api/internal/offline-media (multipart). Uploads a
// queued field photo through ONE pipeline with two targets:
//   • Direct entity (reference_type + reference_id) — van load confirmations,
//     variance evidence, returns, merchandising audits, route riding. Attaches
//     straight to that record (allowlisted field-media entities only).
//   • Visit (customer_id + visit_date) — resolves the rep's SYNCED visit; if it
//     hasn't synced yet, responds {status:'pending'} so the device retries later
//     (two-stage: visit first, then its media).
// Idempotent via client_ref. Reuses uploadAttachment (validation + storage + RLS
// insert + field.attach_media authz). Flag-gated KAKO_MOBILE.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hand a resolved (entity, record) to the generic uploader. */
async function attach(entity: string, recordId: string, clientRef: string, file: File) {
  const fd = new FormData();
  fd.append('entity', entity);
  fd.append('record_id', recordId);
  fd.append('client_ref', clientRef);
  fd.append('file', file, file.name);
  const res = await uploadAttachment(fd);
  if (!res.ok) return NextResponse.json({ status: 'failed', error: res.error }, { status: 422 });
  return NextResponse.json({ status: 'uploaded', id: res.data?.id });
}

export async function POST(req: NextRequest) {
  if (!MOBILE_ENABLED()) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.companyId) return NextResponse.json({ error: 'no company' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const clientRef = String(form.get('client_ref') || '').trim();
  const file = form.get('file');
  if (!clientRef || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing' }, { status: 400 });
  }

  // Direct-entity target: attach straight to the record. The reference type must
  // be an allowlisted field-media entity (trust boundary); uploadAttachment then
  // enforces field.attach_media + type/size validation.
  const referenceType = String(form.get('reference_type') || '').trim();
  const referenceId = String(form.get('reference_id') || '').trim();
  if (referenceType || referenceId) {
    if (!referenceType || !referenceId) return NextResponse.json({ error: 'missing' }, { status: 400 });
    if (!isFieldMediaEntity(referenceType)) return NextResponse.json({ status: 'failed', error: 'entity_not_allowed' }, { status: 422 });
    return attach(referenceType, referenceId, clientRef, file);
  }

  // Visit target: resolve the rep's synced visit for this customer + day
  // (RLS-scoped). If it hasn't arrived yet, retry after the visit syncs.
  const customerId = String(form.get('customer_id') || '').trim();
  const visitDate = String(form.get('visit_date') || '').trim();
  if (!customerId || !visitDate) return NextResponse.json({ error: 'missing' }, { status: 400 });

  const supabase = await createClient();
  const { data: visit } = await supabase
    .from('erp_visits')
    .select('id')
    .eq('salesman_id', ctx.userId)
    .eq('customer_id', customerId)
    .eq('visit_date', visitDate)
    .order('check_in_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!visit) return NextResponse.json({ status: 'pending' });

  return attach('visit', (visit as { id: string }).id, clientRef, file);
}
