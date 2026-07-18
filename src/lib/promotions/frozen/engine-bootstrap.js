/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 829–835
 * Block sha256: 7ebe4f09ac618aa2b8b0edd39350d597c71c1a61271c37caacf223f121fdb940
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { PromotionEngine } from './calc-engine.js';
import { PLATFORM_DATA } from './platform-data.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ ENGINE BOOTSTRAP (verbatim) ============ */
const engine = new PromotionEngine(PLATFORM_DATA.promos.map(p => ({
  id: p.id, displayName: p.data.meta.name, startDate: p.data.meta.period,
  mechanic: p.data.kpi.mechanic, plannedRatio: p.data.kpi.plan_ratio,
  calcMode: 'free_value_reimbursement', rate: p.rate, vat: p.vat,
  theme: { accent: '#B01116' }, data: p.data
})));
/* ===== END VERBATIM ===== */
export { engine };