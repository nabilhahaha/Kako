/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 977–1087
 * Block sha256: d2c1f541852617ebc250fcc70d198e4d700d89d80cc9b5f9339f5257703fe7ad
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc } from './calc-engine.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ FILTER ENGINE — FROZEN ============ */
/* ============================================================================
   WAVE 3 — EXECUTIVE FILTER ENGINE + EXPANDED SEARCH + PERFORMANCE
   Filters map to REAL invoice fields. Rollup uses promoFreeval (promo-scope
   only) so filtered compensation never inflates with non-promo free goods.
   ============================================================================ */
const FilterEngine = (() => {
  const state = { q:'', city:'', channel:'', rep:'', sku:'', customer:'', dateFrom:'', dateTo:'', invoice:'' };
  let saved = [];
  let _cache = null, _cacheKey = '';

  // Ensure every invoice has promoFreeval (promo-scope free value) computed from its lines.
  // Robust against data blobs that predate the promoFreeval field.
  function ensurePromoFreeval(p){
    if(p._pfDone) return;
    p.data.invoices.forEach(inv=>{
      if(inv.promoFreeval==null){
        let t=0;
        (inv.lines||[]).forEach(l=>{
          const isFree = (l.type==='FREE') || (Calc.num(l.net)===0);
          const inP = (l.inPromo!=null) ? l.inPromo : l.promo;
          if(isFree && inP) t += Calc.num(l.gross);
        });
        inv.promoFreeval = t;
      }
    });
    p._pfDone = true;
  }

  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  function parseDate(s){ // "13 May 2026" -> ms
    if(!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\w*\s+(\d{4})$/);
    if(!m) return null;
    const mo = MONTHS[m[2].slice(0,3)]; if(mo==null) return null;
    return new Date(+m[3], mo, +m[1]).getTime();
  }

  function options(p){
    const inv = p.data.invoices;
    const set = (k)=>[...new Set(inv.map(i=>i[k]).filter(Boolean))].sort();
    // SKUs from promo lines only
    const skuMap = new Map();
    inv.forEach(i=>i.lines.forEach(l=>{ if((l.inPromo!=null?l.inPromo:l.promo) && !skuMap.has(l.code)) skuMap.set(l.code, l.name); }));
    const skus=[...skuMap.entries()].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name));
    const custMap=new Map();
    inv.forEach(i=>{ if(!custMap.has(i.code)) custMap.set(i.code, i.cust); });
    const custs=[...custMap.entries()].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name));
    return { city:set('city'), channel:set('channel'), rep:set('sales'), sku:skus, customer:custs };
  }

  function matchInvoice(inv, p){
    const s=state;
    if(s.city && inv.city!==s.city) return false;
    if(s.channel && inv.channel!==s.channel) return false;
    if(s.rep && inv.sales!==s.rep) return false;
    if(s.customer && inv.code!==s.customer) return false;
    if(s.invoice && !String(inv.inv).toLowerCase().includes(s.invoice.toLowerCase())) return false;
    if(s.sku && !inv.lines.some(l=>(l.inPromo!=null?l.inPromo:l.promo) && l.code===s.sku)) return false;
    const from=parseDate(s.dateFrom), to=parseDate(s.dateTo), d=parseDate(inv.date);
    if(from!=null && d!=null && d<from) return false;
    if(to!=null && d!=null && d>to) return false;
    if(s.q){
      const q=s.q.toLowerCase();
      const hay=[inv.inv,inv.cust,inv.code,inv.city,inv.channel,inv.sales].join(' ').toLowerCase();
      const inLines=inv.lines.some(l=>(l.code+' '+l.name).toLowerCase().includes(q));
      if(!hay.includes(q) && !inLines) return false;
    }
    return true;
  }

  function apply(p){
    ensurePromoFreeval(p);
    const key=JSON.stringify(state)+'|'+p.id+'|'+p.rate;
    if(key===_cacheKey && _cache) return _cache;
    const list=p.data.invoices.filter(i=>matchInvoice(i,p));
    _cache=list; _cacheKey=key;
    return list;
  }

  function rollup(p){
    const list=apply(p);
    // promo-scope free value only
    const freeVal=Calc.sum(list, i => Calc.num(i.promoFreeval != null ? i.promoFreeval : i.freeval));
    const comp=Calc.round(freeVal * p.rate);
    // Recipients: net promo free value by customer NAME (consolidates duplicate account
    // codes and nets credit-note returns) — only count customers with net free > 0,
    // matching the settlement's canonical recipient definition.
    const byName=new Map();
    list.forEach(i=>{
      const v=Calc.num(i.promoFreeval!=null?i.promoFreeval:i.freeval);
      byName.set(i.cust, Calc.num(byName.get(i.cust)) + v);
    });
    let custs=0; byName.forEach(v=>{ if(v>0.005) custs++; });
    // When no filters are active, defer to the promo's canonical recipient KPI
    // (authoritative; nets source-level return quirks the invoice view can't see).
    if(activeCount()===0 && p.recipients!=null) custs=p.recipients;
    return { ninv:list.length, freeVal, comp, compVat:Calc.round(comp*(1+p.vat)), custs };
  }

  function set(k,v){ state[k]=v; }
  function clear(){ Object.keys(state).forEach(k=>state[k]=''); }
  function activeCount(){ return Object.values(state).filter(v=>v!=='').length; }
  function get(){ return {...state}; }
  function saveView(name){ saved.push({name:name||('View '+(saved.length+1)), state:{...state}}); return saved; }
  function loadView(i){ if(saved[i]) Object.assign(state, saved[i].state); }
  function removeView(i){ saved.splice(i,1); }
  function views(){ return saved; }

  return { options, apply, rollup, set, get, clear, activeCount, saveView, loadView, removeView, views, parseDate };
})();
/* ===== END VERBATIM ===== */
export { FilterEngine };