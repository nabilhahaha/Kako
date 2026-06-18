import { describe, it, expect } from 'vitest';
import {
  buildOrgTree, descendantIds, canReparent, orderedLevels, nodeCountByLevel,
  orgSummary, isManagedNode, type OrgNode, type OrgLevel,
} from './org-hierarchy';

function node(p: Partial<OrgNode> & { id: string }): OrgNode {
  return {
    id: p.id,
    levelId: p.levelId ?? 'L',
    parentNodeId: p.parentNodeId ?? null,
    name: p.name ?? p.id,
    nameAr: p.nameAr ?? null,
    managerUserId: p.managerUserId ?? null,
    sortOrder: p.sortOrder ?? 0,
    isActive: p.isActive ?? true,
    legacyRefType: p.legacyRefType ?? null,
    legacyRefId: p.legacyRefId ?? null,
  };
}

describe('org-hierarchy pure helpers', () => {
  it('buildOrgTree nests children under parents and sorts by (sortOrder,name)', () => {
    const nodes = [
      node({ id: 'r', name: 'Region' }),
      node({ id: 'b2', parentNodeId: 'r', name: 'Bravo', sortOrder: 2 }),
      node({ id: 'b1', parentNodeId: 'r', name: 'Alpha', sortOrder: 1 }),
    ];
    const tree = buildOrgTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('r');
    expect(tree[0].children.map((c) => c.id)).toEqual(['b1', 'b2']);
  });

  it('buildOrgTree treats a node with an unknown parent as a root (no orphan loss)', () => {
    const tree = buildOrgTree([node({ id: 'x', parentNodeId: 'ghost' })]);
    expect(tree.map((n) => n.id)).toEqual(['x']);
  });

  it('descendantIds returns the node plus all descendants', () => {
    const nodes = [
      node({ id: 'a' }),
      node({ id: 'b', parentNodeId: 'a' }),
      node({ id: 'c', parentNodeId: 'b' }),
      node({ id: 'd' }),
    ];
    expect([...descendantIds('a', nodes)].sort()).toEqual(['a', 'b', 'c']);
    expect([...descendantIds('d', nodes)]).toEqual(['d']);
  });

  it('canReparent forbids cycles and self-parenting; allows root and valid moves', () => {
    const nodes = [
      node({ id: 'a' }),
      node({ id: 'b', parentNodeId: 'a' }),
      node({ id: 'c', parentNodeId: 'b' }),
      node({ id: 'x' }),
    ];
    expect(canReparent('a', null, nodes)).toBe(true);   // make root
    expect(canReparent('a', 'a', nodes)).toBe(false);   // self
    expect(canReparent('a', 'c', nodes)).toBe(false);   // into own descendant → cycle
    expect(canReparent('b', 'x', nodes)).toBe(true);    // valid move
    expect(canReparent('c', 'a', nodes)).toBe(true);    // up the tree is fine
  });

  it('orderedLevels sorts by depth then sortOrder then name', () => {
    const levels: OrgLevel[] = [
      { id: 'team', name: 'Team', nameAr: null, depth: 4, sortOrder: 4, parentLevelId: null, canHoldUsers: true, canHoldManager: true, systemKey: 'team' },
      { id: 'region', name: 'Region', nameAr: null, depth: 1, sortOrder: 1, parentLevelId: null, canHoldUsers: false, canHoldManager: true, systemKey: 'region' },
      { id: 'branch', name: 'Branch', nameAr: null, depth: 3, sortOrder: 3, parentLevelId: null, canHoldUsers: true, canHoldManager: true, systemKey: 'branch' },
    ];
    expect(orderedLevels(levels).map((l) => l.id)).toEqual(['region', 'branch', 'team']);
  });

  it('nodeCountByLevel and orgSummary aggregate correctly', () => {
    const nodes = [
      node({ id: 'a', levelId: 'L1', managerUserId: 'u1' }),
      node({ id: 'b', levelId: 'L1' }),
      node({ id: 'c', levelId: 'L2', isActive: false }),
    ];
    expect(nodeCountByLevel(nodes)).toEqual({ L1: 2, L2: 1 });
    expect(orgSummary(nodes)).toEqual({ total: 3, withManager: 1, active: 2 });
  });

  it('isManagedNode flags seeded (legacy-ref) nodes for delete protection', () => {
    expect(isManagedNode({ legacyRefId: 'branch-1' })).toBe(true);
    expect(isManagedNode({ legacyRefId: null })).toBe(false);
  });
});
