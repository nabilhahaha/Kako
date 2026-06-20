// ============================================================================
// Day Planner — reusable column-mapping templates ("formats").
//
// When a manager maps a file once, they can save that mapping under a name (e.g.
// "Roshen Customer Format"). Next time a file with the same columns is uploaded we
// recognise it (by a normalised header fingerprint) and auto-apply the mapping, so
// they never re-map a recurring company format. Small data → localStorage.
//
// Browser-only.
// ============================================================================
import { headersFingerprint, mappingMatchScore, type DpMapping } from '@/lib/tis/day-planner-import';

export interface DpTemplate {
  id: string;
  name: string;
  headers: string[];      // the file's original headers (for match scoring)
  fingerprint: string;    // normalised, order-insensitive column signature
  mapping: DpMapping;
  createdAt: number;
}

const KEY = 'vantora-day-planner-templates';

function read(): DpTemplate[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as DpTemplate[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function write(list: DpTemplate[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadDpTemplates(): DpTemplate[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

/** Save (or replace, by exact name) a named mapping template. Returns the new list. */
export function saveDpTemplate(name: string, headers: readonly string[], mapping: DpMapping): DpTemplate[] {
  const clean = name.trim();
  if (!clean) return loadDpTemplates();
  const list = read().filter((t) => t.name.toLowerCase() !== clean.toLowerCase());
  list.push({
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: clean,
    headers: [...headers],
    fingerprint: headersFingerprint(headers),
    mapping,
    createdAt: Date.now(),
  });
  write(list);
  return loadDpTemplates();
}

export function deleteDpTemplate(id: string): DpTemplate[] {
  write(read().filter((t) => t.id !== id));
  return loadDpTemplates();
}

/**
 * Find the best saved template for an uploaded file's columns. Exact fingerprint
 * match wins; otherwise the highest column overlap above a confidence threshold.
 * Returns null when nothing matches well enough.
 */
export function findBestTemplate(headers: readonly string[]): DpTemplate | null {
  const list = read();
  if (list.length === 0) return null;
  const fp = headersFingerprint(headers);
  const exact = list.find((t) => t.fingerprint === fp);
  if (exact) return exact;
  let best: DpTemplate | null = null;
  let bestScore = 0;
  for (const t of list) {
    const score = mappingMatchScore(t.headers, headers);
    if (score > bestScore) { best = t; bestScore = score; }
  }
  return bestScore >= 0.7 ? best : null;
}
