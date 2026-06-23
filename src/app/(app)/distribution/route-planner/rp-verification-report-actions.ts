'use server';

// ============================================================================
// FV-4b — Field Customer Verification REPORTS (read-only; no new schema). Three reports:
//   * Summary   — per-rep assigned / completed / remaining / % + last activity
//   * Detail    — every verification with old→new values, distance, radius-in-force, photos
//   * Exception — logged attempts that did NOT verify (outside_radius / not_assigned / …)
//
// All data comes from existing tables; row visibility is enforced by RLS:
//   admin → all company rows · supervisor → team via rp_can_see_user(rep) · rep → own.
// Company-scoped queries everywhere. Gated to admin OR reports.view (reps don't see the tab).
// ============================================================================

import { createClient } from '@/lib/supabase/server';
import { getUserContext } from '@/lib/erp/auth-context';
import { hasPermission } from '@/lib/erp/permissions';

type ResultD<T> = { ok: true; data: T } | { ok: false; error: string };

const CAP = 5000;

export interface RepSummary {
  repId: string | null; repName: string; repEmail: string;
  assigned: number; completed: number; remaining: number; pct: number;
  lastActivity: number | null;   // epoch ms of last verification
}
export interface SummaryReport {
  reps: RepSummary[];
  totals: { assigned: number; completed: number; remaining: number; pct: number };
}
export interface DetailRow {
  id: string; customerCode: string | null; customerName: string; repName: string;
  verifiedAt: number;
  oldCity: string | null; newCity: string | null;
  oldChannel: string | null; newChannel: string | null;
  oldPhone: string | null; newPhone: string | null;
  distanceM: number | null; allowedRadiusM: number | null; photoCount: number; notes: string | null;
}
export interface ExceptionRow {
  id: string; createdAt: number; repName: string;
  customerCode: string | null; customerName: string | null;
  result: string; reason: string | null;
  distanceM: number | null; allowedRadiusM: number | null;
}

function canViewReports(ctx: NonNullable<Awaited<ReturnType<typeof getUserContext>>>): boolean {
  return ctx.isPlatformOwner || ctx.isSuperAdmin || ctx.topRole === 'admin' || hasPermission(ctx, 'reports.view');
}
async function reportCtx() {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { err: 'err_unauthorized' as const, ctx: null };
  if (!canViewReports(ctx)) return { err: 'err_forbidden' as const, ctx: null };
  return { err: null, ctx };
}

/** Whether to show the reports tab (admin or reports.view). */
export async function getVerificationReportAccess(): Promise<ResultD<{ canView: boolean }>> {
  const ctx = await getUserContext();
  if (!ctx?.companyId) return { ok: true, data: { canView: false } };
  return { ok: true, data: { canView: canViewReports(ctx) } };
}

/** Map rep ids + salesman emails → display names (one round-trip). */
async function nameMaps(sb: Awaited<ReturnType<typeof createClient>>, repIds: string[], emails: string[]) {
  const byId = new Map<string, { name: string; email: string }>();
  const byEmail = new Map<string, { id: string; name: string }>();
  const ids = [...new Set(repIds.filter(Boolean))];
  const mails = [...new Set(emails.filter(Boolean))];
  if (ids.length) {
    const { data } = await sb.from('erp_profiles').select('id, full_name, email').in('id', ids);
    for (const p of data ?? []) byId.set(p.id as string, { name: (p.full_name as string) || (p.email as string) || (p.id as string), email: (p.email as string | null) ?? '' });
  }
  if (mails.length) {
    const { data } = await sb.from('erp_profiles').select('id, full_name, email').in('email', mails);
    for (const p of data ?? []) if (p.email) byEmail.set(p.email as string, { id: p.id as string, name: (p.full_name as string) || (p.email as string) });
  }
  return { byId, byEmail };
}

/** Per-rep progress + company totals. Assigned counts come from dataset_customers.salesman;
 *  completed from verifications. RLS scopes both to the caller's visibility. */
export async function getVerificationSummary(): Promise<ResultD<SummaryReport>> {
  const { err, ctx } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();

  const { data: custs, error: e1 } = await sb.from('erp_rp_dataset_customers')
    .select('id, salesman').eq('company_id', ctx.companyId).limit(20000);
  if (e1) return { ok: false, error: e1.message };
  const { data: verifs, error: e2 } = await sb.from('erp_rp_customer_verifications')
    .select('rep_id, verified_at').eq('company_id', ctx.companyId).limit(20000);
  if (e2) return { ok: false, error: e2.message };

  const { byId, byEmail } = await nameMaps(sb,
    (verifs ?? []).map((v) => v.rep_id as string),
    (custs ?? []).map((c) => c.salesman as string));

  // assigned per rep email
  const assignedByEmail = new Map<string, number>();
  for (const c of custs ?? []) {
    const email = (c.salesman as string | null)?.trim();
    if (!email) continue;
    assignedByEmail.set(email, (assignedByEmail.get(email) ?? 0) + 1);
  }
  // completed per rep email (rep_id → email)
  const completedByEmail = new Map<string, number>();
  const lastByEmail = new Map<string, number>();
  for (const v of verifs ?? []) {
    const info = byId.get(v.rep_id as string);
    const email = info?.email?.trim();
    if (!email) continue;
    completedByEmail.set(email, (completedByEmail.get(email) ?? 0) + 1);
    const ts = new Date(v.verified_at as string).getTime();
    lastByEmail.set(email, Math.max(lastByEmail.get(email) ?? 0, ts));
  }

  const emails = [...new Set([...assignedByEmail.keys(), ...completedByEmail.keys()])];
  const reps: RepSummary[] = emails.map((email) => {
    const assigned = assignedByEmail.get(email) ?? 0;
    const completed = completedByEmail.get(email) ?? 0;
    const remaining = Math.max(0, assigned - completed);
    const prof = byEmail.get(email);
    return {
      repId: prof?.id ?? null, repName: prof?.name ?? email, repEmail: email,
      assigned, completed, remaining,
      pct: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
      lastActivity: lastByEmail.get(email) ?? null,
    };
  }).sort((a, b) => b.completed - a.completed || a.repName.localeCompare(b.repName));

  const tAssigned = reps.reduce((s, r) => s + r.assigned, 0);
  const tCompleted = reps.reduce((s, r) => s + r.completed, 0);
  return {
    ok: true,
    data: {
      reps,
      totals: {
        assigned: tAssigned, completed: tCompleted, remaining: Math.max(0, tAssigned - tCompleted),
        pct: tAssigned > 0 ? Math.round((tCompleted / tAssigned) * 100) : 0,
      },
    },
  };
}

/** Every verification (RLS-scoped), newest first, with old→new + distance + radius + photos. */
export async function getVerificationDetail(): Promise<ResultD<{ rows: DetailRow[] }>> {
  const { err, ctx } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_customer_verifications')
    .select('id, customer_code, customer_name, rep_id, verified_at, old_city, new_city, old_channel, new_channel, old_phone, new_phone, distance_m, allowed_radius_m, outside_photo, inside_photos, notes')
    .eq('company_id', ctx.companyId).order('verified_at', { ascending: false }).limit(CAP);
  if (error) return { ok: false, error: error.message };
  const { byId } = await nameMaps(sb, (data ?? []).map((r) => r.rep_id as string), []);
  const rows: DetailRow[] = (data ?? []).map((r) => ({
    id: r.id as string,
    customerCode: (r.customer_code as string | null) ?? null, customerName: (r.customer_name as string) ?? '',
    repName: byId.get(r.rep_id as string)?.name ?? '—',
    verifiedAt: new Date(r.verified_at as string).getTime(),
    oldCity: (r.old_city as string | null) ?? null, newCity: (r.new_city as string | null) ?? null,
    oldChannel: (r.old_channel as string | null) ?? null, newChannel: (r.new_channel as string | null) ?? null,
    oldPhone: (r.old_phone as string | null) ?? null, newPhone: (r.new_phone as string | null) ?? null,
    distanceM: (r.distance_m as number | null) ?? null, allowedRadiusM: (r.allowed_radius_m as number | null) ?? null,
    photoCount: (r.outside_photo ? 1 : 0) + ((r.inside_photos as unknown[] | null)?.length ?? 0),
    notes: (r.notes as string | null) ?? null,
  }));
  return { ok: true, data: { rows } };
}

/** Logged attempts that did NOT verify (the exception report). RLS-scoped, newest first. */
export async function getVerificationExceptions(): Promise<ResultD<{ rows: ExceptionRow[] }>> {
  const { err, ctx } = await reportCtx();
  if (err) return { ok: false, error: err };
  const sb = await createClient();
  const { data, error } = await sb.from('erp_rp_verification_attempts')
    .select('id, created_at, rep_id, customer_id, result, reason, distance_m, allowed_radius_m')
    .eq('company_id', ctx.companyId).neq('result', 'verified')
    .order('created_at', { ascending: false }).limit(CAP);
  if (error) return { ok: false, error: error.message };
  const rowsRaw = data ?? [];

  const { byId } = await nameMaps(sb, rowsRaw.map((r) => r.rep_id as string), []);
  // best-effort customer name/code (RLS may hide dataset_customers from some supervisors)
  const custIds = [...new Set(rowsRaw.map((r) => r.customer_id as string | null).filter((x): x is string => !!x))];
  const custMap = new Map<string, { code: string | null; name: string }>();
  if (custIds.length) {
    const { data: cs } = await sb.from('erp_rp_dataset_customers').select('id, code, name').in('id', custIds);
    for (const c of cs ?? []) custMap.set(c.id as string, { code: (c.code as string | null) ?? null, name: (c.name as string) ?? '' });
  }
  const rows: ExceptionRow[] = rowsRaw.map((r) => {
    const cust = r.customer_id ? custMap.get(r.customer_id as string) : undefined;
    return {
      id: r.id as string, createdAt: new Date(r.created_at as string).getTime(),
      repName: byId.get(r.rep_id as string)?.name ?? '—',
      customerCode: cust?.code ?? null, customerName: cust?.name ?? null,
      result: r.result as string, reason: (r.reason as string | null) ?? null,
      distanceM: (r.distance_m as number | null) ?? null, allowedRadiusM: (r.allowed_radius_m as number | null) ?? null,
    };
  });
  return { ok: true, data: { rows } };
}
