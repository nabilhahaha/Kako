import { describe, it, expect } from 'vitest';
import { visibleUsers, canSee, directReports, managerChain, wouldCycle, graphRoots, visibilityExplain, reverseVisibility, visibilitySource, type RpNode } from './route-planner-reporting';

const node = (userId: string, p: string | null = null, s: string | null = null, seeAll = false): RpNode => ({
  userId, name: userId, email: null, role: null, primaryManagerId: p, secondaryManagerId: s, seeAll, inGraph: true,
});

// Graph:
//   root
//   ├─ mgrA (primary→root)
//   │   ├─ repA1 (primary→mgrA)
//   │   └─ repA2 (primary→mgrA, secondary→mgrB)
//   └─ mgrB (primary→root)
//       └─ repB1 (primary→mgrB)
const G: RpNode[] = [
  node('root'),
  node('mgrA', 'root'),
  node('mgrB', 'root'),
  node('repA1', 'mgrA'),
  node('repA2', 'mgrA', 'mgrB'),
  node('repB1', 'mgrB'),
];

describe('visibleUsers (mirrors rp_visible_users)', () => {
  it('root sees the whole tree (self + all descendants)', () => {
    expect(visibleUsers(G, 'root')).toEqual(new Set(['root', 'mgrA', 'mgrB', 'repA1', 'repA2', 'repB1']));
  });
  it('mgrA sees self + direct/secondary reports', () => {
    expect(visibleUsers(G, 'mgrA')).toEqual(new Set(['mgrA', 'repA1', 'repA2']));
  });
  it('mgrB sees self + repB1 AND repA2 (via secondary edge)', () => {
    expect(visibleUsers(G, 'mgrB')).toEqual(new Set(['mgrB', 'repB1', 'repA2']));
  });
  it('a leaf sees only itself', () => {
    expect(visibleUsers(G, 'repA1')).toEqual(new Set(['repA1']));
  });
  it('see_all short-circuits to the whole company', () => {
    const g2 = G.map((n) => (n.userId === 'mgrA' ? { ...n, seeAll: true } : n));
    expect(visibleUsers(g2, 'mgrA')).toEqual(new Set(g2.map((n) => n.userId)));
  });
  it('a user with no access row sees only itself', () => {
    expect(visibleUsers(G, 'ghost')).toEqual(new Set(['ghost']));
  });
  it('is cycle-safe (mutual managers do not loop)', () => {
    const cyc = [node('x', 'y'), node('y', 'x')];
    expect(visibleUsers(cyc, 'x')).toEqual(new Set(['x', 'y']));
  });
});

describe('canSee / directReports / managerChain', () => {
  it('canSee follows the subtree', () => {
    expect(canSee(G, 'root', 'repB1')).toBe(true);
    expect(canSee(G, 'mgrA', 'repB1')).toBe(false);
    expect(canSee(G, 'mgrB', 'repA2')).toBe(true); // secondary edge
  });
  it('directReports returns one hop with the edge kind', () => {
    expect(directReports(G, 'mgrA').sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual([{ id: 'repA1', via: 'primary' }, { id: 'repA2', via: 'primary' }]);
    expect(directReports(G, 'mgrB').map((r) => r.id).sort()).toEqual(['repA2', 'repB1']);
  });
  it('managerChain walks primary edges up to the root', () => {
    expect(managerChain(G, 'repA1')).toEqual(['mgrA', 'root']);
    expect(managerChain(G, 'root')).toEqual([]);
  });
});

describe('wouldCycle (admin guard)', () => {
  it('rejects self-management', () => {
    expect(wouldCycle(G, 'mgrA', 'mgrA', null)).toBe(true);
  });
  it('rejects assigning a manager that is already a report', () => {
    expect(wouldCycle(G, 'mgrA', 'repA1', null)).toBe(true);     // direct report
    expect(wouldCycle(G, 'root', 'repB1', null)).toBe(true);     // transitive report
  });
  it('allows a valid new manager', () => {
    expect(wouldCycle(G, 'repB1', 'mgrA', null)).toBe(false);
    expect(wouldCycle(G, 'mgrA', 'mgrB', null)).toBe(false);
  });
});

describe('graphRoots', () => {
  it('finds users with no manager edge', () => {
    expect(graphRoots(G)).toEqual(['root']);
  });
});

describe('visibilityExplain (auditable WHY)', () => {
  const facts = (id: string) => Object.fromEntries(visibilityExplain(G, id).map((f) => [f.targetId, f]));
  it('marks self with depth 0', () => {
    expect(facts('mgrA')['mgrA']).toMatchObject({ reason: 'self', depth: 0, via: null });
  });
  it('marks a direct report as "direct" with the edge kind', () => {
    expect(facts('mgrA')['repA1']).toMatchObject({ reason: 'direct', depth: 1, via: 'primary' });
  });
  it('marks a secondary-edge report as direct via secondary', () => {
    expect(facts('mgrB')['repA2']).toMatchObject({ reason: 'direct', depth: 1, via: 'secondary' });
  });
  it('marks a deeper report as "subtree" with depth ≥ 2 and a full path', () => {
    const f = facts('root')['repA1'];
    expect(f.reason).toBe('subtree'); expect(f.depth).toBe(2);
    expect(f.path).toEqual(['root', 'mgrA', 'repA1']);
  });
  it('explains see_all for every other user', () => {
    const g2 = G.map((n) => (n.userId === 'mgrA' ? { ...n, seeAll: true } : n));
    const f = Object.fromEntries(visibilityExplain(g2, 'mgrA').map((x) => [x.targetId, x]));
    expect(f['mgrA'].reason).toBe('self');
    expect(f['root'].reason).toBe('see_all');
    expect(f['repB1'].reason).toBe('see_all');
    expect(visibilityExplain(g2, 'mgrA')).toHaveLength(g2.length);
  });
});

describe('reverseVisibility + visibilitySource ("Who can see me?")', () => {
  it('lists every viewer that can see the target, with reason + path', () => {
    const rev = reverseVisibility(G, 'repA2');
    const byViewer = Object.fromEntries(rev.map((r) => [r.viewerId, r.fact]));
    // repA2 reports to mgrA (primary) and mgrB (secondary); root sees all transitively.
    expect(Object.keys(byViewer).sort()).toEqual(['mgrA', 'mgrB', 'root']);
    expect(byViewer['mgrA']).toMatchObject({ reason: 'direct', via: 'primary' });
    expect(byViewer['mgrB']).toMatchObject({ reason: 'direct', via: 'secondary' });
    expect(byViewer['root'].reason).toBe('subtree');
    expect(byViewer['root'].path).toEqual(['root', 'mgrA', 'repA2']);
  });
  it('maps the visibility source from the fact', () => {
    const rev = Object.fromEntries(reverseVisibility(G, 'repA2').map((r) => [r.viewerId, r.fact]));
    expect(visibilitySource(rev['mgrA'])).toBe('primary');
    expect(visibilitySource(rev['mgrB'])).toBe('secondary');
  });
  it('see_all viewers appear as a source of see_all', () => {
    const g2 = G.map((n) => (n.userId === 'root' ? { ...n, seeAll: true } : n));
    const rev = Object.fromEntries(reverseVisibility(g2, 'repA1').map((r) => [r.viewerId, r.fact]));
    expect(visibilitySource(rev['root'])).toBe('see_all');
  });
});
