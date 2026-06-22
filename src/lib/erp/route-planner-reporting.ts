/**
 * Reporting-graph resolver (Route Planner) — the pure, client/server-shared logic behind
 * the Reporting Graph Admin and the Visibility Explorer.
 *
 * It MIRRORS the database authority `rp_visible_users` / `rp_can_see_user` (migration
 * 0354) so the explorer shows exactly what RLS enforces:
 *   visibility(me) = me + everyone in my reporting SUBTREE (anyone who reports to me,
 *   directly or transitively, via a PRIMARY or SECONDARY manager edge). `see_all`
 *   short-circuits to the whole company. UNION (cycle-safe).
 *
 * Three independent concepts (do not conflate):
 *   • Permissions  = role/features (RBAC) — NOT computed here.
 *   • Reporting    = the primary/secondary manager edges below.
 *   • Visibility   = DERIVED from the reporting graph (this file) — never from role names.
 * Reporting is also INDEPENDENT of territory ownership.
 */

export interface RpNode {
  userId: string;
  name: string;
  email: string | null;
  /** Route Planner role from the access row — display only, never drives visibility. */
  role: string | null;
  primaryManagerId: string | null;
  secondaryManagerId: string | null;
  seeAll: boolean;
  /** True when the user has an erp_route_planner_access row (participates in the graph). */
  inGraph: boolean;
}

export type EdgeKind = 'primary' | 'secondary';

function childrenIndex(nodes: RpNode[]): Map<string, { id: string; via: EdgeKind }[]> {
  const idx = new Map<string, { id: string; via: EdgeKind }[]>();
  const push = (mgr: string | null, id: string, via: EdgeKind) => {
    if (!mgr) return;
    const arr = idx.get(mgr) ?? [];
    arr.push({ id, via });
    idx.set(mgr, arr);
  };
  for (const n of nodes) { push(n.primaryManagerId, n.userId, 'primary'); push(n.secondaryManagerId, n.userId, 'secondary'); }
  return idx;
}

/**
 * The set of user-ids the given user can see — self + transitive reporting subtree,
 * or every in-graph user when see_all is set. Cycle-safe (visited guard = SQL UNION).
 */
export function visibleUsers(nodes: RpNode[], userId: string): Set<string> {
  const me = nodes.find((n) => n.userId === userId);
  if (!me) return new Set([userId]); // no access row → sees only self (mirrors rp_can_see_user self-clause)
  if (me.seeAll) return new Set(nodes.map((n) => n.userId));
  const kids = childrenIndex(nodes);
  const seen = new Set<string>([userId]);
  const stack = [userId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) ?? []) if (!seen.has(c.id)) { seen.add(c.id); stack.push(c.id); }
  }
  return seen;
}

/** Does viewer's effective visibility include target? */
export function canSee(nodes: RpNode[], viewerId: string, targetId: string): boolean {
  return visibleUsers(nodes, viewerId).has(targetId);
}

export type VisibilityReason = 'self' | 'see_all' | 'direct' | 'subtree';
export interface VisibilityFact {
  targetId: string;
  reason: VisibilityReason;
  /** Hops from the viewer (0 = self, 1 = direct report, ≥2 = deeper subtree). */
  depth: number;
  /** The edge kind connecting the LAST hop to the target (null for self / see_all). */
  via: EdgeKind | null;
  /** Viewer → … → target chain of user-ids (inclusive). Empty for see_all (no path). */
  path: string[];
}

/**
 * WHY can the viewer see each user? Returns an auditable fact per visible user:
 *   • self      — the viewer themselves
 *   • see_all   — the viewer has the see_all override (sees everyone)
 *   • direct    — a direct report (one hop down the reporting line)
 *   • subtree   — a deeper report reached through the reporting subtree
 * with the depth, the connecting edge kind, and the full reporting path. This is the
 * explanation layer behind the Visibility Explorer — visibility made understandable, not
 * just computed. Same traversal as visibleUsers (so the facts match RLS exactly).
 */
export function visibilityExplain(nodes: RpNode[], viewerId: string): VisibilityFact[] {
  const me = nodes.find((n) => n.userId === viewerId);
  if (!me) return [{ targetId: viewerId, reason: 'self', depth: 0, via: null, path: [viewerId] }];

  if (me.seeAll) {
    return nodes.map((n) => n.userId === viewerId
      ? { targetId: n.userId, reason: 'self' as const, depth: 0, via: null, path: [viewerId] }
      : { targetId: n.userId, reason: 'see_all' as const, depth: 0, via: null, path: [] });
  }

  const kids = childrenIndex(nodes);
  const facts = new Map<string, VisibilityFact>();
  facts.set(viewerId, { targetId: viewerId, reason: 'self', depth: 0, via: null, path: [viewerId] });
  // BFS so the first time we reach a node is via the shortest reporting path.
  const queue: string[] = [viewerId];
  while (queue.length) {
    const cur = queue.shift()!;
    const curFact = facts.get(cur)!;
    for (const c of kids.get(cur) ?? []) {
      if (facts.has(c.id)) continue;
      const depth = curFact.depth + 1;
      facts.set(c.id, {
        targetId: c.id,
        reason: depth === 1 ? 'direct' : 'subtree',
        depth, via: c.via, path: [...curFact.path, c.id],
      });
      queue.push(c.id);
    }
  }
  return [...facts.values()];
}

/** Direct reports of a user (one hop down), with the edge that connects them. */
export function directReports(nodes: RpNode[], userId: string): { id: string; via: EdgeKind }[] {
  return childrenIndex(nodes).get(userId) ?? [];
}

/**
 * The upward management chain from a user via PRIMARY edges (the canonical line),
 * with the first-level secondary noted separately. Used to highlight reporting chains.
 * Cycle-safe.
 */
export function managerChain(nodes: RpNode[], userId: string): string[] {
  const byId = new Map(nodes.map((n) => [n.userId, n]));
  const chain: string[] = [];
  const seen = new Set<string>([userId]);
  let cur = byId.get(userId)?.primaryManagerId ?? null;
  while (cur && !seen.has(cur)) { chain.push(cur); seen.add(cur); cur = byId.get(cur)?.primaryManagerId ?? null; }
  return chain;
}

/**
 * Would assigning these manager edges to `userId` create a cycle? A cycle forms when a
 * proposed manager is already inside the user's own subtree (i.e., reports to the user).
 * Checked against the CURRENT graph, before applying. Self-management is also rejected.
 */
export function wouldCycle(nodes: RpNode[], userId: string, primaryManagerId: string | null, secondaryManagerId: string | null): boolean {
  if (primaryManagerId === userId || secondaryManagerId === userId) return true;
  const structural = subtreeStructural(nodes, userId); // reports of userId (edges only)
  return [primaryManagerId, secondaryManagerId].some((m) => m != null && structural.has(m));
}

/** Subtree by edges only, ignoring see_all (for cycle checks). */
function subtreeStructural(nodes: RpNode[], userId: string): Set<string> {
  const kids = childrenIndex(nodes);
  const seen = new Set<string>([userId]);
  const stack = [userId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const c of kids.get(cur) ?? []) if (!seen.has(c.id)) { seen.add(c.id); stack.push(c.id); }
  }
  return seen;
}

/**
 * The reverse direction: WHO CAN SEE the target, and why. For every other user whose
 * effective visibility includes the target, returns the explaining fact (reason / edge /
 * path), where `path` runs viewer → … → target. Powers the "Who can see me?" view, so
 * visibility is explainable in both directions.
 */
export function reverseVisibility(nodes: RpNode[], targetId: string): { viewerId: string; fact: VisibilityFact }[] {
  const out: { viewerId: string; fact: VisibilityFact }[] = [];
  for (const v of nodes) {
    if (v.userId === targetId) continue;
    const fact = visibilityExplain(nodes, v.userId).find((f) => f.targetId === targetId);
    if (fact) out.push({ viewerId: v.userId, fact });
  }
  return out;
}

/**
 * Human "visibility source" for an explaining fact: which mechanism grants the sightline —
 * the target's Primary/Secondary manager edge, the See-All override, or self.
 */
export function visibilitySource(fact: VisibilityFact): 'self' | 'see_all' | 'primary' | 'secondary' {
  if (fact.reason === 'self') return 'self';
  if (fact.reason === 'see_all') return 'see_all';
  return fact.via ?? 'primary';
}

/** Roots of the graph: in-graph users with no manager edge (company root(s)). */
export function graphRoots(nodes: RpNode[]): string[] {
  return nodes.filter((n) => n.inGraph && !n.primaryManagerId && !n.secondaryManagerId).map((n) => n.userId);
}
