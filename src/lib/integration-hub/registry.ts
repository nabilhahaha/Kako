// ============================================================================
// Universal Integration Hub — connector descriptor + registry (Phase 6A). Pure,
// no DB. Formalizes the connector framework (proposal goal 1): each connector is a
// descriptor (category, capabilities, auth, supported entities, version); the
// registry resolves connectors by id/category. Mirrors the tax-pack registry and
// the existing connector presets — reuse-first; adding a connector = registering a
// descriptor (+ its runtime adapter), no core change.
// ============================================================================

export type ConnectorCategory = 'erp' | 'accounting' | 'fmcg' | 'commerce' | 'data' | 'generic';
export type ConnectorAuthKind = 'oauth2' | 'oauth1' | 'apikey' | 'basic' | 'file' | 'none';
export type SyncDirection = 'in' | 'out' | 'bidirectional';

/** A mappable entity = ANY platform entity key (from the entity registry), e.g.
 *  'customer', 'supplier', 'product', 'brand', 'warehouse', 'route', 'salesman',
 *  'tax_code', 'price_list', 'sales_order', 'trade_spend', 'visit', … and future
 *  custom entities. Open string (not a closed union) so the Universal Entity
 *  Mapping Platform (6B) can map any current or future entity — connector-agnostic. */
export type MappableEntity = string;

/** Well-known entity keys (reference only; the platform accepts any entity key). */
export const KNOWN_MAPPABLE_ENTITIES = [
  'customer', 'supplier', 'product', 'brand', 'category', 'warehouse', 'branch',
  'route', 'territory', 'salesman', 'user', 'role', 'tax_code', 'tax_group',
  'price_list', 'payment_term', 'uom', 'sales_order', 'invoice', 'credit_note',
  'debit_note', 'return', 'collection', 'payment', 'purchase_order', 'transfer',
  'stock_transaction', 'trade_spend', 'promotion', 'claim', 'deduction',
  'perfect_store', 'msl', 'oos', 'visit', 'journey_plan', 'approval_workflow',
] as const;

export interface ConnectorDescriptor {
  id: string;                          // e.g. 'sap_b1', 'quickbooks', 'google_sheets'
  name: string;
  category: ConnectorCategory;
  authKind: ConnectorAuthKind;
  direction: SyncDirection;
  entities: readonly MappableEntity[];
  version: string;
  /** Per-connector flag env name (default OFF), e.g. 'KAKO_CONN_SAP_B1'. */
  flag?: string;
  /** Tier for rollout sequencing (1 = first). */
  tier?: 1 | 2 | 3;
}

export class ConnectorRegistry {
  private byId = new Map<string, ConnectorDescriptor>();

  register(c: ConnectorDescriptor): void {
    this.byId.set(c.id, c);
  }

  get(id: string): ConnectorDescriptor | undefined {
    return this.byId.get(id);
  }

  list(): ConnectorDescriptor[] {
    return [...this.byId.values()];
  }

  byCategory(category: ConnectorCategory): ConnectorDescriptor[] {
    return this.list().filter((c) => c.category === category);
  }

  /** Connectors that can map a given entity (drives the Mapping Studio). */
  supporting(entity: MappableEntity): ConnectorDescriptor[] {
    return this.list().filter((c) => c.entities.includes(entity));
  }
}

/** Process-wide connector registry (adapters register their descriptors in 6E). */
export const connectorRegistry = new ConnectorRegistry();
