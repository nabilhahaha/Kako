/**
 * Copilot AI — intent → answer router (pure; uses ONLY the deterministic engine).
 *
 * Given a resolved Intent and the caller's already-authorized CopilotContext,
 * produce the answer by calling the existing deterministic engine functions.
 * This is where "the answer" is computed — and it is computed from the caller's
 * own permission/module context, never from another tenant's data. No DB here;
 * the server action supplies any RLS-scoped facts.
 */

import {
  analyzeAction,
  explainScreen,
  trainingGuide,
  explainPermission,
  type ActionFacts,
  type CopilotContext,
} from '@/lib/erp/copilot/copilot-engine';
import { ACTION_REQUIREMENTS, TRAINING_GUIDES } from '@/lib/erp/copilot/copilot-kb';
import type { Permission } from '@/lib/erp/permissions';
import type { AnswerContent, Intent, Locale } from './types';

const pick = (b: { en: string; ar: string }, l: Locale) => (l === 'ar' ? b.ar : b.en);

/** A few example questions to offer when the question wasn't understood. */
export function fallbackSuggestions(locale: Locale): string[] {
  const why = Object.values(ACTION_REQUIREMENTS).slice(0, 2).map((r) =>
    locale === 'ar' ? `لماذا لا أستطيع ${r.label.ar}؟` : `Why can't I ${r.label.en.toLowerCase()}?`,
  );
  const how = Object.values(TRAINING_GUIDES).slice(0, 2).map((g) =>
    locale === 'ar' ? `كيف ${g.title.ar}؟` : `How do I ${g.title.en.toLowerCase()}?`,
  );
  return [...why, ...how];
}

/** Pure: route an Intent to a deterministic answer. `facts` (optional) are the
 *  caller's own RLS-scoped data the server already authorized. */
export function resolveAnswer(
  intent: Intent,
  ctx: CopilotContext,
  locale: Locale = 'en',
  facts: ActionFacts = {},
): AnswerContent {
  switch (intent.kind) {
    case 'why_blocked': {
      if (!intent.key) break;
      const block = analyzeAction(intent.key, ctx, locale, facts);
      return { intent: 'why_blocked', resolvedKey: intent.key, answerKind: 'block', title: block.actionLabel, block };
    }
    case 'screen_help': {
      if (!intent.key) break;
      const screen = explainScreen(intent.key, locale);
      if (screen) return { intent: 'screen_help', resolvedKey: intent.key, answerKind: 'screen', title: screen.title, screen };
      break;
    }
    case 'training': {
      if (!intent.key) break;
      const training = trainingGuide(intent.key, ctx, locale);
      if (training) return { intent: 'training', resolvedKey: intent.key, answerKind: 'training', title: training.title, training };
      break;
    }
    case 'permission': {
      if (!intent.key) break;
      const permission = explainPermission(intent.key as Permission, locale);
      if (permission) return { intent: 'permission', resolvedKey: intent.key, answerKind: 'permission', title: permission.label, permission };
      break;
    }
  }

  // Unknown / unresolved → a helpful "I can answer these" message.
  return {
    intent: 'unknown',
    answerKind: 'unknown',
    title: locale === 'ar' ? 'لم أفهم سؤالك تماماً' : "I didn't quite get that",
    message:
      locale === 'ar'
        ? 'يمكنني المساعدة في: لماذا لا تستطيع تنفيذ إجراء، كيفية القيام بمهمة، أو ماذا تعني صلاحية. جرّب أحد الأمثلة:'
        : 'I can help with: why an action is blocked, how to do a task, or what a permission means. Try one of these:',
    suggestions: fallbackSuggestions(locale),
  };
}

export type { CopilotContext };
