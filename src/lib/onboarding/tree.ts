/**
 * Generic hierarchy helpers shared by the Organization and Product structure
 * builders. Pure (no I/O) and structurally typed: any record with an id, a
 * nullable parent link, a sort order and a name can be assembled into a tree,
 * walked for descendants, and validated against reparent cycles.
 */

export interface TreeBase {
  id: string;
  parentNodeId: string | null;
  sortOrder: number;
  name: string;
}

export type WithChildren<T> = T & { children: WithChildren<T>[] };

/** Build a forest from flat nodes via `parentNodeId`. Roots are nodes with no
 *  parent (or a parent not present in the set, so nothing is silently dropped).
 *  Children and roots are sorted by (sortOrder, name). Side-effect-free. */
export function buildTree<T extends TreeBase>(nodes: T[]): WithChildren<T>[] {
  const byId = new Map<string, WithChildren<T>>();
  for (const n of nodes) byId.set(n.id, { ...n, children: [] });

  const roots: WithChildren<T>[] = [];
  for (const n of nodes) {
    const node = byId.get(n.id)!;
    const parent = n.parentNodeId ? byId.get(n.parentNodeId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const cmp = (a: TreeBase, b: TreeBase) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
  const sortRec = (list: WithChildren<T>[]) => {
    list.sort(cmp);
    for (const c of list) sortRec(c.children);
  };
  sortRec(roots);
  return roots;
}

/** Ids of `nodeId` and all of its descendants (inclusive). */
export function descendantIds<T extends TreeBase>(nodeId: string, nodes: T[]): Set<string> {
  const childrenOf = new Map<string, string[]>();
  for (const n of nodes) {
    if (!n.parentNodeId) continue;
    const arr = childrenOf.get(n.parentNodeId) ?? childrenOf.set(n.parentNodeId, []).get(n.parentNodeId)!;
    arr.push(n.id);
  }
  const out = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childrenOf.get(id) ?? []) stack.push(c);
  }
  return out;
}

/** Can `nodeId` be reparented under `newParentId` without creating a cycle?
 *  A node may not become its own descendant nor parent to itself. `null`
 *  newParent (make it a root) is always allowed. */
export function canReparent<T extends TreeBase>(nodeId: string, newParentId: string | null, nodes: T[]): boolean {
  if (newParentId == null) return true;
  if (newParentId === nodeId) return false;
  return !descendantIds(nodeId, nodes).has(newParentId);
}
