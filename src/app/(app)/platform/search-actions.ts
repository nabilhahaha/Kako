'use server';

import { createClient } from '@/lib/supabase/server';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';

/** One company hit for the command palette. */
export interface CompanyHit {
  id: string;
  name: string;
  name_ar: string | null;
  slug: string | null;
}

/** One user hit for the command palette. `companyId` is a best-effort mapping
 *  (user → branch → company) used only for routing; may be null. */
export interface UserHit {
  id: string;
  full_name: string | null;
  email: string | null;
  companyId: string | null;
}

/** One audit-event hit. Carries the raw shape `describeAuditEvent()` needs,
 *  plus the resolved company name (for the readable sentence) and timestamp. */
export interface AuditHit {
  id: string;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  company_id: string | null;
  companyName: string | null;
  created_at: string;
}

/** One pending approval hit (workflow task → instance). `companyId` routes to
 *  the related company; `entity`/`recordLabel` describe what awaits approval. */
export interface ApprovalHit {
  id: string;
  entity: string;
  recordId: string;
  recordLabel: string;
  companyId: string | null;
  createdAt: string;
}

export interface SearchResult {
  companies: CompanyHit[];
  users: UserHit[];
  audit: AuditHit[];
  approvals: ApprovalHit[];
}

const EMPTY: SearchResult = { companies: [], users: [], audit: [], approvals: [] };

/** Escape PostgREST `ilike` wildcards so a literal % or _ in the query isn't
 *  treated as a pattern. Commas are stripped because `or()` is comma-delimited. */
function sanitize(raw: string): string {
  return raw.replace(/[%_,()]/g, ' ').trim().slice(0, 64);
}

/**
 * Relevance rank for a row against the (already-sanitized) query term.
 * Lower = better: 0 exact, 1 startsWith, 2 contains, 3 no match. Compares the
 * term case-insensitively against the row's candidate fields (name/email/slug).
 * Used to re-order the `ilike` result set so exact matches surface first.
 */
function matchRank(term: string, fields: (string | null | undefined)[]): number {
  const q = term.toLowerCase();
  let best = 3;
  for (const f of fields) {
    if (!f) continue;
    const v = f.toLowerCase();
    if (v === q) return 0;
    if (v.startsWith(q)) best = Math.min(best, 1);
    else if (v.includes(q)) best = Math.min(best, 2);
  }
  return best;
}

/** Raw row shapes for the optional audit / approvals queries. */
type AuditRow = {
  id: string;
  actor_email: string | null;
  company_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};
type InstanceRow = {
  id: string;
  entity: string;
  record_id: string;
  company_id: string | null;
  created_at: string;
};

/**
 * READ-ONLY global search for the platform-owner area. RLS scopes the rows to
 * what the session may see (platform owner sees all). Returns at most ~6
 * companies and ~6 users (≤12 rows total). No writes, no mutations.
 */
export async function searchPlatform(query: string): Promise<SearchResult> {
  const term = sanitize(query ?? '');
  if (term.length < 1) return EMPTY;

  // Gate: only platform staff/owner with company-view access may search here.
  const pctx = await getPlatformContext();
  if (!hasPlatformPermission(pctx, 'view_companies')) return EMPTY;

  const supabase = await createClient();
  const like = `%${term}%`;

  // Audit + approvals are gated behind their own permission so we don't leak
  // sensitive operations to staff who can only view companies. (Owner passes
  // via hasPlatformPermission's owner short-circuit.)
  const canSeeAudit = hasPlatformPermission(pctx, 'access_audit_logs');

  const [companiesRes, usersRes, auditRes, instancesRes] = await Promise.all([
    supabase
      .from('erp_companies')
      .select('id, name, name_ar, slug')
      .or(`name.ilike.${like},name_ar.ilike.${like},slug.ilike.${like}`)
      .order('name', { ascending: true })
      .limit(6),
    supabase
      .from('erp_profiles')
      .select('id, full_name, email')
      .or(`full_name.ilike.${like},email.ilike.${like}`)
      .order('full_name', { ascending: true })
      .limit(6),
    // Audit events (erp_audit_logs, migration 0024): ilike on actor/entity/details-id.
    canSeeAudit
      ? supabase
          .from('erp_audit_logs')
          .select('id, actor_email, company_id, action, entity, entity_id, details, created_at')
          .or(`actor_email.ilike.${like},entity.ilike.${like},entity_id.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as AuditRow[] }),
    // Pending approvals (erp_workflow_instances, migration 0088): match entity/record_id.
    canSeeAudit
      ? supabase
          .from('erp_workflow_instances')
          .select('id, entity, record_id, company_id, created_at')
          .eq('status', 'pending')
          .or(`entity.ilike.${like},record_id.ilike.${like}`)
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as InstanceRow[] }),
  ]);

  // Exact-match-first ranking: re-order the ilike result set so that exact
  // (case-insensitive) matches rank above startsWith, then contains, then the
  // DB's alphabetical order. Limits are already applied by the queries above.
  const companies: CompanyHit[] = (companiesRes.data ?? [])
    .map((c) => ({
      id: c.id,
      name: c.name,
      name_ar: c.name_ar,
      slug: c.slug,
    }))
    .map((c, i) => ({ c, i, rank: matchRank(term, [c.name, c.name_ar, c.slug]) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.c);

  const profiles = ((usersRes.data ?? []) as { id: string; full_name: string | null; email: string | null }[])
    .map((p, i) => ({ p, i, rank: matchRank(term, [p.full_name, p.email]) }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map((x) => x.p);

  // Best-effort user → company mapping (for routing to Company 360 #section-users).
  const companyByUser = new Map<string, string>();
  if (profiles.length > 0) {
    const userIds = profiles.map((p) => p.id);
    const { data: userBranches } = await supabase
      .from('erp_user_branches')
      .select('user_id, branch_id')
      .in('user_id', userIds);
    const branchIds = [...new Set((userBranches ?? []).map((ub) => ub.branch_id))];
    const branchToCompany = new Map<string, string>();
    if (branchIds.length > 0) {
      const { data: branches } = await supabase
        .from('erp_branches')
        .select('id, company_id')
        .in('id', branchIds);
      for (const b of (branches ?? []) as { id: string; company_id: string }[]) {
        branchToCompany.set(b.id, b.company_id);
      }
    }
    for (const ub of (userBranches ?? []) as { user_id: string; branch_id: string }[]) {
      if (companyByUser.has(ub.user_id)) continue;
      const cid = branchToCompany.get(ub.branch_id);
      if (cid) companyByUser.set(ub.user_id, cid);
    }
  }

  const users: UserHit[] = profiles.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    companyId: companyByUser.get(p.id) ?? null,
  }));

  const auditRows = (auditRes.data ?? []) as AuditRow[];
  const instanceRows = (instancesRes.data ?? []) as InstanceRow[];

  // Resolve company names for audit sentences + approval routing labels.
  const companyIds = [
    ...new Set(
      [...auditRows, ...instanceRows]
        .map((r) => r.company_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const companyNameById = new Map<string, string>();
  if (companyIds.length > 0) {
    const { data: cos } = await supabase
      .from('erp_companies')
      .select('id, name, name_ar')
      .in('id', companyIds);
    for (const c of (cos ?? []) as { id: string; name: string; name_ar: string | null }[]) {
      companyNameById.set(c.id, c.name_ar || c.name);
    }
  }

  const audit: AuditHit[] = auditRows.map((r) => ({
    id: r.id,
    actor_email: r.actor_email,
    action: r.action,
    entity: r.entity,
    entity_id: r.entity_id,
    details: r.details,
    company_id: r.company_id,
    companyName: r.company_id ? companyNameById.get(r.company_id) ?? null : null,
    created_at: r.created_at,
  }));

  // Resolve nicer labels for customer-entity approvals (mirrors approvals page).
  const customerIds = instanceRows
    .filter((r) => r.entity === 'customer')
    .map((r) => r.record_id);
  const customerNameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const { data: cust } = await supabase
      .from('erp_customers')
      .select('id, name, name_ar')
      .in('id', customerIds);
    for (const c of (cust ?? []) as { id: string; name: string; name_ar: string | null }[]) {
      customerNameById.set(c.id, c.name_ar || c.name);
    }
  }

  const approvals: ApprovalHit[] = instanceRows.map((r) => ({
    id: r.id,
    entity: r.entity,
    recordId: r.record_id,
    recordLabel:
      (r.entity === 'customer' ? customerNameById.get(r.record_id) : '') || r.record_id,
    companyId: r.company_id,
    createdAt: r.created_at,
  }));

  return { companies, users, audit, approvals };
}
