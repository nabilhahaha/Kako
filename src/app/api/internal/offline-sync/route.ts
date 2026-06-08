import { NextRequest, NextResponse } from 'next/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { MOBILE_ENABLED, isApplicable, dedupeMutations, type OfflineMutation, type SyncStatus } from '@/lib/offline-sync';

// Offline sync intake — POST /api/internal/offline-sync. Receives a batch of
// queued field mutations from the PWA, records each EXACTLY-ONCE in
// erp_offline_mutations (unique company_id+idempotency_key), AUTO-APPLIES the safe
// whitelist (apply.ts) server-side, and updates the device session. Company-scoped
// via the caller's session. Flag-gated KAKO_MOBILE.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  deviceId?: string; appVersion?: string; platform?: string; lat?: number; lng?: number;
  mutations?: OfflineMutation[];
}

export async function POST(req: NextRequest) {
  if (!MOBILE_ENABLED()) return NextResponse.json({ error: 'disabled' }, { status: 404 });

  const ctx = await getUserContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!ctx.companyId) return NextResponse.json({ error: 'no company' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Body;
  const deviceId = (body.deviceId ?? '').trim();
  const mutations = Array.isArray(body.mutations) ? body.mutations : [];
  const supabase = await createClient();

  // Device session audit (upsert one row per company/device/user).
  if (deviceId) {
    await supabase.from('erp_device_sessions').upsert({
      company_id: ctx.companyId, user_id: ctx.userId, device_id: deviceId,
      app_version: body.appVersion ?? null, platform: body.platform ?? null,
      last_sync_at: new Date().toISOString(), last_lat: body.lat ?? null, last_lng: body.lng ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,device_id,user_id' });
  }

  const results: { idempotencyKey: string; status: SyncStatus }[] = [];

  for (const m of dedupeMutations(mutations)) {
    // Exactly-once: if already recorded, return its status without re-applying.
    const { data: existing } = await supabase
      .from('erp_offline_mutations')
      .select('status').eq('company_id', ctx.companyId).eq('idempotency_key', m.idempotencyKey).maybeSingle();
    if (existing) { results.push({ idempotencyKey: m.idempotencyKey, status: existing.status as SyncStatus }); continue; }

    let status: SyncStatus = 'pending';
    let conflictReason: string | null = null;

    if (isApplicable(m.entity, m.operation)) {
      const applied = await applyMutation(supabase, ctx.companyId, m);
      status = applied.ok ? 'applied' : 'rejected';
      conflictReason = applied.reason ?? null;
    }

    await supabase.from('erp_offline_mutations').insert({
      company_id: ctx.companyId, device_id: m.deviceId || deviceId, user_id: ctx.userId,
      idempotency_key: m.idempotencyKey, entity: m.entity, entity_id: m.entityId ?? null,
      operation: m.operation, payload: m.payload, base_version: m.baseVersion ?? null,
      client_seq: m.clientSeq, client_ts: m.clientTs, status,
      applied_at: status === 'applied' ? new Date().toISOString() : null, conflict_reason: conflictReason,
    });

    results.push({ idempotencyKey: m.idempotencyKey, status });
  }

  return NextResponse.json({ results });
}

type Db = Awaited<ReturnType<typeof createClient>>;

// Apply a whitelisted mutation server-side. Additive + idempotent only.
async function applyMutation(db: Db, companyId: string, m: OfflineMutation): Promise<{ ok: boolean; reason?: string }> {
  if (m.entity === 'van_expense' && m.operation === 'create') {
    const p = m.payload as { amount?: unknown; categoryId?: string; warehouseId?: string; notes?: string; expenseDate?: string };
    const amount = Number(p.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, reason: 'invalid amount' };
    const { error } = await db.from('erp_van_expenses').insert({
      company_id: companyId, warehouse_id: p.warehouseId ?? null, category_id: p.categoryId ?? null,
      amount, notes: p.notes ?? null, expense_date: p.expenseDate ?? new Date().toISOString().slice(0, 10),
    });
    return error ? { ok: false, reason: error.message } : { ok: true };
  }
  return { ok: false, reason: 'no handler' };
}
