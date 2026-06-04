/**
 * Copilot AI — deterministic interpreter (the default, FREE, no-LLM provider).
 *
 * Pure function: maps a natural-language question (Arabic or English) to an
 * Intent pointing at an existing deterministic capability. It scores the
 * question's tokens against the static catalog and uses light trigger-word
 * detection to disambiguate the *kind* of help requested. No DB, no env, no
 * network — fully unit-testable and incapable of reading tenant data.
 */

import { tokenize } from './catalog';
import type { CatalogEntry, Intent, IntentKind, InterpretContext, Locale } from './types';

const CONFIDENCE_THRESHOLD = 0.34;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'do', 'does', 'is', 'are', 'this', 'that', 'what',
  'of', 'my', 'me', 'in', 'on', 'for', 'it', 'you', 'your', 'please', 'and',
  'i', 'can', 't', 'will', 'should', 'want', 'need',
  'با', 'من', 'في', 'على', 'هل', 'هذا', 'هذه', 'ال', 'أن',
]);

const TRIGGERS: Record<Exclude<IntentKind, 'unknown' | 'screen_help'> | 'screen', string[]> = {
  why_blocked: ['why', 'cant', 'cannot', 'blocked', 'unable', 'لماذا', 'ليه', 'ممنوع', 'محظور', 'أستطيع', 'اقدر', 'أقدر'],
  training: ['how', 'steps', 'guide', 'tutorial', 'learn', 'كيف', 'ازاي', 'إزاي', 'خطوات', 'شرح', 'تعلم'],
  permission: ['permission', 'permissions', 'role', 'allowed', 'صلاحية', 'الصلاحية', 'صلاحيات', 'دور', 'مسموح'],
  screen: ['screen', 'page', 'صفحة', 'شاشة'],
};

function detectHint(qSet: Set<string>): IntentKind | null {
  if (TRIGGERS.permission.some((w) => qSet.has(w))) return 'permission';
  if (TRIGGERS.training.some((w) => qSet.has(w))) return 'training';
  if (TRIGGERS.why_blocked.some((w) => qSet.has(w))) return 'why_blocked';
  if (TRIGGERS.screen.some((w) => qSet.has(w))) return 'screen_help';
  return null;
}

const ALL_TRIGGERS = new Set(Object.values(TRIGGERS).flat());

interface Scored {
  entry: CatalogEntry;
  matched: number;
  confidence: number;
}

/** Interpret a question into an Intent. Pure; `context` is accepted for parity
 *  with the provider interface (and future relevance tuning) but never used to
 *  read data. */
export function interpret(args: {
  question: string;
  locale: Locale;
  catalog: CatalogEntry[];
  context?: InterpretContext;
}): Intent {
  const { question, catalog } = args;
  const qTokens = tokenize(question);
  const qSet = new Set(qTokens);

  // "Meaningful" tokens = drop stopwords + trigger words, for confidence scaling.
  const meaningful = qTokens.filter((t) => !STOPWORDS.has(t) && !ALL_TRIGGERS.has(t));
  const denom = Math.max(1, new Set(meaningful).size);

  const scored: Scored[] = catalog.map((entry) => {
    const matched = entry.terms.reduce((n, term) => (qSet.has(term) ? n + 1 : n), 0);
    return { entry, matched, confidence: Math.min(1, matched / denom) };
  });

  const hint = detectHint(qSet);

  const bestOf = (kind: CatalogEntry['kind']): Scored | null =>
    scored
      .filter((s) => s.entry.kind === kind && s.matched > 0)
      .sort((a, b) => b.matched - a.matched || b.confidence - a.confidence)[0] ?? null;

  // Prefer the hinted kind when it has any match; otherwise fall back to the
  // global best match across all kinds.
  let chosen: Scored | null = null;
  if (hint && hint !== 'unknown') chosen = bestOf(hint as CatalogEntry['kind']);
  if (!chosen) {
    chosen = scored
      .filter((s) => s.matched > 0)
      .sort((a, b) => b.matched - a.matched || b.confidence - a.confidence || kindRank(a.entry.kind) - kindRank(b.entry.kind))[0] ?? null;
  }

  // With a trigger word ("why/how/permission/screen") a single entity match is
  // enough; without one, require at least two matching tokens so an incidental
  // common word (e.g. "today") doesn't resolve to a confident intent.
  const minMatched = hint ? 1 : 2;
  if (!chosen || chosen.matched < minMatched || chosen.confidence < CONFIDENCE_THRESHOLD) {
    return { kind: 'unknown', confidence: chosen?.confidence ?? 0 };
  }
  return { kind: chosen.entry.kind, key: chosen.entry.key, confidence: chosen.confidence };
}

/** Tie-break preference when scores are equal: actionable answers first. */
function kindRank(kind: CatalogEntry['kind']): number {
  return { why_blocked: 0, training: 1, permission: 2, screen_help: 3 }[kind];
}
