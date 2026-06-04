'use server';

/** ── Copilot AI — "Ask Copilot" server action (V1, deterministic provider) ────
 *
 *  The ONLY place the AI flow touches a database — and it does so exclusively
 *  through the existing RLS-scoped Supabase client (the caller's session) and
 *  the existing audit-log RPC. The interpretation/AI layer (src/lib/copilot/ai)
 *  receives only the question + a snapshot of the caller's OWN permissions; it
 *  has no DB handle and cannot read tenant data.
 *
 *  Flow: interpret question → route to the deterministic engine (the SAME engine
 *  the rest of the Copilot uses) → optionally enrich with the caller's own
 *  RLS-scoped facts → audit-log (fire-and-forget). Feature flag OFF keeps the
 *  deterministic interpreter; any future LLM failure falls back to it.
 */

import { createClient } from '@/lib/supabase/server';
import { getUserContext, type UserContext } from '@/lib/erp/auth-context';
import type { ActionResult } from '@/lib/erp/guards';
import { today } from '@/lib/erp/work-session';
import type { ActionFacts, CopilotContext } from '@/lib/erp/copilot/copilot-engine';
import { buildCatalog } from '@/lib/copilot/ai/catalog';
import { resolveIntent } from '@/lib/copilot/ai/provider';
import { resolveAnswer } from '@/lib/copilot/ai/resolve';
import { isCopilotAiEnabled } from '@/lib/copilot/ai/flags';
import type { AiAnswer, Locale } from '@/lib/copilot/ai/types';

const MAX_QUESTION_LEN = 500;

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

/** Caller's OWN open work-session coverage + company min-coverage (RLS-scoped). */
async function dayCloseFacts(ctx: UserContext): Promise<ActionFacts> {
  try {
    const supabase = await createClient();
    const date = today();
    const { data: session } = await supabase
      .from('erp_work_sessions')
      .select('coverage_pct')
      .eq('salesman_id', ctx.userId)
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
      if (settings?.day_close_min_coverage != null) minCoveragePct = settings.day_close_min_coverage as number;
    }
    return { coveragePct: session.coverage_pct as number, minCoveragePct };
  } catch {
    return {};
  }
}

async function logAi(args: {
  action_key: string | null;
  provider: string;
  fallback: boolean;
  blocked: boolean | null;
  locale: string;
}): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.rpc('erp_log_copilot_ai', {
      p_action_key: args.action_key,
      p_locale: args.locale,
      p_provider: args.provider,
      p_fallback: args.fallback,
      p_blocked: args.blocked,
    });
  } catch {
    // best-effort; never fail the answer on a logging error.
  }
}

/** Answer a free-text question using the deterministic Copilot (AI-optional). */
export async function askCopilot(
  question: string,
  locale: Locale = 'en',
): Promise<ActionResult<AiAnswer>> {
  const ctx = await getUserContext();
  if (!ctx) return { ok: false, error: 'unauthorized' };

  const q = (question ?? '').trim().slice(0, MAX_QUESTION_LEN);
  if (!q) return { ok: false, error: 'empty' };

  const catalog = buildCatalog();
  const { intent, provider, fallbackUsed } = await resolveIntent({
    question: q,
    locale,
    catalog,
    context: {
      permissions: ctx.permissions,
      modules: ctx.modules,
      privileged: ctx.isSuperAdmin || ctx.isPlatformOwner,
    },
    aiEnabled: isCopilotAiEnabled(),
  });

  // Enrich only with the caller's OWN, RLS-scoped facts, only where relevant.
  let facts: ActionFacts = {};
  if (intent.kind === 'why_blocked' && intent.key === 'day.close') {
    facts = await dayCloseFacts(ctx);
  }

  const content = resolveAnswer(intent, toCopilotContext(ctx), locale, facts);
  const blocked = content.block ? !content.block.allowed : null;

  void logAi({
    action_key: content.resolvedKey ?? intent.kind,
    provider,
    fallback: fallbackUsed,
    blocked,
    locale,
  });

  return { ok: true, data: { ...content, provider, fallbackUsed } };
}
