/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 1639–1680
 * Block sha256: 8f7f6f58d6bc62afb3d858e490632909512731a640be459c12b00cce0ed45f81
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc, Fmt } from './calc-engine.js';
import { ComplianceEngine } from './compliance-effectiveness.js';
import { AlertEngine } from './alert-engine.js';
import { engine } from './engine-bootstrap.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ PORTFOLIO AGGREGATOR — FROZEN calculations ============ */
/* ============================================================================
   PORTFOLIO DASHBOARD — unified executive view across ALL promotions.
   Pure aggregation of already-computed figures (zero recalculation of the
   settlement). Commercial lens: spend concentration, execution health,
   risk exposure, and per-promo contribution — one screen for the director.
   ============================================================================ */
const PortfolioDash = (() => {
  const money0=n=>Fmt.money0(n), n0=n=>Fmt.n0(n);

  function aggregate(){
    const promos=engine.promotions;
    const rows=promos.map(p=>{
      let alerts=null, comp=null;
      try{ alerts=AlertEngine.summary(p); }catch(e){}
      try{ comp=ComplianceEngine.summary(p); }catch(e){}
      return {
        id:p.id, name:p.displayName, mechanic:p.mechanic, health:p.health,
        comp:Calc.num(p.compensation), free:Calc.num(p.freeValue),
        recipients:Calc.num(p.recipients), ratio:p.actualRatio, planned:p.plannedRatio,
        rate:p.rate, nsku:p.data.meta.nsku,
        riskExposure: alerts?Calc.num(alerts.exposure):0,
        highAlerts: alerts?alerts.high:0,
        complianceRate: comp?comp.complianceRate:null,
        underServed: comp?comp.under:0, overServed: comp?comp.over:0
      };
    });
    const totComp=Calc.sum(rows,'comp'), totFree=Calc.sum(rows,'free');
    const totRisk=Calc.sum(rows,'riskExposure'), totHigh=Calc.sum(rows,'highAlerts');
    const totUnder=Calc.sum(rows,'underServed'), totOver=Calc.sum(rows,'overServed');
    // spend concentration: top promo share of total compensation
    const sorted=rows.slice().sort((a,b)=>b.comp-a.comp);
    const topShare=totComp>0? Calc.pct(sorted[0]?sorted[0].comp:0, totComp):null;
    // portfolio-weighted compliance
    const graded=rows.filter(r=>r.complianceRate!=null);
    const wCompliance = graded.length? Calc.sum(graded,r=>Calc.num(r.complianceRate)*r.recipients)/Math.max(1,Calc.sum(graded,'recipients')) : null;
    return { rows, totComp, totFree, totRisk, totHigh, totUnder, totOver, topShare, wCompliance,
      nPromos:rows.length, retained:engine.companyShareRetained,
      totCompVat:engine.portfolioCompensationInclVat };
  }
  return { aggregate };
})();
/* ===== END VERBATIM ===== */
export { PortfolioDash };