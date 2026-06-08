import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { MOBILE_ENABLED } from '@/lib/offline-sync';
import { uploadAttachment } from '@/app/(app)/attachments/actions';

// Offline media intake — POST /api/internal/offline-media (multipart). Uploads a
// queued field photo and attaches it to the rep's SYNCED visit for the given
// customer + day. If the visit hasn't synced yet, responds {status:'pending'} so
// the device retries later (two-stage: visit first, then its media). Idempotent
// via client_ref. Reuses uploadAttachment (validation + storage + RLS insert).
// Flag-gated KAKO_MOBILE.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!MOBILE_ENABLED()) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.companyId) return NextResponse.json({ error: 'no company' }, { status: 400 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'bad request' }, { status: 400 });
  const customerId = String(form.get('customer_id') || '').trim();
  const visitDate = String(form.get('visit_date') || '').trim();
  const clientRef = String(form.get('client_ref') || '').trim();
  const file = form.get('file');
  if (!customerId || !visitDate || !clientRef || !(file instanceof File)) {
    return NextResponse.json({ error: 'missing' }, { status: 400 });
  }

  // Resolve the rep's synced visit for this customer + day (RLS-scoped). If it
  // hasn't arrived yet, ask the device to retry after the visit syncs.
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

  // Reuse the generic uploader: validates (type/size), stores, inserts the
  // erp_attachments row (idempotent on client_ref), checks field.attach_media.
  const fd = new FormData();
  fd.append('entity', 'visit');
  fd.append('record_id', (visit as { id: string }).id);
  fd.append('client_ref', clientRef);
  fd.append('file', file, (file as File).name);
  const res = await uploadAttachment(fd);
  if (!res.ok) return NextResponse.json({ status: 'failed', error: res.error }, { status: 422 });
  return NextResponse.json({ status: 'uploaded', id: res.data?.id });
}
