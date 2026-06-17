'use server';

/** ── VANTORA Help Copilot — server actions (V1, fully deterministic) ─────────
 *
 *  Thin server wrappers around the pure deterministic engine. The engine only
 *  reasons over the CALLER'S OWN authorization context; these actions add the
 *  few data-dependent facts the engine accepts, and they gather those facts
 *  ONLY from the caller's own, RLS-scoped rows (never another user's or tenant's
 *  data). Every Supabase read here is implicitly RLS-scoped to the caller; the
 *  salesman queries additionally pin `salesman_id = ctx.userId`.
 *
 *  Each query is logged fire-and-forget via the SECDEF RPC `erp_log_copilot_query`
 *  for the Confusion-Analytics dashboard; a logging failure never fails the action.
 */

import { createClient } from '@/lib/supabase/server';
import { getUserContext, type UserContext } from '@/lib/erp/auth-context';
import type { ActionResult } from '@/lib/erp/guards';
import { liveRoleCapabilities, liveCompanyRules } from '@/lib/erp/copilot/copilot-live-context';
import { today } from '@/lib/erp/work-session';
import {
  analyzeAction,
  explainScreen,
  suggestedQuestions,
  explainPermission,
  trainingGuide,
  trainingTopics,
  type CopilotContext,
  type ScreenExplanation,
  type BlockAnalysis,
  type TrainingResult,
} from '@/lib/erp/copilot/copilot-engine';
import { ACTION_REQUIREMENTS } from '@/lib/erp/copilot/copilot-kb';
import type { Permission } from '@/lib/erp/permissions';

type Locale = 'en' | 'ar';

/** Map the full UserContext to the minimal snapshot the engine reasons over.
 *  companyActive: a company is treated as active unless explicitly flagged
 *  inactive — `ctx.company?.is_active !== false` (so a missing company, e.g. the
 *  platform owner, is NOT considered an inactive subscription). */
function toCopilotContext(ctx: UserContext): CopilotContext {
  return {
    permissions: ctx.permissions,
    modules: ctx.modules,
    roles: ctx.memberships.map((m) => m.role),
    topRole: ctx.topRole,
    isSuperAdmin: ctx.isSuperAdmin,
    isPlatformOwner: ctx.isPlatformOwner,
    companyActive: ctx.company?.is_active !== false,
  };
}

type QueryType =
  | 'screen_help'
  | 'why_blocked'
  | 'next_best_action'
  | 'training'
  | 'permission_explain'
  | 'workflow_status'
  | 'quick_help';

/** Fire-and-forget analytics log. Never throws into the calling action. */
async function logQuery(args: {
  query_type: QueryType;
  action_key?: string | null;
  screen_href?: string | null;
  blocked?: boolean | null;
  reason_codes?: string[] | null;
  locale?: string | null;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('erp_log_copilot_query', {
      p_query_type: args.query_type,
      p_action_key: args.action_key ?? null,
      p_screen_href: args.screen_href ?? null,
      p_blocked: args.blocked ?? null,
      p_reason_codes: args.reason_codes ?? null,
      p_locale: args.locale ?? null,
    });
  } catch {
    // logging is best-effort; swallow.
  }
}

// ── 1. Screen help ────────────────────────────────────────────────────────────

export interface ScreenHelpData {
  explanation: ScreenExplanation | null;
  questions: string[];
}

export async function screenHelp(
  href: string,
  locale: Locale = 'en',
): Promise<ActionResult<ScreenHelpData>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const explanation = explainScreen(href, locale);
  const questions = suggestedQuestions(href, locale);

  void logQuery({ query_type: 'screen_help', screen_href: href, locale });
  return { ok: true, data: { explanation, questions } };
}

// ── 2. Why blocked ────────────────────────────────────────────────────────────

export async function whyBlocked(
  actionKey: string,
  locale: Locale = 'en',
): Promise<ActionResult<BlockAnalysis>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const cctx = toCopilotContext(ctx);

  // Gather data-dependent facts ONLY when cheap & relevant, and only for the
  // caller's own rows (RLS-scoped + pinned to ctx.userId).
  let facts: Parameters<typeof analyzeAction>[3] = {};
  if (actionKey === 'day.close') {
    facts = await dayCloseFacts(ctx);
  }

  const analysis = analyzeAction(actionKey, cctx, locale, facts);

  void logQuery({
    query_type: 'why_blocked',
    action_key: actionKey,
    blocked: !analysis.allowed,
    reason_codes: analysis.reasons.map((r) => r.code),
    locale,
  });
  return { ok: true, data: analysis };
}

/** Read the caller's OWN open work session today + the company min-coverage
 *  setting, to feed the deterministic low-coverage check. Null-tolerant. */
async function dayCloseFacts(
  ctx: UserContext,
): Promise<{ coveragePct?: number; minCoveragePct?: number }> {
  try {
    const supabase = await createClient();
    const date = today();
    const { data: session } = await supabase
      .from('erp_work_sessions')
      .select('coverage_pct')
      .eq('salesman_id', ctx.userId) // caller's own session only
      .eq('work_date', date)
      .neq('close_status', 'closed')
      .maybeSingle();
    if (session?.coverage_pct == null) return {};

    let minCoveragePct: number | undefined;
    if (ctx.companyId) {
      const { data: settings } = await supabase
        .from('erp_fmcg_settings')
        .select('day_close_min_coverage')
        .eq('company_id', ctx.companyId)
        .maybeSingle();
      if (settings?.day_close_min_coverage != null)
        minCoveragePct = settings.day_close_min_coverage as number;
    }
    return { coveragePct: session.coverage_pct as number, minCoveragePct };
  } catch {
    return {};
  }
}

// ── 3. Next best actions ──────────────────────────────────────────────────────

export type Severity = 'info' | 'warning' | 'danger';
export interface AttentionItem {
  title: string;
  count: number;
  href: string;
  severity: Severity;
}

/** Run a COUNT-style probe, returning 0 on any error (null-tolerant). */
async function safeCount(
  fn: () => PromiseLike<{ count: number | null }>,
): Promise<number> {
  try {
    const { count } = await fn();
    return count ?? 0;
  } catch {
    return 0;
  }
}

const has = (ctx: UserContext, perm: Permission) =>
  ctx.isSuperAdmin || ctx.permissions.includes(perm);

export async function nextBestActions(
  locale: Locale = 'en',
): Promise<ActionResult<AttentionItem[]>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const supabase = await createClient();
  const date = today();
  const t = (en: string, ar: string) => (locale === 'ar' ? ar : en);
  const items: AttentionItem[] = [];

  // ── Platform owner: subscription expiry watch (RLS lets owner see all). ──
  if (ctx.isPlatformOwner) {
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30str = in30.toISOString().slice(0, 10);
    const expiring = await safeCount(() =>
      supabase
        .from('erp_companies')
        .select('id', { count: 'exact', head: true })
        .gte('subscription_end', date)
        .lte('subscription_end', in30str),
    );
    if (expiring > 0)
      items.push({
        title: t('Subscriptions ending within 30 days', 'اشتراكات تنتهي خلال 30 يوماً'),
        count: expiring,
        href: '/platform/billing',
        severity: 'warning',
      });
    const companies = await safeCount(() =>
      supabase.from('erp_companies').select('id', { count: 'exact', head: true }),
    );
    if (companies > 0)
      items.push({
        title: t('Companies', 'الشركات'),
        count: companies,
        href: '/platform/companies',
        severity: 'info',
      });
    void logQuery({ query_type: 'next_best_action', locale });
    return { ok: true, data: items };
  }

  // ── Salesman / field rep ──
  if (has(ctx, 'field.sales')) {
    // Independent reads run in one parallel wave; items pushed in the same order
    // as before (today's skipped customers, today's GPS/out-of-route, overdue).
    const [skipped, gps, overdue] = await Promise.all([
      (async () => {
        try {
          const { data: session } = await supabase
            .from('erp_work_sessions')
            .select('skipped_count, coverage_pct')
            .eq('salesman_id', ctx.userId)
            .eq('work_date', date)
            .neq('close_status', 'closed')
            .maybeSingle();
          return (session?.skipped_count as number | null) ?? 0;
        } catch {
          return 0;
        }
      })(),
      safeCount(() =>
        supabase
          .from('erp_visit_compliance')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', `${date}T00:00:00`)
          .lte('created_at', `${date}T23:59:59`)
          .in('kind', ['gps_violation', 'out_of_route']),
      ),
      safeCount(() =>
        supabase
          .from('erp_invoices')
          .select('id', { count: 'exact', head: true })
          .lt('due_date', date)
          .in('status', ['issued', 'partially_paid', 'overdue']),
      ),
    ]);
    if (skipped > 0)
      items.push({
        title: t('Skipped customers today', 'عملاء تم تخطّيهم اليوم'),
        count: skipped,
        href: '/field/journey',
        severity: 'warning',
      });
    if (gps > 0)
      items.push({
        title: t('GPS / out-of-route flags today', 'مخالفات GPS / خارج الخط اليوم'),
        count: gps,
        href: '/field/journey',
        severity: 'warning',
      });
    if (overdue > 0)
      items.push({
        title: t('Overdue invoices', 'فواتير متأخرة'),
        count: overdue,
        href: '/sales/invoices',
        severity: 'danger',
      });
  }

  // ── Supervisor / branch manager: approvals queue (RLS-scoped). ──
  if (has(ctx, 'visit.approve_out_of_route') || has(ctx, 'day.approve_close_exception')) {
    const [pendingVisits, pendingDayClose, pendingCustTransfers, pendingVanTransfers] = await Promise.all([
      safeCount(() => supabase.from('erp_visit_compliance').select('id', { count: 'exact', head: true }).eq('status', 'pending_approval')),
      safeCount(() => supabase.from('erp_work_sessions').select('id', { count: 'exact', head: true }).eq('close_status', 'pending_approval')),
      safeCount(() => supabase.from('erp_customer_transfers').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
      safeCount(() => supabase.from('erp_van_transfers').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    ]);
    if (pendingVisits > 0)
      items.push({
        title: t('Visits awaiting approval', 'زيارات بانتظار الاعتماد'),
        count: pendingVisits,
        href: '/distribution/journey-compliance',
        severity: 'warning',
      });
    if (pendingDayClose > 0)
      items.push({
        title: t('Day-closes awaiting approval', 'إغلاقات يوم بانتظار الاعتماد'),
        count: pendingDayClose,
        href: '/distribution/journey-compliance',
        severity: 'warning',
      });
    if (pendingCustTransfers > 0)
      items.push({
        title: t('Customer transfers pending', 'تحويلات عملاء معلّقة'),
        count: pendingCustTransfers,
        href: '/customers',
        severity: 'info',
      });
    if (pendingVanTransfers > 0)
      items.push({
        title: t('Van transfers pending', 'تحويلات عربات معلّقة'),
        count: pendingVanTransfers,
        href: '/distribution/journey-compliance',
        severity: 'info',
      });
  }

  // ── Manager / director: financials + workflow queue (RLS-scoped). ──
  if (has(ctx, 'reports.view')) {
    const [overdueTotal, pendingWf] = await Promise.all([
      safeCount(() =>
        supabase.from('erp_invoices').select('id', { count: 'exact', head: true })
          .lt('due_date', date).in('status', ['issued', 'partially_paid', 'overdue'])),
      safeCount(() =>
        supabase.from('erp_workflow_instances').select('id', { count: 'exact', head: true })
          .eq('status', 'pending')),
    ]);
    if (overdueTotal > 0 && !items.some((i) => i.href === '/sales/invoices'))
      items.push({
        title: t('Overdue invoices', 'فواتير متأخرة'),
        count: overdueTotal,
        href: '/sales/invoices',
        severity: 'danger',
      });

    if (pendingWf > 0)
      items.push({
        title: t('Approvals pending', 'موافقات معلّقة'),
        count: pendingWf,
        href: '/approvals',
        severity: 'warning',
      });
  }

  void logQuery({ query_type: 'next_best_action', locale });
  return { ok: true, data: items };
}

// ── 4. Training & permission info ─────────────────────────────────────────────

export async function training(
  key: string,
  locale: Locale = 'en',
): Promise<ActionResult<TrainingResult>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };
  const cctx = toCopilotContext(ctx);

  const guide = trainingGuide(key, cctx, locale);
  if (!guide) return { ok: false, error: 'not_found' };

  void logQuery({ query_type: 'training', action_key: key, locale });
  return { ok: true, data: guide };
}

export async function permissionInfo(
  perm: string,
  locale: Locale = 'en',
): Promise<ActionResult<ReturnType<typeof explainPermission>>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const info = explainPermission(perm as Permission, locale);
  if (!info) return { ok: false, error: 'not_found' };

  void logQuery({ query_type: 'permission_explain', action_key: perm, locale });
  return { ok: true, data: info };
}

// ── 5. Confusion analytics (admin / owner only) ───────────────────────────────

export interface ConfusionBucket {
  key: string;
  count: number;
}
export interface ConfusionAnalytics {
  total: number;
  blockedRate: number; // 0..1 over rows where `blocked` is non-null
  topActions: ConfusionBucket[];
  topScreens: ConfusionBucket[];
  byType: ConfusionBucket[];
  topReasons: ConfusionBucket[];
}

/** Aggregate the company's copilot query log. RLS already restricts the read to
 *  the company admin / platform owner; we additionally guard here. We tally a
 *  bounded sample in JS (no SQL group-by / view). */
export async function loadConfusionAnalytics(): Promise<ActionResult<ConfusionAnalytics>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const isCompanyAdmin = ctx.memberships.some((m) => m.role === 'admin');
  if (!ctx.isPlatformOwner && !isCompanyAdmin && !ctx.isSuperAdmin)
    return { ok: false, error: 'forbidden' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('erp_copilot_queries')
    .select('query_type, action_key, screen_href, blocked, reason_codes')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (error) return { ok: false, error: error.message };

  type Row = {
    query_type: string;
    action_key: string | null;
    screen_href: string | null;
    blocked: boolean | null;
    reason_codes: string[] | null;
  };
  const rows = (data ?? []) as Row[];

  const tally = (keys: (string | null | undefined)[]): ConfusionBucket[] => {
    const m = new Map<string, number>();
    for (const k of keys) if (k) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count);
  };

  const blockedConsidered = rows.filter((r) => r.blocked != null);
  const blockedCount = blockedConsidered.filter((r) => r.blocked === true).length;

  return {
    ok: true,
    data: {
      total: rows.length,
      blockedRate: blockedConsidered.length
        ? blockedCount / blockedConsidered.length
        : 0,
      topActions: tally(rows.map((r) => r.action_key)).slice(0, 10),
      topScreens: tally(rows.map((r) => r.screen_href)).slice(0, 10),
      byType: tally(rows.map((r) => r.query_type)),
      topReasons: tally(rows.flatMap((r) => r.reason_codes ?? [])).slice(0, 10),
    },
  };
}

// ── Helpers exposed for the UI (relevant "Why can't I…?" picker keys) ─────────

export interface WhyOption {
  key: string;
  label: string;
}

/** The subset of ACTION_REQUIREMENTS relevant to the caller's modules/perms,
 *  shaped for the picker. Pure, no data reads. */
export async function relevantWhyActions(
  locale: Locale = 'en',
): Promise<ActionResult<WhyOption[]>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const opts: WhyOption[] = Object.values(ACTION_REQUIREMENTS)
    .filter((req) => {
      if (ctx.isSuperAdmin || ctx.isPlatformOwner) return true;
      if (req.module && !ctx.modules.includes(req.module)) return false;
      return true;
    })
    .map((req) => ({ key: req.key, label: locale === 'ar' ? req.label.ar : req.label.en }));

  return { ok: true, data: opts };
}

/** (Dynamic) Explain what a role can do from the company's CURRENT live grants —
 *  works for brand-new / customized roles because it reads
 *  erp_company_role_permissions at request time (never the static role template). */
export async function explainRole(
  roleKey: string,
  locale: Locale = 'en',
): Promise<ActionResult<{ groups: { group: string; items: string[] }[] }>> {
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  const groups = await liveRoleCapabilities(supabase, ctx.companyId, roleKey, locale);
  return { ok: true, data: { groups } };
}

/** (Dynamic) The company's operational rules phrased with their LIVE values
 *  (GPS radius, day-close coverage, van auto-approve) from erp_fmcg_settings. */
export async function companyRules(locale: Locale = 'en'): Promise<ActionResult<string[]>> {
  const ctx = await getUserContext();
  if (!ctx || !ctx.companyId) return { ok: false, error: 'unauthorized' };
  const supabase = await createClient();
  return { ok: true, data: await liveCompanyRules(supabase, ctx.companyId, locale) };
}
