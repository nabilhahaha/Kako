/**
 * Copilot AI — provider abstraction + safe resolution.
 *
 * V1 ships ONE provider: the deterministic interpreter (free, local, no network,
 * no DB). The abstraction lets a future LLM provider be registered WITHOUT
 * touching call sites — but an LLM is only ever consulted when the feature flag
 * is ON and a provider is registered, and ANY failure (throw or low-confidence
 * "unknown") falls back to the deterministic interpreter. The result therefore
 * degrades to "never worse than today".
 *
 * No provider receives a database handle (see `CopilotAiProvider.interpret`),
 * so the AI layer structurally cannot read tenant data.
 */

import { interpret } from './intent';
import type { CatalogEntry, CopilotAiProvider, Intent, InterpretContext, Locale } from './types';

/** The default, always-available provider. */
export const deterministicProvider: CopilotAiProvider = {
  name: 'deterministic',
  interpret: (args) => interpret(args),
};

// ── Optional LLM provider registry (none registered in V1) ────────────────────
let llmProvider: CopilotAiProvider | null = null;

/** Register (or clear, with null) an optional LLM provider. No paid provider is
 *  wired in V1; this exists for tests and the future free/paid roadmap. */
export function registerLlmProvider(p: CopilotAiProvider | null): void {
  llmProvider = p;
}
export function getRegisteredLlmProvider(): CopilotAiProvider | null {
  return llmProvider;
}

export interface ResolvedIntent {
  intent: Intent;
  provider: string;
  fallbackUsed: boolean;
}

/** Resolve a question to an Intent, honouring the flag and falling back safely. */
export async function resolveIntent(args: {
  question: string;
  locale: Locale;
  catalog: CatalogEntry[];
  context: InterpretContext;
  aiEnabled: boolean;
}): Promise<ResolvedIntent> {
  const base = { question: args.question, locale: args.locale, catalog: args.catalog, context: args.context };

  // Flag OFF (or no LLM registered) → deterministic only; the LLM is never called.
  if (!args.aiEnabled || !llmProvider) {
    return { intent: await deterministicProvider.interpret(base), provider: 'deterministic', fallbackUsed: false };
  }

  // Flag ON + LLM present → try it, fall back to deterministic on any failure
  // or a non-confident result.
  try {
    const intent = await llmProvider.interpret(base);
    if (intent && intent.kind !== 'unknown') {
      return { intent, provider: `llm:${llmProvider.name}`, fallbackUsed: false };
    }
  } catch {
    // swallow — fall through to deterministic
  }
  return { intent: await deterministicProvider.interpret(base), provider: 'deterministic', fallbackUsed: true };
}
