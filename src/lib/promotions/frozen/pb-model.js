/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 1416–1498
 * Block sha256: 1018a84494d3fe8e48336a0c2b409e251653aaf23518bd4057e50ca01262e7fe
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ PROMOTION BUILDER MODEL — FROZEN (schema + validation) ============ */
/* ============================================================================
   PROMOTION BUILDER — flexible data model + persistence (ADDITIVE MODULE)
   Zero coupling to the settlement engine. Stores every promotion in one
   extensible schema so new reward types can be added without touching the UI.
   ============================================================================ */
const PBModel = (() => {
  const KEY = 'roshen_pb_promotions_v1';
  const REWARD_TYPES = {
    free_product:  { icon:'🎁', label:'Free Product',    rewardFields:['rewardProduct','rewardQty'] },
    cash_reward:   { icon:'💰', label:'Cash Reward',      rewardFields:['rewardAmount'] },
    discount_pct:  { icon:'🏷', label:'Discount %',       rewardFields:['discountPct'] },
    salesman_reward:{ icon:'⭐', label:'Salesman Reward', rewardFields:['rewardAmount'] }
  };

  /* Flexible schema — one shape for all promo types (future-proof). */
  function blank(){
    return {
      id: 'pb_' + Date.now() + '_' + Math.random().toString(36).slice(2,7),
      status: 'draft',                 // draft | active | paused
      rewardType: 'free_product',
      name: '',
      startDate: '',
      endDate: '',
      customerScope: 'all',            // all | selected
      customerCodes: [],               // when scope=selected
      buyQty: null,                    // "Customer must buy" quantity (cases)
      productCodes: [],                // qualifying products
      qtyMode: 'combined',             // combined | each
      reward: {                        // only relevant fields populated per type
        rewardProduct: '', rewardQty: null,
        rewardAmount: null, discountPct: null
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
  }

  function load(){
    try{ const raw=localStorage.getItem(KEY); return raw? JSON.parse(raw): []; }
    catch(e){ console.warn('PB load failed',e); return []; }
  }
  function persist(list){
    try{ localStorage.setItem(KEY, JSON.stringify(list)); return true; }
    catch(e){ console.warn('PB persist failed',e); return false; }
  }
  function upsert(promo){
    const list=load(); promo.updatedAt=Date.now();
    const i=list.findIndex(p=>p.id===promo.id);
    if(i>=0) list[i]=promo; else list.push(promo);
    persist(list); return promo;
  }
  function remove(id){ persist(load().filter(p=>p.id!==id)); }
  function duplicate(id){
    const src=load().find(p=>p.id===id); if(!src) return null;
    const copy=JSON.parse(JSON.stringify(src));
    copy.id='pb_'+Date.now()+'_'+Math.random().toString(36).slice(2,7);
    copy.name=(src.name||'Promotion')+' (Copy)';
    copy.status='draft'; copy.createdAt=Date.now(); copy.updatedAt=Date.now();
    return upsert(copy);
  }
  function get(id){ return load().find(p=>p.id===id)||null; }

  /* Validation for activation — plain-language messages, no jargon. */
  function validate(p){
    const errs=[];
    if(!p.name || !p.name.trim()) errs.push('Add a promotion name.');
    if(!p.startDate) errs.push('Choose a start date.');
    if(!p.endDate) errs.push('Choose an end date.');
    if(p.startDate && p.endDate && p.endDate < p.startDate) errs.push('End date must be after the start date.');
    if(p.customerScope==='selected' && !p.customerCodes.length) errs.push('Select at least one customer, or choose All Customers.');
    if(!p.buyQty || Number(p.buyQty)<=0) errs.push('Enter how much the customer must buy.');
    if(!p.productCodes.length) errs.push('Choose at least one product.');
    const rt=REWARD_TYPES[p.rewardType];
    if(rt.rewardFields.includes('rewardProduct') && !p.reward.rewardProduct) errs.push('Choose the free product to give.');
    if(rt.rewardFields.includes('rewardQty') && (!p.reward.rewardQty||Number(p.reward.rewardQty)<=0)) errs.push('Enter the free quantity.');
    if(rt.rewardFields.includes('rewardAmount') && (!p.reward.rewardAmount||Number(p.reward.rewardAmount)<=0)) errs.push('Enter the reward amount.');
    if(rt.rewardFields.includes('discountPct') && (!p.reward.discountPct||Number(p.reward.discountPct)<=0)) errs.push('Enter the discount percentage.');
    return errs;
  }

  return { blank, load, upsert, remove, duplicate, get, validate, REWARD_TYPES };
})();
/* ===== END VERBATIM ===== */
export { PBModel };