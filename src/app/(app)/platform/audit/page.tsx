import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { getPlatformContext, hasPlatformPermission } from '@/lib/erp/platform-context';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import type { Company } from '@/lib/erp/types';
import { getT } from '@/lib/i18n/server';
import { AuditLog, type AuditRow } from './audit-log';
import { DEFAULT_PAGE_SIZE, param, pageNumber, rangeFor, type SearchParams } from '@/lib/list-params';

export type AuditDateFilter = 'all' | 'today' | '7d' | '30d';

/** ISO cutoff for the date filter, or null for "all". */
function dateCutoff(filter: AuditDateFilter): string | null {
  if (filter === 'all') return null;
  const days = filter === 'today' ? 1 : filter === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

/** Audit log — server filters / sorts / paginates straight from `searchParams`,
 *  so the view is shareable, refresh-safe and deep-linkable. */
export default async function AuditLogPage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const { t } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  const pctx = await getPlatformContext();

  if (!ctx.isPlatformOwner && !ctx.isSuperAdmin && !hasPlatformPermission(pctx, 'access_audit_logs')) {
    return (
      <div>
        <PageHeader title={t('platform.audit.title')} />
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            {t('platform.ownerOrSuperAdminOnly')}
          </CardContent>
        </Card>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};
  const page = pageNumber(sp);
  const pageSize = DEFAULT_PAGE_SIZE;
  const q = (param(sp, 'q') ?? '').trim();
  const action = param(sp, 'action') ?? 'all';
  const entity = param(sp, 'entity') ?? 'all';
  const actor = param(sp, 'actor') ?? 'all';
  const dateRaw = param(sp, 'date');
  const date: AuditDateFilter =
    dateRaw === 'today' || dateRaw === '7d' || dateRaw === '30d' ? dateRaw : 'all';
  const event = param(sp, 'event') ?? null;

  const supabase = await createClient();

  let query = supabase
    .from('erp_audit_logs')
    .select('id, actor_email, company_id, action, entity, entity_id, details, created_at', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (action !== 'all') query = query.eq('action', action);
  if (entity !== 'all') query = query.eq('entity', entity);
  if (actor !== 'all') query = query.eq('actor_email', actor);
  const cutoff = dateCutoff(date);
  if (cutoff) query = query.gte('created_at', cutoff);
  if (q) {
    // search actor_email / entity / entity_id / details text (case-insensitive).
    const like = `%${q}%`;
    query = query.or(
      `actor_email.ilike.${like},entity.ilike.${like},entity_id.ilike.${like},details::text.ilike.${like}`,
    );
  }

  const [from, to] = rangeFor(page, pageSize);
  const [{ data: logs, count }, { data: companies }, distinct] = await Promise.all([
    query.range(from, to),
    supabase.from('erp_companies').select('id, name, name_ar'),
    // Distinct dropdown values from a bounded recent window (cheap; RLS-safe).
    supabase
      .from('erp_audit_logs')
      .select('action, entity, actor_email')
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const rows = (logs as AuditRow[]) ?? [];
  const total = count ?? rows.length;

  const companyNames: Record<string, string> = {};
  for (const c of (companies as Pick<Company, 'id' | 'name' | 'name_ar'>[]) ?? []) {
    companyNames[c.id] = c.name_ar || c.name;
  }

  const distinctRows = (distinct.data as { action: string; entity: string; actor_email: string | null }[]) ?? [];
  const actionOptions = Array.from(new Set(distinctRows.map((r) => r.action))).sort();
  const entityOptions = Array.from(new Set(distinctRows.map((r) => r.entity))).sort();
  const actorOptions = Array.from(
    new Set(distinctRows.map((r) => r.actor_email).filter((e): e is string => !!e)),
  ).sort();

  // Whether the deep-linked ?event= is on the current page (else: note shown).
  const eventInPage = event ? rows.some((r) => r.id === event) : true;

  return (
    <div>
      <PageHeader
        title={t('platform.audit.title')}
        description={t('platform.audit.description')}
      />
      <Suspense fallback={null}>
        <AuditLog
          rows={rows}
          companyNames={companyNames}
          total={total}
          page={page}
          pageSize={pageSize}
          filters={{ q, action, entity, actor, date }}
          options={{ actions: actionOptions, entities: entityOptions, actors: actorOptions }}
          event={event}
          eventInPage={eventInPage}
        />
      </Suspense>
    </div>
  );
}
