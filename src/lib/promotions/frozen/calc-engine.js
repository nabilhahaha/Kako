/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 676–823
 * Block sha256: 3a4208a1efc3da11f8b534b9d77dc83f536e34242226c5fb4132995d96defe37
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ CALC ENGINE — FROZEN (verbatim from audited source) ============ */
/* ============================================================================
   ROSHEN SETTLEMENT PLATFORM — CORE ENGINE (Wave 1)
   Data-driven promotion architecture + guarded calculation layer.
   Business rule: settlement formulas are the source of truth and MUST NOT change.
   Reference invariants (rate 80%): eid=212,361.60  lovita=39,877.32  total=252,238.92
   ============================================================================ */

/* ---------------------------------------------------------------------------
   1. GUARDED MATH — prevents NaN / Infinity / divide-by-zero everywhere.
   Every ratio/derived number in the app must flow through these helpers.
   --------------------------------------------------------------------------- */
const Calc = (() => {
  /** Coerce anything to a finite number; non-finite -> 0. */
  const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : 0; };
  /** Safe divide: returns `fallback` (default 0) when denominator is 0 or invalid. */
  const div = (a, b, fallback = 0) => { const d = num(b); return d === 0 ? fallback : num(a) / d; };
  /** Percentage a/b*100, guarded. Returns null when undefined (so UI can show "—"). */
  const pct = (a, b) => { const d = num(b); return d === 0 ? null : (num(a) / d) * 100; };
  /** Clamp n into [min,max]. */
  const clamp = (n, min, max) => Math.max(min, Math.min(max, num(n)));
  /** Round to d decimals, guarded. */
  const round = (n, d = 2) => { const f = 10 ** d; return Math.round(num(n) * f) / f; };
  /** Sum a numeric field over rows, guarded. */
  const sum = (rows, key) => rows.reduce((s, r) => s + num(typeof key === 'function' ? key(r) : r[key]), 0);
  return { num, div, pct, clamp, round, sum };
})();

/* ---------------------------------------------------------------------------
   2. FORMATTERS — single source of display formatting.
   --------------------------------------------------------------------------- */
const Fmt = {
  money0: (n) => 'SAR ' + Math.round(Calc.num(n)).toLocaleString('en-US'),
  n0: (n) => Math.round(Calc.num(n)).toLocaleString('en-US'),
  n2: (n) => Calc.num(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  /** Percentage display with guard: null -> "—", else "X.X%". */
  pct: (v) => v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toFixed(1) + '%',
};

/* ---------------------------------------------------------------------------
   3. LINE CLASSIFICATION — fixes the negative-quantity bug.
   A line is FREE when net==0. A line/invoice is a RETURN when qty<0 (credit note).
   Returns never produce negative percentages: they are tagged and surfaced,
   and ratio math uses guarded denominators.
   --------------------------------------------------------------------------- */
const LineKind = {
  classify(line) {
    const cases = Calc.num(line.cases);
    const isFree = line.type === 'FREE';
    const isReturn = cases < 0 || String(line.code || '').toUpperCase().startsWith('CN');
    return {
      isFree,
      isReturn,
      kind: isReturn ? 'RETURN' : (isFree ? 'FREE' : 'PAID'),
      label: isReturn ? 'Return / Credit Note' : (isFree ? 'Free Goods' : 'Paid'),
    };
  },
  invoiceIsReturn(inv) {
    // Explicit CN prefix OR any negative-quantity line
    if (inv.isCN) return true;
    return (inv.lines || []).some(l => Calc.num(l.cases) < 0);
  },
};

/* ---------------------------------------------------------------------------
   4. PROMOTION ENGINE — data-driven. A promotion is pure configuration.
   Adding a promotion = pushing one config object. No code changes, ever.
   The engine NEVER recomputes settlement values from raw data — it consumes
   the pre-audited bundle (source of truth) and only derives DISPLAY aggregates
   through guarded math. This preserves calculation identity exactly.
   --------------------------------------------------------------------------- */
class Promotion {
  /**
   * @param {object} cfg  Promotion configuration (the ONLY thing needed to add a promo)
   *   id, displayName, startDate, endDate, mechanic, plannedRatio,
   *   calcMode ('free_value_reimbursement'), rate, vat, theme{accent},
   *   data { sku, cust, invoices, kpi, meta }  <- audited source-of-truth bundle
   */
  constructor(cfg) {
    this.id = cfg.id;
    this.displayName = cfg.displayName;
    this.startDate = cfg.startDate;
    this.endDate = cfg.endDate;
    this.mechanic = cfg.mechanic;
    this.plannedRatio = Calc.num(cfg.plannedRatio);
    this.calcMode = cfg.calcMode || 'free_value_reimbursement';
    this.theme = cfg.theme || { accent: '#B01116' };
    this._rate = Calc.clamp(cfg.rate ?? 0.8, 0, 1);
    this.vat = cfg.vat ?? 0.15;
    this.data = cfg.data;
  }
  get rate() { return this._rate; }
  set rate(r) { this._rate = Calc.clamp(r, 0, 1); }   // rate can never leave [0,1]

  /* ---- SETTLEMENT (source of truth — identity preserved) ---- */
  get freeValue() { return Calc.num(this.data.kpi.fval); }
  get compensation() {
    // The ONLY settlement formula in the system. Mode-dispatched but currently
    // one mode. Kept centralized so it is provably unchanged across promotions.
    switch (this.calcMode) {
      case 'free_value_reimbursement':
      default:
        return this.freeValue * this._rate;
    }
  }
  get compensationInclVat() { return this.compensation * (1 + this.vat); }

  /* ---- DISPLAY AGGREGATES (guarded; never settlement-affecting) ---- */
  get paidCases() { return Calc.num(this.data.kpi.paid); }
  get freeCases() { return Calc.num(this.data.kpi.free); }
  get actualRatio() { return Calc.pct(this.freeCases, this.paidCases); }   // null-safe
  get recipients() { return Calc.num(this.data.kpi.ncust); }
  get invoiceCount() { return Calc.num(this.data.kpi.ninv); }
  skuCompensation(s) { return Calc.num(s.val) * this._rate; }
  custCompensation(c) { return Calc.num(c.val) * this._rate; }

  /** Health status via semantic thresholds (execution vs plan). */
  get health() {
    const r = this.actualRatio, p = this.plannedRatio;
    if (r === null || p === 0) return 'neutral';
    const delta = r / p;                 // 1.0 = on plan
    if (delta > 1.15) return 'critical';  // over-delivery / leakage
    if (delta > 1.05) return 'warning';
    if (delta >= 0.85) return 'healthy';  // within entitlement
    return 'attention';                   // under-delivery
  }
}

class PromotionEngine {
  constructor(configs) {
    this.promotions = configs.map(c => new Promotion(c));
    this._active = 0;
  }
  /** Register a new promotion at runtime from a JSON config. Zero code changes. */
  register(cfg) { this.promotions.push(new Promotion(cfg)); return this; }
  get active() { return this.promotions[this._active]; }
  get activeIndex() { return this._active; }
  setActive(i) { this._active = Calc.clamp(i, 0, this.promotions.length - 1); return this.active; }

  /* ---- PORTFOLIO ROLLUP (guarded) ---- */
  get portfolioFreeValue() { return Calc.sum(this.promotions, p => p.freeValue); }
  get portfolioCompensation() { return Calc.sum(this.promotions, p => p.compensation); }
  get portfolioCompensationInclVat() { return Calc.sum(this.promotions, p => p.compensationInclVat); }
  get portfolioRecipients() { return Calc.sum(this.promotions, p => p.recipients); }
  get portfolioInvoices() { return Calc.sum(this.promotions, p => p.invoiceCount); }
  /** Distributor cost-share retained by company = free value not reimbursed. */
  get companyShareRetained() { return this.portfolioFreeValue - this.portfolioCompensation; }
}
/* ===== END VERBATIM ===== */
export { Calc, Fmt, LineKind, Promotion, PromotionEngine };