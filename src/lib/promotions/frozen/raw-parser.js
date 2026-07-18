/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 1220–1373
 * Block sha256: 61a4dd8d0dc4b12c07a898dd72e96d3b9dfe5011823f0eeb1492abd3ab5a32ae
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc } from './calc-engine.js';
import { FilterEngine } from './filter-engine.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ RAW DATA PARSER — FROZEN ============ */
/* ============================================================================
   WAVE 5 — RAW DATA UPLOADER + PROMO BUILDER (reusable for any future campaign)
   Parses the standard 57-column Roshen raw export (client-side via SheetJS),
   lets the user define a promotion (name / mechanic / dates / SKUs / rate),
   filters to scope, and produces a Promotion the engine registers live.
   Data-source-agnostic: same parse path will serve Supabase later.
   ============================================================================ */
const RawParser = (() => {
  // Canonical column map for the standard export. Matching is case/space tolerant.
  const COLS = {
    invoice:'Invoice', custCode:'Cust Account', custName:'Cust Name',
    date:'Invoice Date', rep:'Sales Man', channel:'Channel', city:'City',
    region:'Region', division:'Division',
    itemId:'Item Id', itemDesc:'Item Description', itemGroup:'Item Group',
    unit:'SalesUnit', qtyEach:'Qty Each', qtyCases:'Qty Cases',
    unitPrice:'SalesUnitPrice', eaPrice:'EA Unit Price',
    net:'Net Amount', gross:'Gross Sales value', isReturn:'IsReturn',
    priceList:'Price List Name', orderType:'Order Type'
  };

  function norm(s){ return String(s==null?'':s).trim().toLowerCase().replace(/\s+/g,' '); }

  /** Build header index resolving each canonical field to its column position. */
  function mapHeaders(headerRow){
    const idx={}; const lookup={};
    headerRow.forEach((h,i)=>{ lookup[norm(h)]=i; });
    const missing=[];
    Object.entries(COLS).forEach(([key,label])=>{
      const i = lookup[norm(label)];
      idx[key] = (i==null?-1:i);
      if(i==null && ['invoice','custCode','custName','date','itemId','itemDesc','net','gross','qtyCases'].includes(key)) missing.push(label);
    });
    return { idx, missing };
  }

  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(v){
    if(v==null||v==='') return '';
    if(v instanceof Date && !isNaN(v)) return v.getDate()+' '+MONTHS[v.getMonth()]+' '+v.getFullYear();
    // Excel serial number
    if(typeof v==='number' && v>20000 && v<80000){
      const d=new Date(Math.round((v-25569)*86400*1000));
      return d.getUTCDate()+' '+MONTHS[d.getUTCMonth()]+' '+d.getUTCFullYear();
    }
    const d=new Date(v);
    if(!isNaN(d)) return d.getDate()+' '+MONTHS[d.getMonth()]+' '+d.getFullYear();
    return String(v);
  }
  function dateMs(v){
    if(v instanceof Date && !isNaN(v)) return v.getTime();
    if(typeof v==='number' && v>20000 && v<80000) return Math.round((v-25569)*86400*1000);
    const d=new Date(v); return isNaN(d)?null:d.getTime();
  }
  function num(v){ const n=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,'')); return isFinite(n)?n:0; }

  /** Parse workbook rows into a flat line array + inferred dimensions. */
  function parse(rows){
    if(!rows.length) throw new Error('Empty sheet');
    const { idx, missing } = mapHeaders(rows[0]);
    if(missing.length) throw new Error('Missing required columns: '+missing.join(', '));
    const g=(r,k)=> idx[k]>=0 ? r[idx[k]] : '';
    const lines=[];
    for(let i=1;i<rows.length;i++){
      const r=rows[i]; if(!r||r.length===0) continue;
      const inv=g(r,'invoice'); if(inv==null||inv==='') continue;
      const net=num(g(r,'net')), gross=num(g(r,'gross'));
      const isRet = norm(g(r,'isReturn'))==='yes' || String(inv).toUpperCase().startsWith('CN');
      lines.push({
        inv:String(inv), date:fmtDate(g(r,'date')), dateMs:dateMs(g(r,'date')),
        custCode:String(g(r,'custCode')||''), cust:String(g(r,'custName')||''),
        rep:String(g(r,'rep')||''), channel:String(g(r,'channel')||''), city:String(g(r,'city')||''),
        code:String(g(r,'itemId')||''), name:String(g(r,'itemDesc')||''), group:String(g(r,'itemGroup')||''),
        unit:String(g(r,'unit')||''), cases:num(g(r,'qtyCases')), each:num(g(r,'qtyEach')),
        price:num(g(r,'unitPrice'))||num(g(r,'eaPrice')),
        net, gross, tax:0, isReturn:isRet,
        type: (net===0? 'FREE':'PAID')
      });
    }
    // Dimensions for the promo builder
    const skus=new Map(), cities=new Set(), channels=new Set(), reps=new Set();
    let minD=Infinity,maxD=-Infinity;
    lines.forEach(l=>{
      if(l.code && !skus.has(l.code)) skus.set(l.code,l.name);
      if(l.city) cities.add(l.city); if(l.channel) channels.add(l.channel); if(l.rep) reps.add(l.rep);
      if(l.dateMs!=null){ if(l.dateMs<minD)minD=l.dateMs; if(l.dateMs>maxD)maxD=l.dateMs; }
    });
    return { lines,
      skus:[...skus.entries()].map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name)),
      cities:[...cities].sort(), channels:[...channels].sort(), reps:[...reps].sort(),
      dateFrom:isFinite(minD)?fmtDate(new Date(minD)):'', dateTo:isFinite(maxD)?fmtDate(new Date(maxD)):'',
      nRows:lines.length, nInv:new Set(lines.map(l=>l.inv)).size };
  }

  /** Given parsed lines + a promo config, build the platform data structure. */
  function buildPromoData(parsed, cfg){
    // cfg: {id,name,mechanic,plan_ratio,rate,vat,dateFrom,dateTo,skuCodes:[],scope:'recipients'|'all'}
    const fromMs = cfg.dateFrom ? FilterEngine.parseDate(cfg.dateFrom) : null;
    const toMs   = cfg.dateTo   ? FilterEngine.parseDate(cfg.dateTo)   : null;
    const skuSet = new Set(cfg.skuCodes);
    // 1) tag lines in-scope (date window + promo SKU) and flag promo/free
    const invMap=new Map();
    parsed.lines.forEach(l=>{
      if(fromMs!=null && l.dateMs!=null && l.dateMs<fromMs) return;
      if(toMs!=null && l.dateMs!=null && l.dateMs>toMs) return;
      const inPromo = skuSet.size? skuSet.has(l.code) : true;
      const line={...l, promo:inPromo, inPromo, type:(l.net===0?'FREE':'PAID')};
      let o=invMap.get(l.inv);
      if(!o){ o={inv:l.inv,date:l.date,cust:l.cust,code:l.custCode,city:l.city,sales:l.rep,channel:l.channel,
                 lines:[],net:0,tax:0,total:0,freeval:0,promoFreeval:0,nlines:0,isCN:l.isReturn}; invMap.set(l.inv,o); }
      o.lines.push(line);
      o.nlines++;
      if(line.net>0) o.net+=line.net;
      const isFree=(line.net===0);
      if(isFree) o.freeval+=line.gross;
      if(isFree && inPromo) o.promoFreeval+=line.gross;
      o.total=o.net;
      if(l.isReturn) o.isCN=true;
    });
    let invoices=[...invMap.values()];
    // 2) keep only invoices that touch the promo (have a promo free line) if scope=recipients
    if(cfg.scope==='recipients') invoices=invoices.filter(i=>i.promoFreeval>0 || i.lines.some(l=>l.inPromo));
    // 3) SKU rollup (promo SKUs)
    const skuMap=new Map();
    invoices.forEach(i=>i.lines.forEach(l=>{
      if(!l.inPromo) return;
      let s=skuMap.get(l.code); if(!s){ s={code:l.code,name:l.name,val:0,free:0,paid:0}; skuMap.set(l.code,s); }
      if(l.net===0) s.free+=l.gross, s.val+=l.gross; else s.paid+=l.net;
    }));
    // 4) customer rollup (promo free value)
    const custMap=new Map();
    invoices.forEach(i=>{
      let pf=0; i.lines.forEach(l=>{ if(l.inPromo && l.net===0) pf+=l.gross; });
      if(pf===0) return;
      let c=custMap.get(i.cust); if(!c){ c={cust:i.cust,code:i.code,city:i.city,val:0}; custMap.set(i.cust,c); }
      c.val+=pf;
    });
    const cust=[...custMap.values()].filter(c=>c.val>0);
    const fval=Calc.sum([...skuMap.values()],'val');
    const paid=Calc.sum([...skuMap.values()],'paid');
    const ncust=cust.length;
    const ninv=invoices.filter(i=>i.lines.some(l=>l.inPromo&&l.net===0)).length;
    return {
      sku:[...skuMap.values()].sort((a,b)=>b.val-a.val),
      cust:cust.sort((a,b)=>b.val-a.val),
      invoices,
      kpi:{ fval, paid, free:fval, ratio:Calc.pct(fval,paid), ninv, ncust,
            plan_ratio:cfg.plan_ratio, mechanic:cfg.mechanic },
      meta:{ name:cfg.name, period:(cfg.dateFrom||'')+' – '+(cfg.dateTo||''), nsku:skuMap.size }
    };
  }

  return { parse, buildPromoData, COLS };
})();
/* ===== END VERBATIM ===== */
export { RawParser };