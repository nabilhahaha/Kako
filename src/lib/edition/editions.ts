// ============================================================================
// Edition & branding abstraction (Offline Program requirement #2)
// ----------------------------------------------------------------------------
// One shared offline core, exported as several branded editions WITHOUT forking
// the core. Everything brand- or vertical-specific is expressed as data in an
// `Edition` descriptor; app/scripts read the descriptor instead of hard-coding
// a brand name or business type.
//
// The running edition is chosen at package/build time via `KAKO_EDITION`
// (defaults to `retail`). `currentEdition()` is pure and safe to call from the
// app, the offline scripts, and tests.
//
// IMPORTANT: there must be NO edition-name string literals scattered through the
// app — `edition.test.ts` asserts this. Adding a new brand is "add a descriptor
// + assets", never a code change in the core.
// ============================================================================

/** The editions the offline core can be packaged as. */
export type EditionId = 'retail' | 'pharmacy' | 'restaurant' | 'fmcg';

export interface Edition {
  /** Stable identifier (also used as the licensing `productCode`). */
  id: EditionId;
  /** Customer-facing brand name (window title, installer, receipts). */
  brand: string;
  /** Maps onto the EXISTING business_type gate that drives module/nav filtering.
   *  Editions only *select* an already-supported vertical; they do not invent
   *  new gating behavior. */
  businessType: 'clothing' | 'pharmacy' | 'restaurant' | 'general';
  /** Short product code embedded in the signed license (P4). */
  productCode: string;
  /** Branding/packaging assets resolved at build time. */
  assets: {
    /** App / window / tray name. */
    appName: string;
    /** Reverse-DNS bundle id for the desktop package (P6). */
    bundleId: string;
    /** Accent color (hex) used for splash / theming. */
    accent: string;
    /** Default receipt header line when the store hasn't set one. */
    receiptHeader: string;
  };
}

/** Descriptor table — the ONLY place brand/vertical specifics live. */
export const EDITIONS: Record<EditionId, Edition> = {
  retail: {
    id: 'retail',
    brand: 'VANTORA Retail',
    businessType: 'clothing',
    productCode: 'VNT-RETAIL',
    assets: { appName: 'VANTORA Retail', bundleId: 'com.vantora.retail', accent: '#2563eb', receiptHeader: 'VANTORA Retail' },
  },
  pharmacy: {
    id: 'pharmacy',
    brand: 'VANTORA Pharmacy',
    businessType: 'pharmacy',
    productCode: 'VNT-PHARMACY',
    assets: { appName: 'VANTORA Pharmacy', bundleId: 'com.vantora.pharmacy', accent: '#0d9488', receiptHeader: 'VANTORA Pharmacy' },
  },
  restaurant: {
    id: 'restaurant',
    brand: 'VANTORA Restaurant',
    businessType: 'restaurant',
    productCode: 'VNT-RESTAURANT',
    assets: { appName: 'VANTORA Restaurant', bundleId: 'com.vantora.restaurant', accent: '#ea580c', receiptHeader: 'VANTORA Restaurant' },
  },
  fmcg: {
    id: 'fmcg',
    brand: 'VANTORA FMCG',
    businessType: 'general',
    productCode: 'VNT-FMCG',
    assets: { appName: 'VANTORA FMCG', bundleId: 'com.vantora.fmcg', accent: '#7c3aed', receiptHeader: 'VANTORA FMCG' },
  },
};

/** The default edition when nothing is configured. */
export const DEFAULT_EDITION_ID: EditionId = 'retail';

/** Type guard for an arbitrary string. */
export function isEditionId(value: string | undefined | null): value is EditionId {
  return value === 'retail' || value === 'pharmacy' || value === 'restaurant' || value === 'fmcg';
}

/** Resolve an edition by id, falling back to the default for unknown values. */
export function resolveEdition(id: string | undefined | null): Edition {
  return EDITIONS[isEditionId(id) ? id : DEFAULT_EDITION_ID];
}

/** The edition this build runs as, from `KAKO_EDITION` (defaults to retail).
 *  Pure: reads only the environment, returns a descriptor. */
export function currentEdition(): Edition {
  return resolveEdition(process.env.KAKO_EDITION);
}
