/**
 * Configurable Product Hierarchy — pure types + helpers (no I/O). Mirrors the
 * Organization hierarchy: levels + a nested node tree, seeded from the existing
 * `erp_product_categories` tree. `erp_product_categories` stays the canonical
 * category entity (each node carries a `legacyRef`), and `erp_products_catalog`
 * is untouched — this is a presentation/config layer only.
 */

import { buildTree, type WithChildren } from './tree';

export interface ProductLevel {
  id: string;
  name: string;
  nameAr: string | null;
  depth: number;
  sortOrder: number;
  parentLevelId: string | null;
  systemKey: string | null; // 'category' | null = custom
}

export interface ProductNode {
  id: string;
  levelId: string;
  parentNodeId: string | null;
  name: string;
  nameAr: string | null;
  sortOrder: number;
  isActive: boolean;
  legacyRefType: string | null; // 'category' | null = custom
  legacyRefId: string | null;
}

export type ProductTreeNode = WithChildren<ProductNode>;

/** Seeded (legacy-ref) nodes mirror erp_product_categories and must not be
 *  deleted here — that would orphan a category reference. */
export function isManagedProductNode(n: Pick<ProductNode, 'legacyRefId'>): boolean {
  return n.legacyRefId != null;
}

export function buildProductTree(nodes: ProductNode[]): ProductTreeNode[] {
  return buildTree(nodes);
}

export function orderedProductLevels(levels: ProductLevel[]): ProductLevel[] {
  return [...levels].sort(
    (a, b) => a.depth - b.depth || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
  );
}

export function productSummary(nodes: ProductNode[]): { total: number; active: number } {
  let active = 0;
  for (const n of nodes) if (n.isActive) active += 1;
  return { total: nodes.length, active };
}

export { descendantIds, canReparent } from './tree';
