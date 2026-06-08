// ============================================================================
// Entity 360 Platform (Phase 7) — types. A unified, generic 360 view for ANY
// entity (customer / product / category / brand / salesman / supervisor / area /
// region / route / promotion): one engine + a profile registry of panels, NOT a
// bespoke page per entity. Reuses the timeline, ownership ledger, and role-
// governance section security.
// ============================================================================

export type Entity360Type =
  | 'customer' | 'product' | 'category' | 'brand' | 'salesman' | 'supervisor'
  | 'area_manager' | 'region' | 'route' | 'promotion';

/** A panel/section of a 360 view (sourced from an existing read-model). */
export interface Entity360Panel {
  key: string;                 // 'timeline' | 'orders' | 'collections' | 'profitability' | ...
  label: string;
  /** The read-model/source this panel draws from (documentation/wiring hint). */
  source: string;
  /** Default visibility when no role section rule exists (conservative). */
  defaultVisible: boolean;
}

/** A 360 profile: the ordered panels an entity type exposes. */
export interface Entity360Profile {
  entity: Entity360Type;
  label: string;
  panels: Entity360Panel[];
}
