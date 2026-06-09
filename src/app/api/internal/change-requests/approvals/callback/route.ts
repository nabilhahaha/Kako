// POST /api/internal/change-requests/approvals/callback — inbound external
// approval seam. An external system (email / ERP / government / API) returns a
// decision signed (HMAC-SHA256, CR_APPROVAL_SECRET) over a canonical payload. We
// verify the signature, map the task to its tenant, and RECORD the verified
// decision (service role). Driving the workflow engine from the recorded decision
// is the fast-follow (needs an engine external-principal mode). Flag-gated.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { CHANGE_REQUESTS_ENABLED } from '@/lib/change-requests';
import { verifyApprovalCallback, parseApprovalCallback } from '@/lib/change-requests/external';
import { getApprovalAdapter } from '@/lib/change-requests/registry';
import '@/lib/change-requests/adapters'; // register built-in adapters (email stub)

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!CHANGE_REQUESTS_ENABLED()) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const secret = process.env.CR_APPROVAL_SECRET;
  if (!secret) return NextResponse.json({ error: 'unconfigured' }, { status: 503 });

  const body = await req.json().catch(() => null);
  const parsed = parseApprovalCallback(body);
  if (!parsed) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { callback, signature } = parsed;

  // The adapter must be registered (extensibility seam) and the signature valid.
  if (!getApprovalAdapter(callback.adapter)) return NextResponse.json({ error: 'unknown_adapter' }, { status: 400 });
  if (!verifyApprovalCallback(callback, signature, secret)) {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  // Map the task to its tenant + workflow instance.
  const { data: task } = await db
    .from('erp_workflow_tasks')
    .select('id, company_id, instance_id')
    .eq('id', callback.taskId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: 'task_not_found' }, { status: 404 });
  const t = task as { id: string; company_id: string; instance_id: string };

  const { data: inst } = await db
    .from('erp_workflow_instances')
    .select('record_id')
    .eq('id', t.instance_id)
    .maybeSingle();

  const { error } = await db.from('erp_change_request_external_decisions').insert({
    company_id: t.company_id,
    task_id: t.id,
    instance_id: t.instance_id,
    request_id: (inst as { record_id: string } | null)?.record_id ?? null,
    decision: callback.decision,
    adapter: callback.adapter,
    comment: callback.comment ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, recorded: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export const GET = POST;
