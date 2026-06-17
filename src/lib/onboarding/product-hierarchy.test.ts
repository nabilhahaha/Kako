import { describe, it, expect } from 'vitest';
import {
  buildProductTree, orderedProductLevels, productSummary, isManagedProductNode,
  type ProductNode, type ProductLevel,
} from './product-hierarchy';

function node(p: Partial<ProductNode> & { id: string }): ProductNode {
  return {
    id: p.id,
    levelId: p.levelId ?? 'L',
    parentNodeId: p.parentNodeId ?? null,
    name: p.name ?? p.id,
    nameAr: p.nameAr ?? null,
    sortOrder: p.sortOrder ?? 0,
    isActive: p.isActive ?? true,
    legacyRefType: p.legacyRefType ?? null,
    legacyRefId: p.legacyRefId ?? null,
  };
}

describe('product-hierarchy helpers', () => {
  it('buildProductTree nests categories by parent', () => {
    const tree = buildProductTree([
      node({ id: 'food', name: 'Food' }),
      node({ id: 'snacks', parentNodeId: 'food', name: 'Snacks' }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(['snacks']);
  });

  it('orderedProductLevels sorts by depth', () => {
    const levels: ProductLevel[] = [
      { id: 'b', name: 'Brand', nameAr: null, depth: 2, sortOrder: 2, parentLevelId: null, systemKey: null },
      { id: 'c', name: 'Category', nameAr: null, depth: 1, sortOrder: 1, parentLevelId: null, systemKey: 'category' },
    ];
    expect(orderedProductLevels(levels).map((l) => l.id)).toEqual(['c', 'b']);
  });

  it('productSummary counts total + active', () => {
    expect(productSummary([node({ id: 'a' }), node({ id: 'b', isActive: false })]))
      .toEqual({ total: 2, active: 1 });
  });

  it('isManagedProductNode protects seeded category nodes', () => {
    expect(isManagedProductNode({ legacyRefId: 'cat-1' })).toBe(true);
    expect(isManagedProductNode({ legacyRefId: null })).toBe(false);
  });
});
