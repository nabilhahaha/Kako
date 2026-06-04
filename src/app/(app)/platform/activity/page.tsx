import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { ActivityFeed, type ActivityRow } from './activity-feed';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';

// ─────────────────────────────────────────────────────────────────────────────
// Activity Feed (READ-ONLY, INFORMATION surface).
//
// This is the friendly "what's happening across the platform" view for the
// platform owner: a calm, day-grouped chronological stream of human-readable
// sentences. It is deliberately DISTINCT from the forensic Audit Log
// (/platform/audit): the feed keeps filtering lean (period + entity + company +
// search) and offers no table / exhaustive forensic filtering. For deep forensic
// drill-down the feed cross-links to the Audit Log instead of duplicating it.
//
// Read-only: this screen only SELECTs from erp_audit_logs + erp_companies. It
// never writes, and adds no schema / RLS / business logic. RLS already grants
// the platform owner read access to all audit rows.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityDateScope = 'today' | '7d' | '30d' | 'all';

/** ISO cutoff for the date scope, or null for "all". Default scope is recent
 *  (Today) so the feed opens calm and current. */
function scopeCutoff(scope: ActivityDateScope): string | null {
  if (scope === 'all') return null;
  const days = scope === 'today' ? 1 : scope === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

export default async function ActivityFeedPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // Platform owner only — this is a cross-tenant vendor surface.
  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title={t('activity.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const page = pageNumber(sp);
  const pageSize = DEFAULT_PAGE_SIZE;
  const q = (param(sp, 'q') ?? '').trim();
  const entity = param(sp, 'entity') ?? 'all';
  const company = param(sp, 'company') ?? 'all';
  // Lean filters only (date + entity + company + search). `actor` / `action`
  // are accepted from the URL for forward-compat but are NOT surfaced as feed
  // controls — deep forensic filtering lives in the Audit Log.
  const actor = param(sp, 'actor') ?? 'all';
  const action = param(sp, 'action') ?? 'all';
  const dateRaw = param(sp, 'date');
  const scope: ActivityDateScope =
    dateRaw === '7d' || dateRaw === '30d' || dateRaw === 'all' ? dateRaw
      : dateRaw === 'today' ? 'today'
        : 'today'; // default = recent / Today

  const supabase = await createClient();

  // Columns verified against migration 0024_audit_logs.sql:
  // id, actor_id, actor_email, company_id, action, entity, entity_id, details, created_at.
  let query = supabase
    .from('erp_audit_logs')
    .select('id, actor_email, company_id, action, entity, entity_id, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (entity !== 'all') query = query.eq('entity', entity);
  if (company !== 'all') query = query.eq('company_id', company);
  if (actor !== 'all') query = query.eq('actor_email', actor);
  if (action !== 'all') query = query.eq('action', action);
  const cutoff = scopeCutoff(scope);
  if (cutoff) query = query.gte('created_at', cutoff);
  if (q) {
    const like = `%${q}%`;
    query = query.or(
      `actor_email.ilike.${like},entity.ilike.${like},entity_id.ilike.${like},details::text.ilike.${like}`,
    );
  }

  const [from, to] = rangeFor(page, pageSize);
  // Summary counts (today / this week) come from cheap exact head counts.
  const todayCutoff = new Date(Date.now() - 86_400_000).toISOString();
  const weekCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();

  const [
    { data: logs, count },
    { data: companies },
    distinct,
    { count: todayCount },
    { count: weekCount },
  ] = await Promise.all([
    // Server-side pagination (reuse 4.3): exact count + inclusive .range bounds.
    query.range(from, to),
    supabase.from('erp_companies').select('id, name, name_ar'),
    // Distinct filter values (entities + companies) from a bounded recent
    // window — cheap and RLS-safe, mirrors the Audit Log's approach.
    supabase
      .from('erp_audit_logs')
      .select('entity, company_id')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('erp_audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayCutoff),
    supabase
      .from('erp_audit_logs')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', weekCutoff),
  ]);

  const rows = (logs as ActivityRow[]) ?? [];
  const total = count ?? rows.length;

  const companyNames: Record<string, string> = {};
  for (const c of (companies as Pick<Company, 'id' | 'name' | 'name_ar'>[]) ?? []) {
    companyNames[c.id] = c.name_ar || c.name;
  }

  const distinctRows = (distinct.data as { entity: string; company_id: string | null }[]) ?? [];
  const entityOptions = Array.from(new Set(distinctRows.map((r) => r.entity))).sort();
  const companyOptions = Array.from(
    new Set(distinctRows.map((r) => r.company_id).filter((id): id is string => !!id)),
  )
    .map((id) => ({ id, name: companyNames[id] ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader title={t('activity.title')} description={t('activity.description')} />
      <Suspense fallback={null}>
        <ActivityFeed
          rows={rows}
          companyNames={companyNames}
          total={total}
          page={page}
          pageSize={pageSize}
          filters={{ q, entity, company, scope }}
          options={{ entities: entityOptions, companies: companyOptions }}
          summary={{ today: todayCount ?? 0, week: weekCount ?? 0 }}
        />
      </Suspense>
    </div>
  );
}
