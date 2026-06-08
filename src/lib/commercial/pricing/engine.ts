// ============================================================================
// Commercial Excellence — pricing engine (Phase 7). Pure. Highly flexible FMCG
// pricing: many price SOURCES (standard/customer/contract/branch/region/channel/
// sub-channel/route/salesman/temporary/promotion/distributor/modern-trade/
// wholesale/retail), a COMPANY-CONFIGURABLE priority hierarchy, multiple RULE
// kinds (fixed/discount/quantity-break/value-break/tiered/time/seasonal), and
// effective-dated validity (history queryable). No hardcoded priority. No I/O.
// ============================================================================

export type PriceSource =
  | 'standard' | 'customer' | 'contract' | 'branch' | 'region' | 'channel' | 'sub_channel'
  | 'route' | 'salesman' | 'temporary' | 'promotion' | 'distributor' | 'modern_trade'
  | 'wholesale' | 'retail';

export type PriceRuleKind =
  | 'fixed_price' | 'fixed_discount' | 'percentage_discount'
  | 'quantity_break' | 'value_break' | 'tiered' | 'time_based' | 'seasonal';

export interface PriceBreak { min: number; price?: number; discountPct?: number }

export interface PriceRule {
  id: string;
  source: PriceSource;
  productId: string;
  kind: PriceRuleKind;
  price?: number;            // fixed_price
  discount?: number;         // fixed_discount (amount)
  discountPct?: number;      // percentage_discount
  breaks?: PriceBreak[];     // quantity_break / value_break / tiered
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
}

export interface PriceContext {
  productId: string;
  basePrice: number;         // standard list price (fallback)
  quantity: number;
  lineValue?: number;        // for value breaks
  asOf: string;              // ISO — validity + history
}

/** Default priority (company-overridable, never hardcoded into resolution). */
export const DEFAULT_PRICE_PRIORITY: readonly PriceSource[] = [
  'contract', 'customer', 'promotion', 'temporary', 'route', 'salesman',
  'sub_channel', 'channel', 'modern_trade', 'wholesale', 'retail',
  'distributor', 'branch', 'region', 'standard',
];

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

function isValid(rule: PriceRule, asOf: string): boolean {
  if (rule.effectiveFrom && asOf < rule.effectiveFrom) return false;
  if (rule.effectiveTo && asOf > rule.effectiveTo) return false;
  return true;
}

/** Resolve a single rule into a unit price for the context (or null). Pure. */
export function applyRule(rule: PriceRule, ctx: PriceContext): number | null {
  if (rule.productId !== ctx.productId || !isValid(rule, ctx.asOf)) return null;
  switch (rule.kind) {
    case 'fixed_price': case 'time_based': case 'seasonal':
      return rule.price != null ? round2(rule.price) : null;
    case 'fixed_discount':
      return rule.discount != null ? round2(ctx.basePrice - rule.discount) : null;
    case 'percentage_discount':
      return rule.discountPct != null ? round2(ctx.basePrice * (1 - rule.discountPct / 100)) : null;
    case 'quantity_break': case 'tiered': {
      const b = [...(rule.breaks ?? [])].filter((x) => ctx.quantity >= x.min).sort((a, c) => c.min - a.min)[0];
      if (!b) return null;
      return b.price != null ? round2(b.price) : b.discountPct != null ? round2(ctx.basePrice * (1 - b.discountPct / 100)) : null;
    }
    case 'value_break': {
      const v = ctx.lineValue ?? ctx.basePrice * ctx.quantity;
      const b = [...(rule.breaks ?? [])].filter((x) => v >= x.min).sort((a, c) => c.min - a.min)[0];
      if (!b) return null;
      return b.price != null ? round2(b.price) : b.discountPct != null ? round2(ctx.basePrice * (1 - b.discountPct / 100)) : null;
    }
    default: return null;
  }
}

export interface ResolvedPrice {
  unitPrice: number;
  source: PriceSource;
  ruleId: string | null;
}

/**
 * Resolve the effective price: walk the priority order, take the first source
 * with a valid matching rule; fall back to the standard base price. Pure.
 */
export function resolvePrice(
  rules: readonly PriceRule[],
  ctx: PriceContext,
  priority: readonly PriceSource[] = DEFAULT_PRICE_PRIORITY,
): ResolvedPrice {
  for (const source of priority) {
    for (const rule of rules.filter((r) => r.source === source)) {
      const price = applyRule(rule, ctx);
      if (price != null) return { unitPrice: price, source, ruleId: rule.id };
    }
  }
  return { unitPrice: round2(ctx.basePrice), source: 'standard', ruleId: null };
}
