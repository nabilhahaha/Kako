/**
 * Copilot AI — shared types.
 *
 * The AI layer NEVER reads the database. It only maps a natural-language
 * question to an *intent* that points at one of the existing, already-authorized
 * deterministic capabilities (why-blocked / screen-help / training / permission).
 * The server action then routes that intent through the existing RLS-scoped
 * engine. These types deliberately contain no database client and no row data —
 * a structural guarantee that the AI/interpretation layer cannot touch tenant
 * data directly.
 */

export type Locale = 'en' | 'ar';

/** The kinds of question the V1 Copilot can resolve, each backed by an existing
 *  deterministic engine function. `unknown` => no confident match. */
export type IntentKind =
  | 'why_blocked'
  | 'screen_help'
  | 'training'
  | 'permission'
  | 'unknown';

/** A resolved intent: which deterministic capability to invoke, and with what
 *  key. `score`/`confidence` let the caller decide to fall back to suggestions. */
export interface Intent {
  kind: IntentKind;
  /** action key / screen match / training key / permission key (per kind). */
  key?: string;
  /** Match strength in [0, 1]; below the catalog threshold => treated as unknown. */
  confidence: number;
}

/** The minimal, already-authorized snapshot the interpreter is allowed to see.
 *  Note: NO database client, NO other-tenant data — only the caller's own
 *  permissions/modules, mirrored from their UserContext server-side. */
export interface InterpretContext {
  permissions: string[];
  modules: string[];
  privileged: boolean; // super admin / platform owner
}

/** A provider turns a question into an Intent. The signature intentionally takes
 *  ONLY the question, locale, static catalog and the caller's context snapshot —
 *  never a DB handle — so no provider (deterministic or future LLM) can read
 *  the database. */
export interface CopilotAiProvider {
  readonly name: string;
  interpret(args: {
    question: string;
    locale: Locale;
    catalog: CatalogEntry[];
    context: InterpretContext;
  }): Promise<Intent> | Intent;
}

/** A searchable catalog entry derived from the static Copilot KB (pure metadata). */
export interface CatalogEntry {
  kind: Exclude<IntentKind, 'unknown'>;
  key: string;
  /** Lower-cased search terms (label en/ar + key tokens + synonyms). */
  terms: string[];
}

import type { BlockAnalysis, ScreenExplanation, TrainingResult } from '@/lib/erp/copilot/copilot-engine';

/** The content half of an answer (produced purely from the deterministic engine). */
export interface AnswerContent {
  intent: IntentKind;
  resolvedKey?: string;
  answerKind: 'block' | 'screen' | 'training' | 'permission' | 'unknown';
  title: string;
  block?: BlockAnalysis;
  screen?: ScreenExplanation;
  training?: TrainingResult;
  permission?: { label: string; group: string; defaultRoles: string[] };
  message?: string;
  suggestions?: string[];
}

/** The full answer returned to the UI: content + provenance (which provider
 *  answered, and whether we fell back to the deterministic engine). */
export interface AiAnswer extends AnswerContent {
  provider: string; // 'deterministic' | 'llm:<name>'
  fallbackUsed: boolean;
}
