// Auto-mapping + confidence scoring + coverage. Pure functions.
import {
  CANONICAL_FIELDS,
  FIELD_BY_KEY,
  REQUIREMENT_GROUPS,
  normHeader,
  type CanonicalField,
  type FieldTier,
} from "@/lib/import/canonical-fields";
import type { FieldMapping } from "@/lib/import/types";

/** Token-overlap similarity between two normalized strings (0..1). */
function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / Math.max(ta.size, tb.size);
}

export type FieldSuggestion = {
  key: string;
  source: string | null;
  confidence: number; // 0..100
};

/**
 * Suggest a source header for each canonical field from the file's headers.
 * Exact synonym/header match = 100; synonym token overlap scaled below.
 */
export function suggestMapping(headers: string[]): FieldSuggestion[] {
  const normedHeaders = headers.map((h) => ({ raw: h, norm: normHeader(h) }));
  const used = new Set<string>();

  // Build (field, header, score) candidates, then greedily assign best first.
  const cands: { key: string; source: string; score: number }[] = [];
  for (const f of CANONICAL_FIELDS) {
    const targets = [normHeader(f.label), normHeader(f.key), ...f.synonyms.map(normHeader)];
    for (const h of normedHeaders) {
      let score = 0;
      if (targets.includes(h.norm)) score = 100;
      else {
        for (const t of targets) {
          const ov = tokenOverlap(t, h.norm);
          if (ov > 0) score = Math.max(score, Math.round(ov * 90));
        }
      }
      if (score >= 50) cands.push({ key: f.key, source: h.raw, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);

  const assigned: Record<string, FieldSuggestion> = {};
  for (const c of cands) {
    if (assigned[c.key]) continue;
    if (used.has(c.source)) continue;
    assigned[c.key] = { key: c.key, source: c.source, confidence: c.score };
    used.add(c.source);
  }
  return CANONICAL_FIELDS.map(
    (f) => assigned[f.key] ?? { key: f.key, source: null, confidence: 0 },
  );
}

/** Build a field_mapping JSON from chosen source per canonical key. */
export function buildFieldMapping(
  chosen: Record<string, string>,
  dateFormat: string,
): FieldMapping {
  const fm: FieldMapping = {};
  for (const [key, source] of Object.entries(chosen)) {
    if (!source) continue;
    fm[key] = key === "invoice_date" ? { source, format: dateFormat } : { source };
  }
  return fm;
}

export type Coverage = {
  tier: FieldTier;
  mapped: string[];
  missing: string[];
};

/** Coverage by tier given a field_mapping. */
export function coverageByTier(fm: FieldMapping): Coverage[] {
  const tiers: FieldTier[] = ["required", "recommended", "optional"];
  return tiers.map((tier) => {
    const fields = CANONICAL_FIELDS.filter((f) => f.tier === tier);
    const mapped = fields.filter((f) => fm[f.key]?.source).map((f) => f.key);
    const missing = fields.filter((f) => !fm[f.key]?.source).map((f) => f.key);
    return { tier, mapped, missing };
  });
}

/** Requirement groups that are NOT satisfied (these block commit). */
export function unsatisfiedRequirementGroups(fm: FieldMapping): { id: string; label: string }[] {
  return REQUIREMENT_GROUPS.filter(
    (g) => !g.anyOf.some((k) => fm[k]?.source),
  ).map((g) => ({ id: g.id, label: g.label }));
}

/** Overall mapping confidence = average confidence of mapped required fields. */
export function overallConfidence(suggestions: FieldSuggestion[]): number {
  const req = suggestions.filter((s) => FIELD_BY_KEY[s.key]?.tier === "required" && s.source);
  if (req.length === 0) return 0;
  return Math.round(req.reduce((a, s) => a + s.confidence, 0) / req.length);
}

/** Source headers present in the file but not mapped to any canonical field. */
export function unmappedHeaders(headers: string[], fm: FieldMapping): string[] {
  const usedSources = new Set(
    Object.values(fm).flatMap((e) => [e.source, e.fallback?.source].filter(Boolean) as string[]),
  );
  return headers.filter((h) => !usedSources.has(h));
}

export function fieldLabel(key: string): string {
  return FIELD_BY_KEY[key]?.label ?? key;
}
export function fieldTier(key: string): FieldTier {
  return FIELD_BY_KEY[key]?.tier ?? "optional";
}
export { CANONICAL_FIELDS, FIELD_BY_KEY };
export type { CanonicalField };
