/**
 * Configurable Organization Hierarchy — pure types + tree helpers (no I/O), so
 * the builder's tree/move/validation logic is unit-tested independently of the
 * DB. The server layer (org-hierarchy-server.ts) persists this in
 * `erp_org_levels` / `erp_org_nodes`.
 *
 * Backward-compat note: nodes seeded from the existing structure carry a
 * `legacyRef` ({ type, id }) back to their erp_regions/areas/branches/teams row.
 * `erp_branches` stays the canonical branch entity — these nodes are a parallel
 * presentation/config layer and never replace it. Helpers here are deliberately
 * agnostic to that (they only need parent links + sort order).
 */

import { buildTree, type WithChildren } from './tree';

export interface OrgLevel {
  id: string;
  name: string;
  nameAr: string | null;
  depth: number;
  sortOrder: number;
  parentLevelId: string | null;
  canHoldUsers: boolean;
  canHoldManager: boolean;
  systemKey: string | null; // 'region'|'area'|'branch'|'team' | null = custom
}

export interface OrgNode {
  id: string;
  levelId: string;
  parentNodeId: string | null;
  name: string;
  nameAr: string | null;
  managerUserId: string | null;
  sortOrder: number;
  isActive: boolean;
  legacyRefType: string | null; // 'region'|'area'|'branch'|'team' | null = custom
  legacyRefId: string | null;
}

/** A node is "managed" (seeded from canonical structure) when it has a legacy ref.
 *  Such nodes must not be deleted — that would orphan branch/region references. */
export function isManagedNode(n: Pick<OrgNode, 'legacyRefId'>): boolean {
  return n.legacyRefId != null;
}

export type OrgTreeNode = WithChildren<OrgNode>;

// Tree assembly / cycle-safety is shared with the Product builder (see tree.ts).
export { descendantIds, canReparent } from './tree';

/** Build the org forest (see buildTree). Kept as a named export so callers read
 *  domain-clearly; delegates to the generic, separately-tested tree builder. */
export function buildOrgTree(nodes: OrgNode[]): OrgTreeNode[] {
  return buildTree(nodes);
}

/** Levels ordered by (depth, sortOrder, name) — the display order for the rail. */
export function orderedLevels(levels: OrgLevel[]): OrgLevel[] {
  return [...levels].sort(
    (a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

/** Count of nodes per level id (for level summaries). */
export function nodeCountByLevel(nodes: OrgNode[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const n of nodes) out[n.levelId] = (out[n.levelId] ?? 0) + 1;
  return out;
}

/** Total nodes + how many have a manager assigned (for the header summary). */
export function orgSummary(nodes: OrgNode[]): { total: number; withManager: number; active: number } {
  let withManager = 0;
  let active = 0;
  for (const n of nodes) {
    if (n.managerUserId) withManager += 1;
    if (n.isActive) active += 1;
  }
  return { total: nodes.length, withManager, active };
}
