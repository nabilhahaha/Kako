/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 1090–1217
 * Block sha256: e7f6642005f6c2dc4b396b8e883a2ecbddd74cd11f1a0fe5995edf1ec4d0aa0a
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc, Fmt } from './calc-engine.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ ALERT ENGINE + DRILL-DOWN — FROZEN ============ */
/* ============================================================================
   WAVE 4 — ALERT CENTER (financial-risk lens) + DRILL-DOWN + EXPORTS
   Alerts are prioritized by SETTLEMENT RISK, not just data hygiene.
   Each alert carries a severity, a SAR exposure where quantifiable, and a
   commercial recommendation a sales director can act on.
   ============================================================================ */
const AlertEngine = (() => {
  function scan(p){
    const invs = p.data.invoices;
    const entitle = Calc.num(p.plannedRatio);      // 9.09 or 50
    const rate = p.rate, alerts = [];

    const promoFree = (i) => {
      let f=0; (i.lines||[]).forEach(l=>{
        const isFree=(l.type==='FREE')||(Calc.num(l.net)===0);
        const inP=(l.inPromo!=null)?l.inPromo:l.promo;
        if(isFree&&inP) f+=Calc.num(l.gross);
      }); return f;
    };
    const paidNet = (i) => { let s=0;(i.lines||[]).forEach(l=>{ if(Calc.num(l.net)>0) s+=Calc.num(l.net); }); return s; };

    /* 1) Customer exceeds policy entitlement (SAR exposure) — HIGH */
    const cAgg = new Map();
    invs.forEach(i=>{
      const k=i.cust; const o=cAgg.get(k)||{paid:0,free:0,code:i.code,invs:[]};
      o.paid+=paidNet(i); o.free+=promoFree(i); o.invs.push(i.inv); cAgg.set(k,o);
    });
    cAgg.forEach((o,name)=>{
      if(o.paid>0 && o.free>0){
        const r=o.free/o.paid*100;
        if(r > entitle*1.2){
          const excess = o.free - (o.paid*entitle/100);
          alerts.push({ type:'Policy Exceedance', sev:'high',
            title:`${name} — free ratio ${r.toFixed(1)}% vs ${entitle}% entitlement`,
            detail:`Customer received free goods ${(r/entitle).toFixed(1)}× the mechanic entitlement. Excess free value SAR ${Fmt.n0(excess)}.`,
            exposure: Calc.round(excess*rate),
            rec:'Verify execution against the agreed mechanic before approving this customer\u2019s line in the settlement. Possible over-delivery or mis-keyed free goods.' });
        }
      }
    });

    /* 2) Duplicate invoice numbers — HIGH (double payment risk) */
    const seen=new Map();
    invs.forEach(i=>seen.set(i.inv,(seen.get(i.inv)||0)+1));
    seen.forEach((n,inv)=>{ if(n>1) alerts.push({ type:'Duplicate Invoice', sev:'high',
      title:`Invoice ${inv} appears ${n} times`,
      detail:'Same invoice number on multiple records — risk of double-counting free-goods value in the settlement.',
      exposure:null, rec:'De-duplicate before settlement. Confirm with distributor which record is authoritative.' }); });

    /* 3) Credit notes / returns — MED (reduce settlement) */
    const cn=invs.filter(i=>i.isCN);
    if(cn.length){ const v=Calc.sum(cn, i=>Calc.num(promoFree(i)));
      alerts.push({ type:'Returns / Credit Notes', sev:'med',
        title:`${cn.length} credit notes with promo free goods`,
        detail:`Returned promo free-goods value SAR ${Fmt.n0(v)}. These reverse prior free goods and correctly reduce the payable base.`,
        exposure:Calc.round(v*rate),
        rec:'Ensure returns are netted in the final settlement so the distributor is not compensated for reversed goods.' }); }

    /* 4) Duplicate customer account codes — MED (data quality / coverage) */
    const nm=new Map();
    invs.forEach(i=>{ const s=nm.get(i.cust)||new Set(); s.add(i.code); nm.set(i.cust,s); });
    const dupCode=[...nm.entries()].filter(([,s])=>s.size>1);
    if(dupCode.length) alerts.push({ type:'Duplicate Customer Codes', sev:'med',
      title:`${dupCode.length} customer(s) with multiple account codes`,
      detail:`e.g. ${dupCode.slice(0,3).map(([n,s])=>n.split('(')[0].trim()+' ('+s.size+')').join(', ')}. Inflates the account count and distorts coverage/penetration KPIs.`,
      exposure:null,
      rec:'Consolidate duplicate codes in the distributor master data. Compensation is unaffected, but coverage and per-outlet metrics are.' });

    /* 5) Zero-quantity promo lines — LOW (execution/keying error) */
    let zero=0; invs.forEach(i=>(i.lines||[]).forEach(l=>{ const inP=(l.inPromo!=null)?l.inPromo:l.promo; if(inP&&Calc.num(l.cases)===0) zero++; }));
    if(zero) alerts.push({ type:'Zero-Quantity Lines', sev:'low',
      title:`${zero} promo line(s) with zero quantity`,
      detail:'Promo SKU lines carrying no units — usually a keying artifact; no financial impact but signals data-entry noise.',
      exposure:null, rec:'Clean at source to keep line counts and averages accurate.' });

    /* 6) Invoice-level extreme ratio — LOW/MED (spot outliers) */
    const ext=[];
    invs.forEach(i=>{ const pd=paidNet(i), fr=promoFree(i);
      if(pd>0&&fr>0){ const r=fr/pd*100; if(r>entitle*1.8) ext.push({inv:i.inv,r:r,cust:i.cust}); } });
    if(ext.length){ ext.sort((a,b)=>b.r-a.r);
      alerts.push({ type:'Outlier Invoices', sev:'low',
        title:`${ext.length} invoice(s) above ${(entitle*1.8).toFixed(0)}% free ratio`,
        detail:`Highest: ${ext[0].inv} at ${ext[0].r.toFixed(0)}% (${ext[0].cust.split('(')[0].trim()}). Individually small but worth a spot-check.`,
        exposure:null, rec:'Sample-audit the top outliers to confirm they are legitimate mechanic executions.' }); }

    const order={high:0,med:1,low:2};
    alerts.sort((a,b)=>order[a.sev]-order[b.sev] || (Calc.num(b.exposure)-Calc.num(a.exposure)));
    return alerts;
  }

  function summary(p){
    const a=scan(p);
    // Headline "risk exposure" = positive overspend/duplication risk only.
    // Return credits are directionally negative and shown separately (informational).
    const riskExposure = Calc.sum(a, x=> x.type==='Returns / Credit Notes' ? 0 : Math.max(0, Calc.num(x.exposure)) );
    const returnCredits = Calc.sum(a, x=> x.type==='Returns / Credit Notes' ? Calc.num(x.exposure) : 0 );
    return { total:a.length,
      high:a.filter(x=>x.sev==='high').length,
      med:a.filter(x=>x.sev==='med').length,
      low:a.filter(x=>x.sev==='low').length,
      exposure:riskExposure, returnCredits:returnCredits };
  }
  return { scan, summary };
})();

/* ===== WAVE 4 — DRILL-DOWN (Portfolio → City → Customer → Invoice → Line) ===== */
const DrillDown = (() => {
  function promoFree(i){ let f=0;(i.lines||[]).forEach(l=>{const isFree=(l.type==='FREE')||(Calc.num(l.net)===0);const inP=(l.inPromo!=null)?l.inPromo:l.promo;if(isFree&&inP)f+=Calc.num(l.gross);});return f; }

  function cities(p){
    const m=new Map();
    p.data.invoices.forEach(i=>{ const o=m.get(i.city)||{city:i.city,free:0,ninv:0,custs:new Set()}; o.free+=promoFree(i); o.ninv++; o.custs.add(i.cust); m.set(i.city,o); });
    return [...m.values()].map(o=>({city:o.city,free:o.free,comp:Calc.round(o.free*p.rate),ninv:o.ninv,ncust:o.custs.size}))
      .filter(o=>o.free>0).sort((a,b)=>b.free-a.free);
  }
  function customersIn(p,city){
    const m=new Map();
    p.data.invoices.filter(i=>i.city===city).forEach(i=>{ const o=m.get(i.cust)||{cust:i.cust,code:i.code,free:0,ninv:0}; o.free+=promoFree(i); o.ninv++; m.set(i.cust,o); });
    return [...m.values()].map(o=>({...o,comp:Calc.round(o.free*p.rate)})).filter(o=>o.free>0).sort((a,b)=>b.free-a.free);
  }
  function invoicesOf(p,city,cust){
    return p.data.invoices.filter(i=>i.city===city&&i.cust===cust)
      .map(i=>({inv:i.inv,date:i.date,free:promoFree(i),comp:Calc.round(promoFree(i)*p.rate),nlines:i.nlines,isCN:i.isCN,ref:i}))
      .sort((a,b)=>b.free-a.free);
  }
  return { cities, customersIn, invoicesOf, promoFree };
})();
/* ===== END VERBATIM ===== */
export { AlertEngine, DrillDown };