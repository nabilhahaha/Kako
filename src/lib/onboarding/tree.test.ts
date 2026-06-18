import { describe, it, expect } from 'vitest';
import { buildTree, descendantIds, canReparent, type TreeBase } from './tree';

function n(id: string, parentNodeId: string | null = null, sortOrder = 0, name = id): TreeBase {
  return { id, parentNodeId, sortOrder, name };
}

describe('generic tree helpers', () => {
  it('buildTree nests + sorts and never drops orphans', () => {
    const tree = buildTree([
      n('r', null, 0, 'Root'),
      n('b', 'r', 2, 'Bravo'),
      n('a', 'r', 1, 'Alpha'),
      n('x', 'ghost', 0, 'X'), // unknown parent → treated as root
    ]);
    expect(tree.map((t) => t.id).sort()).toEqual(['r', 'x']);
    const root = tree.find((t) => t.id === 'r')!;
    expect(root.children.map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('descendantIds is inclusive and complete', () => {
    const nodes = [n('a'), n('b', 'a'), n('c', 'b'), n('d')];
    expect([...descendantIds('a', nodes)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('canReparent blocks cycles + self, allows valid + root', () => {
    const nodes = [n('a'), n('b', 'a'), n('c', 'b')];
    expect(canReparent('a', null, nodes)).toBe(true);
    expect(canReparent('a', 'a', nodes)).toBe(false);
    expect(canReparent('a', 'c', nodes)).toBe(false);
    expect(canReparent('c', 'a', nodes)).toBe(true);
  });
});
