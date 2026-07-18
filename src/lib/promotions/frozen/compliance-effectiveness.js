/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 1501–1636
 * Block sha256: 3fa1a080a316c196c8de43d6b0e4a44a8e7b4bb20ae7f0eaeaf49a1f314f3a00
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc } from './calc-engine.js';
import { FilterEngine } from './filter-engine.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ COMPLIANCE + EFFECTIVENESS ENGINES — FROZEN ============ */
/* ============================================================================
   EXECUTION COMPLIANCE — links promotion mechanic to raw invoices and grades
   every customer's execution quality. SEPARATE from settlement: the payable
   figure never changes; this is an execution-quality / obligation lens that
   protects trade spend and arms distributor negotiations.
   ============================================================================ */
const ComplianceEngine = (() => {
  const TOL = 0.05; // 5% tolerance band before flagging over/under

  /** Parse a mechanic string like "10+1" / "2+1" → {buy, free}. */
  function parseMechanic(m){
    const s=String(m||'').match(/(\d+)\s*\+\s*(\d+)/);
    if(!s) return null;
    return { buy:+s[1], free:+s[2] };
  }

  function promoFreeCases(inv){
    let c=0; (inv.lines||[]).forEach(l=>{ const inP=(l.inPromo!=null)?l.inPromo:l.promo;
      const isFree=(l.type==='FREE')||(Calc.num(l.net)===0); if(inP&&isFree) c+=Calc.num(l.cases); });
    return c;
  }
  function promoPaidCases(inv){
    let c=0; (inv.lines||[]).forEach(l=>{ const inP=(l.inPromo!=null)?l.inPromo:l.promo;
      if(inP && Calc.num(l.net)>0) c+=Calc.num(l.cases); });
    return c;
  }
  function avgFreeCaseValue(p){
    let val=0,cases=0;
    p.data.invoices.forEach(i=>(i.lines||[]).forEach(l=>{ const inP=(l.inPromo!=null)?l.inPromo:l.promo;
      const isFree=(l.type==='FREE')||(Calc.num(l.net)===0);
      if(inP&&isFree){ val+=Calc.num(l.gross); cases+=Calc.num(l.cases); } }));
    return cases>0? val/cases : 0;
  }

  /** Grade every customer against the mechanic. */
  function analyze(p, mechanicOverride){
    const mech = parseMechanic(mechanicOverride || p.mechanic);
    const acv = avgFreeCaseValue(p);
    // aggregate per customer (net returns handled: cases can be negative on CN)
    const agg=new Map();
    p.data.invoices.forEach(i=>{
      const k=i.cust; let o=agg.get(k);
      if(!o){ o={cust:i.cust,code:i.code,city:i.city,paid:0,free:0}; agg.set(k,o); }
      o.paid+=promoPaidCases(i); o.free+=promoFreeCases(i);
    });
    const rows=[];
    agg.forEach(o=>{
      if(o.paid<=0 && o.free<=0) return;
      let entitled = mech ? Math.floor(o.paid / mech.buy) * mech.free : null;
      let status, gap=0;
      if(!mech){ status='unknown'; }
      else if(o.free>0 && o.paid < mech.buy){ status='ineligible'; gap=o.free; }
      else if(o.free > entitled*(1+TOL)){ status='over'; gap=o.free-entitled; }
      else if(o.paid>=mech.buy && o.free < entitled*(1-TOL)){ status='under'; gap=entitled-o.free; }
      else { status='compliant'; gap=0; }
      rows.push({ ...o, entitled, status, gap, gapValue:Calc.round(gap*acv) });
    });
    // sort: issues first (over, ineligible, under), then compliant
    const order={over:0,ineligible:1,under:2,compliant:3,unknown:4};
    rows.sort((a,b)=> order[a.status]-order[b.status] || Calc.num(b.gapValue)-Calc.num(a.gapValue) || Calc.num(b.paid)-Calc.num(a.paid));
    return { rows, mech, acv };
  }

  function summary(p, mechanicOverride){
    const { rows, mech, acv } = analyze(p, mechanicOverride);
    const withFree = rows.filter(r=>r.free>0);
    const s={ mechanic:mech?`${mech.buy}+${mech.free}`:'—', total:rows.length, recipients:withFree.length,
      compliant:0, over:0, under:0, ineligible:0,
      overCases:0, underCases:0, overValue:0, underValue:0, complianceRate:0 };
    rows.forEach(r=>{
      if(r.status==='compliant') s.compliant++;
      else if(r.status==='over'){ s.over++; s.overCases+=r.gap; s.overValue+=r.gapValue; }
      else if(r.status==='under'){ s.under++; s.underCases+=r.gap; s.underValue+=r.gapValue; }
      else if(r.status==='ineligible'){ s.ineligible++; }
    });
    const graded = s.compliant+s.over+s.under+s.ineligible;
    s.complianceRate = graded>0 ? Calc.pct(s.compliant, graded) : null;
    s.overValue=Calc.round(s.overValue); s.underValue=Calc.round(s.underValue);
    return s;
  }

  return { analyze, summary, parseMechanic };
})();

/* ============================================================================
   PROMOTION EFFECTIVENESS — volume & buyer lift of promo SKUs during the
   campaign vs the pre-promo baseline. Run-rate normalized (handles unequal
   window lengths). No cost/return framing — pure execution uplift signal.
   ============================================================================ */
const EffectivenessEngine = (() => {
  const MS_DAY=86400000;

  function metrics(invoices, fromMs, toMs){
    let cases=0, value=0, days=0; const buyers=new Set();
    let minD=Infinity,maxD=-Infinity;
    invoices.forEach(i=>{
      const d=i.dateMs!=null?i.dateMs:(FilterEngine.parseDate(i.date));
      if(d==null) return;
      if(fromMs!=null && d<fromMs) return;
      if(toMs!=null && d>toMs) return;
      if(d<minD)minD=d; if(d>maxD)maxD=d;
      (i.lines||[]).forEach(l=>{ const inP=(l.inPromo!=null)?l.inPromo:l.promo;
        if(inP && Calc.num(l.net)>0){ cases+=Calc.num(l.cases); value+=Calc.num(l.net); } });
      if((i.lines||[]).some(l=>{const inP=(l.inPromo!=null)?l.inPromo:l.promo; return inP && Calc.num(l.net)>0;})) buyers.add(i.cust);
    });
    days = isFinite(minD)? Math.max(1, Math.round((maxD-minD)/MS_DAY)+1) : 0;
    return { cases:Calc.round(cases), value:Calc.round(value), buyers:buyers.size, days,
             caseRate: days>0?cases/days:0, valueRate: days>0?value/days:0 };
  }

  /** Compare promo window to an equal-or-available pre-promo baseline. */
  function analyze(p){
    // promo window from data date range of promo lines
    let minD=Infinity,maxD=-Infinity;
    p.data.invoices.forEach(i=>{ const d=i.dateMs!=null?i.dateMs:FilterEngine.parseDate(i.date);
      if(d!=null){ if(d<minD)minD=d; if(d>maxD)maxD=d; } });
    if(!isFinite(minD)) return null;
    const promoFrom=minD, promoTo=maxD;
    // baseline: the window immediately before promo, same length (capped by available data start)
    const span=promoTo-promoFrom;
    const baseTo=promoFrom-MS_DAY;
    const baseFrom=baseTo-span;
    const promo=metrics(p.data.invoices, promoFrom, promoTo);
    const base=metrics(p.data.invoices, baseFrom, baseTo);
    const lift=(a,b)=> b>0? (a/b-1)*100 : null;
    return {
      promo, base,
      caseRateLift: lift(promo.caseRate, base.caseRate),
      valueRateLift: lift(promo.valueRate, base.valueRate),
      buyerLift: lift(promo.buyers, base.buyers),
      hasBaseline: base.cases>0 || base.buyers>0
    };
  }
  return { analyze, metrics };
})();
/* ===== END VERBATIM ===== */
export { ComplianceEngine, EffectivenessEngine };