// GET/POST /api/internal/audit-retention — audit log retention sweep (Step 2
// hardening). Deletes erp_audit_logs older than AUDIT_RETENTION_DAYS via the
// guarded SECURITY DEFINER function. NON-DESTRUCTIVE BY DEFAULT: with no
// AUDIT_RETENTION_DAYS configured it is a clean no-op (skipped). Cron-auth
// (CRON_SECRET) + service role. Daily pg_dump backups cover archival.
import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { log, alert } from '@/lib/observability';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Non-destructive default: do nothing unless an operator opts in with a window.
  const raw = process.env.AUDIT_RETENTION_DAYS;
  const keepDays = Number(raw);
  if (!raw || !Number.isFinite(keepDays) || keepDays < 1) {
    return NextResponse.json({ skipped: 'not_configured' });
  }

  let db;
  try { db = createServiceClient(); } catch {
    return NextResponse.json({ error: 'unconfigured' }, { status: 503 });
  }

  const { data, error } = await db.rpc('erp_purge_audit_logs', { p_keep_days: Math.floor(keepDays) });
  if (error) {
    await alert('audit_retention.failed', 'critical', { route: 'audit-retention', error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  log.info('audit_retention.swept', { keepDays: Math.floor(keepDays), deleted: data ?? 0 });
  return NextResponse.json({ ok: true, keepDays: Math.floor(keepDays), deleted: data ?? 0 });
}

export async function POST(req: NextRequest) { return handle(req); }
export async function GET(req: NextRequest) { return handle(req); }
