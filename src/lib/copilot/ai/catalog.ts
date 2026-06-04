/**
 * Copilot AI — intent catalog (pure, built from the static Copilot KB).
 *
 * Turns the existing bilingual KB (action requirements, screens, training
 * guides) and the permission labels into a flat, searchable catalog the
 * deterministic interpreter scores a question against. Pure metadata — no data
 * reads, no env, no DB.
 */

import { ACTION_REQUIREMENTS, SCREENS, TRAINING_GUIDES } from '@/lib/erp/copilot/copilot-kb';
import { PERMISSION_LABELS } from '@/lib/erp/permissions';
import type { CatalogEntry } from './types';

/** Lower-case, strip punctuation, split into tokens (keeps Arabic + latin). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Split a key like `customer.create` / `day.close` into searchable word tokens. */
function keyTokens(key: string): string[] {
  return key.split(/[._/-]+/).filter(Boolean);
}

let cached: CatalogEntry[] | null = null;

/** Build (and memoize) the intent catalog from the KB. Stable across calls. */
export function buildCatalog(): CatalogEntry[] {
  if (cached) return cached;
  const entries: CatalogEntry[] = [];

  // Actions → "why can't I …" candidates.
  for (const req of Object.values(ACTION_REQUIREMENTS)) {
    entries.push({
      kind: 'why_blocked',
      key: req.key,
      terms: dedupe([
        ...tokenize(req.label.en),
        ...tokenize(req.label.ar),
        ...keyTokens(req.key),
      ]),
    });
  }

  // Training guides → "how do I …" candidates.
  for (const g of Object.values(TRAINING_GUIDES)) {
    entries.push({
      kind: 'training',
      key: g.key,
      terms: dedupe([
        ...tokenize(g.title.en),
        ...tokenize(g.title.ar),
        ...keyTokens(g.key),
      ]),
    });
  }

  // Screens → "what is this screen / page" candidates (key = route match prefix).
  for (const s of SCREENS) {
    entries.push({
      kind: 'screen_help',
      key: s.match,
      terms: dedupe([
        ...tokenize(s.title.en),
        ...tokenize(s.title.ar),
        ...keyTokens(s.match),
      ]),
    });
  }

  // Permissions → "what does permission X do / who can …" candidates.
  for (const [perm, label] of Object.entries(PERMISSION_LABELS)) {
    const l = label as { en: string; ar: string };
    entries.push({
      kind: 'permission',
      key: perm,
      terms: dedupe([...tokenize(l.en), ...tokenize(l.ar), ...keyTokens(perm)]),
    });
  }

  cached = entries;
  return entries;
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
