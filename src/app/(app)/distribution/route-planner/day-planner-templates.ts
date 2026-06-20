// ============================================================================
// Day Planner — reusable column-mapping templates ("formats").
//
// When a manager maps a file once, they can save that mapping under a name (e.g.
// "Roshen Customer Format"). Next time a file with the same columns is uploaded we
// recognise it (by a normalised header fingerprint) and auto-apply the mapping.
//
// Wave A persistence: templates are a COMPANY-SHARED asset now, stored server-side in
// erp_rp_field_mappings (kind='template', RLS, migration 0359) so every planner reuses
// the same formats. localStorage is kept as a first-paint CACHE + offline fallback; the
// client migrates local-only formats up on first load (idempotent by name).
// ============================================================================
import { headersFingerprint, mappingMatchScore, type DpMapping } from '@/lib/tis/day-planner-import';
import { listMappingTemplates, saveMappingTemplate, deleteMappingTemplate, migrateLocalTemplates } from './rp-planning-actions';

export interface DpTemplate {
  id: string;
  name: string;
  headers: string[];      // the file's original headers (for match scoring)
  fingerprint: string;    // normalised, order-insensitive column signature
  mapping: DpMapping;
  createdAt: number;
}

const KEY = 'vantora-day-planner-templates';

// ── localStorage cache / offline-fallback tier ──────────────────────────────
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
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* quota / private mode */ }
}

/** Synchronous cache read — instant first paint + the source for findBestTemplate(). */
export function loadDpTemplates(): DpTemplate[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

// ── Server-backed orchestration (server is source of truth; cache mirrors it) ─
let migrated = false;

/** Load templates from the server, migrating local-only formats up on first call.
 *  Falls back to the localStorage cache on any server error. */
export async function syncDpTemplates(): Promise<DpTemplate[]> {
  const local = read();
  try {
    const res = migrated
      ? await listMappingTemplates()
      : await migrateLocalTemplates(local.map((t) => ({ name: t.name, headers: t.headers, fingerprint: t.fingerprint, mapping: t.mapping as Record<string, string> })));
    migrated = true;
    if (res.ok && res.data) {
      const list = res.data as DpTemplate[];
      write(list);
      return list.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch { /* fall through to cache */ }
  return loadDpTemplates();
}

/** Save (or replace, by exact name). Server-first; on failure, local-only fallback. */
export async function persistDpTemplate(name: string, headers: readonly string[], mapping: DpMapping): Promise<DpTemplate[]> {
  const clean = name.trim();
  if (!clean) return loadDpTemplates();
  const fp = headersFingerprint(headers);
  try {
    const res = await saveMappingTemplate(clean, headers, fp, mapping as Record<string, string>);
    if (res.ok && res.data) { const list = res.data as DpTemplate[]; write(list); return list; }
  } catch { /* fall through */ }
  return saveLocal(clean, headers, mapping, fp);
}

/** Delete by id. Server-first; on failure, local-only fallback. */
export async function removeDpTemplate(id: string): Promise<DpTemplate[]> {
  try {
    const res = await deleteMappingTemplate(id);
    if (res.ok && res.data) { const list = res.data as DpTemplate[]; write(list); return list; }
  } catch { /* fall through */ }
  write(read().filter((t) => t.id !== id));
  return loadDpTemplates();
}

// ── Local-only fallback writers (offline / unauthenticated) ─────────────────
function saveLocal(name: string, headers: readonly string[], mapping: DpMapping, fingerprint: string): DpTemplate[] {
  const list = read().filter((t) => t.name.toLowerCase() !== name.toLowerCase());
  list.push({
    id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name, headers: [...headers], fingerprint, mapping, createdAt: Date.now(),
  });
  write(list);
  return loadDpTemplates();
}

/**
 * Find the best saved template for an uploaded file's columns (reads the synced cache).
 * Exact fingerprint match wins; otherwise the highest column overlap above a confidence
 * threshold. Returns null when nothing matches well enough. Pure over the cache.
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
