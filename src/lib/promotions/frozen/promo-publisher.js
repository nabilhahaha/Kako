/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 3144–3272
 * Block sha256: 8305dabc6d8541471af9557cb80740baeffc51b1f94b087a91845f3f46b9dc85
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc } from './calc-engine.js';
import { engine } from './engine-bootstrap.js';
import { RawParser } from './raw-parser.js';
import { PBModel } from './pb-model.js';
import { FilterEngine } from './filter-engine.js';
import { PromoSimulator } from './promo-simulator.js';
import { Toast } from '../ui-bridge.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ PROMO PUBLISHER — builder promotions as first-class campaigns ============ */
/* ===========================
   PROMO PUBLISHER (ADDITIVE) — makes ACTIVE builder promotions first-class
   campaigns alongside the audited ones. Each active promotion is compiled
   into a settlement data bundle from the cumulative data pool using the
   FROZEN RawParser.buildPromoData (the exact same path as a raw upload) and
   registered into the engine, so it gets the full Settlement / Analytics /
   Invoice Explorer treatment and recalculates whenever new data is added.
   The audited campaigns and every frozen formula remain untouched.
   =========================== */
const PromoPublisher = (() => {
  const TAG = 'pbpub_';
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function isoToLabel(iso) {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  /** Flatten the data pool into RawParser-shaped lines (honoring customer scope). */
  function poolAsParsedLines(promo) {
    const custSet = promo.customerScope === 'selected' ? new Set(promo.customerCodes) : null;
    const lines = [];
    PromoSimulator.invoicePool().forEach(inv => {
      if (String(inv._src || '').startsWith(TAG)) return; // never rebuild from a published bundle
      if (custSet && !custSet.has(inv.code)) return;
      const dateMs = FilterEngine.parseDate(inv.date);
      (inv.lines || []).forEach(l => {
        lines.push({
          inv: inv.inv, date: inv.date, dateMs, custCode: inv.code, cust: inv.cust,
          rep: inv.sales, channel: inv.channel, city: inv.city,
          code: l.code, name: l.name, group: '', unit: l.unit,
          cases: Calc.num(l.cases), each: Calc.num(l.each), price: Calc.num(l.price),
          net: Calc.num(l.net), gross: Calc.num(l.gross), tax: 0,
          isReturn: !!inv.isCN, type: (Calc.num(l.net) === 0 ? 'FREE' : 'PAID'),
        });
      });
    });
    return { lines };
  }
  /** Builder promotion → the same config shape the raw-upload flow feeds the engine. */
  function cfgFor(promo) {
    let mech = 'custom', plan = 0;
    if (promo.rewardType === 'free_product' && Calc.num(promo.buyQty) > 0 && Calc.num(promo.reward.rewardQty) > 0) {
      mech = Calc.num(promo.buyQty) + '+' + Calc.num(promo.reward.rewardQty);
      plan = Math.round(Calc.num(promo.reward.rewardQty) / Calc.num(promo.buyQty) * 100 * 100) / 100;
    }
    return {
      id: TAG + promo.id, name: promo.name || 'Untitled Promotion', mechanic: mech, plan_ratio: plan,
      rate: 0.8, vat: 0.15, dateFrom: isoToLabel(promo.startDate), dateTo: isoToLabel(promo.endDate),
      skuCodes: promo.productCodes.slice(), scope: 'recipients',
    };
  }
  const isPublished = id => String(id).startsWith(TAG);
  const lastErrors = new Map(); // campaign id -> last publish failure message

  /**
   * Display enrichment: the frozen buildPromoData fills settlement values
   * (val / fval → compensation) but not the cases-based display aggregates
   * the audited bundles carry (cust.invs/paid/free, sku.paid/free, kpi
   * cases). Fill them here with the audited bundles' exact definitions
   * (verified against the Eid data): paid/free = promo-line cases split by
   * net>0 / net==0; invs = the customer's invoice count in the bundle.
   * Settlement values are NOT touched — compensation is unchanged.
   */
  function enrichBundle(data) {
    const skuIx = new Map(data.sku.map(s => [s.code, s]));
    const custIx = new Map(data.cust.map(c => [c.cust, c]));
    data.sku.forEach(s => { s.paid = 0; s.free = 0; s.kg = s.kg || 0; });
    data.cust.forEach(c => { c.paid = 0; c.free = 0; c.invs = 0; });
    data.invoices.forEach(inv => {
      const c = custIx.get(inv.cust);
      let touches = false;
      (inv.lines || []).forEach(l => {
        if (!l.inPromo) return;
        touches = true;
        const cases = Calc.num(l.cases);
        const isFree = Calc.num(l.net) === 0;
        const s = skuIx.get(l.code);
        if (s) { if (isFree) s.free += cases; else s.paid += cases; }
        if (c) { if (isFree) c.free += cases; else c.paid += cases; }
      });
      if (c && touches) c.invs += 1;
    });
    data.sku.forEach(s => { s.paid = Calc.round(s.paid); s.free = Calc.round(s.free); s.ratio = Calc.round(Calc.pct(s.free, s.paid) || 0, 1); });
    data.cust.forEach(c => { c.paid = Calc.round(c.paid); c.free = Calc.round(c.free); c.ratio = Calc.round(Calc.pct(c.free, c.paid) || 0, 1); });
    // KPI cases (display): fval / ninv / ncust / plan_ratio stay from the frozen path
    const tp = Calc.sum(data.sku, 'paid'), tf = Calc.sum(data.sku, 'free');
    data.kpi.paid = Calc.round(tp);
    data.kpi.free = Calc.round(tf);
    data.kpi.ratio = Calc.pct(tf, tp);
    return data;
  }

  /** Rebuild every ACTIVE builder promotion's campaign entry from the current pool. */
  function sync() {
    const activeId = engine.active && engine.active.id;
    const prevRates = new Map();
    for (let i = engine.promotions.length - 1; i >= 0; i--) {
      const p = engine.promotions[i];
      if (isPublished(p.id)) { prevRates.set(p.id, p.rate); engine.promotions.splice(i, 1); }
    }
    PBModel.load().filter(p => p.status === 'active' && p.productCodes.length && Calc.num(p.buyQty) > 0
      // rep-incentive programs are staff payouts, not customer settlements — never published as campaigns
      && !(p.repIncentive && Calc.num(p.repIncentive.minCustomers) > 0)).forEach(p => {
      try {
        const cfg = cfgFor(p);
        const data = enrichBundle(RawParser.buildPromoData(poolAsParsedLines(p), cfg)); // frozen calc path + display enrichment
        data.invoices.forEach(inv => { inv._src = cfg.id; });
        engine.register({
          id: cfg.id, displayName: cfg.name, startDate: cfg.dateFrom || '—', endDate: cfg.dateTo,
          mechanic: cfg.mechanic, plannedRatio: cfg.plan_ratio, calcMode: 'free_value_reimbursement',
          rate: prevRates.has(cfg.id) ? prevRates.get(cfg.id) : cfg.rate, vat: cfg.vat,
          theme: { accent: '#B01116' }, data,
        });
        lastErrors.delete(TAG + p.id);
      } catch (e) {
        console.warn('publish promotion failed:', p.name, e);
        lastErrors.set(TAG + p.id, String((e && e.message) || e));
        try { Toast.err('Could not publish "' + (p.name || 'promotion') + '": ' + ((e && e.message) || e)); } catch (e2) {}
      }
    });
    let idx = engine.promotions.findIndex(p => p.id === activeId);
    if (idx < 0) idx = 0;
    engine.setActive(idx);
    if (typeof Palette !== 'undefined') Palette.invalidate();
  }
  return { sync, isPublished, TAG, lastError: id => lastErrors.get(id) || null };
})();

/* ===== END VERBATIM ===== */
export { PromoPublisher };