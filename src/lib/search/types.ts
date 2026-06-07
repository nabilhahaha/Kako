// ============================================================================
// Search OS — shared types (V1). The unified index is entity-neutral; the
// provider registry (providers.ts) holds all entity-specific knowledge.
// ============================================================================

export type SearchEntityType =
  | 'customer' | 'product' | 'supplier' | 'order' | 'invoice'
  | 'return' | 'visit' | 'workflow' | 'attachment' | 'user';

export const SEARCH_ENTITY_TYPES: SearchEntityType[] = [
  'customer', 'product', 'supplier', 'order', 'invoice', 'return', 'visit', 'workflow', 'attachment', 'user',
];

/** A row in erp_search_documents (the unified index). */
export interface SearchDocument {
  company_id: string | null;
  branch_id: string | null;
  entity_type: SearchEntityType;
  entity_id: string;
  title: string;
  subtitle: string | null;
  body: string | null;
  identifiers: string[];
  href: string;
  permission_key: string | null;
  metadata: Record<string, unknown>;
}

export type MatchKind = 'exact' | 'prefix' | 'lexical' | 'fuzzy';

/** A single ranked result returned to the UI. */
export interface SearchHit {
  entityType: SearchEntityType;
  entityId: string;
  title: string;
  subtitle: string | null;
  href: string;
  metadata: Record<string, unknown>;
  score: number;
  matchKind: MatchKind;
}

/** Results grouped by entity (categorized results). */
export interface SearchCategory {
  entityType: SearchEntityType;
  count: number;
  hits: SearchHit[];
}

export interface SearchResult {
  query: string;
  categories: SearchCategory[];
  total: number;
}
