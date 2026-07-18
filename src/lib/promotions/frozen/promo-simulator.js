/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 2852–3141
 * Block sha256: ec711acd7fe64bad61ef0d5707dfc04b2dd7fc515a15dc4c454cd4cc4f156315
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { Calc, Fmt } from './calc-engine.js';
import { engine } from './engine-bootstrap.js';
import { DataStore, AUDITED_SOURCES } from './data-pool.js';
import { FilterEngine } from './filter-engine.js';
import { Util, Modal } from '../ui-bridge.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ PROMO SIMULATOR — additive estimation over loaded data ============ */
/* ===========================
   PROMO SIMULATOR (ADDITIVE ESTIMATION LAYER)
   Evaluates a Promotion-Builder configuration against the invoice data
   already loaded in the platform (all campaign bundles, deduplicated by
   invoice number). This is a what-if estimate for planning: it reads the
   frozen data and NEVER touches or alters the settlement engines, their
   formulas, or any published settlement figure.
   =========================== */
const PromoSimulator = (() => {
  /** All invoices: campaign bundles + uploaded data-pool batches,
      deduplicated by invoice number. Memoized until the data changes. */
  let _pool = null, _poolKey = '';
  function invoicePool() {
    const key = engine.promotions.map(p => p.id + ':' + (p.data.invoices || []).length).join(',')
      + '|ds' + (typeof DataStore !== 'undefined' ? DataStore.version : 0);
    if (_pool && key === _poolKey) return _pool;
    const seen = new Set(), pool = [];
    const take = inv => { if (!seen.has(inv.inv)) { seen.add(inv.inv); pool.push(inv); } };
    // audited bundles come from the boot snapshot (visibility-independent);
    // then runtime-registered campaigns; never builder-published bundles
    // (they derive from this pool)
    AUDITED_SOURCES.forEach(p => (p.data.invoices || []).forEach(take));
    engine.promotions.forEach(p => {
      if (String(p.id).startsWith('pbpub_')) return;
      if (AUDITED_SOURCES.includes(p)) return;
      (p.data.invoices || []).forEach(take);
    });
    if (typeof DataStore !== 'undefined') DataStore.batches().forEach(b => (b.invoices || []).forEach(take));
    _pool = pool; _poolKey = key;
    return pool;
  }
  /** Coverage window of the loaded data (for honest "no data in period" hints). */
  function coverage(pool) {
    let min = Infinity, max = -Infinity;
    pool.forEach(i => { const d = FilterEngine.parseDate(i.date); if (d != null) { if (d < min) min = d; if (d > max) max = d; } });
    const f = ms => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return isFinite(min) ? { from: min, to: max, label: f(min) + ' – ' + f(max) } : null;
  }
  const isoMs = s => { if (!s) return null; const d = new Date(s + 'T00:00:00'); return isNaN(d) ? null : d.getTime(); };

  /** Average list price per case of a SKU across the loaded invoices. */
  function avgCasePrice(code, pool) {
    let val = 0, cases = 0;
    pool.forEach(i => (i.lines || []).forEach(l => {
      if (l.code === code && Calc.num(l.cases) > 0) { val += Calc.num(l.gross); cases += Calc.num(l.cases); }
    }));
    return cases > 0 ? val / cases : null;
  }

  /** Units (pieces) per case, parsed from the master product name ("12 X 150G" → 12). */
  let _packs = null;
  function packOf(code) {
    if (!_packs) {
      _packs = new Map();
      ((typeof MASTER !== 'undefined' && MASTER.products) || []).forEach(p => {
        const m = /(\d+)\s*[xX×]\s*\d/.exec(p.name || '');
        if (m) _packs.set(p.code, Number(m[1]));
      });
    }
    return _packs.get(code) || null;
  }

  /**
   * Simulate a builder promotion against the loaded invoices.
   * Rules (stated in the UI): paid lines only (net > 0); the buy condition
   * counts cases of the selected products per customer — combined across
   * products or per product, per the promo's qtyMode; one reward per
   * completed buy condition.
   */
  function analyze(promo) {
    const pool = invoicePool();
    const cov = coverage(pool);
    const from = isoMs(promo.startDate);
    const to = promo.endDate ? isoMs(promo.endDate) + 86399999 : null;
    const prodSet = new Set(promo.productCodes);
    const custSet = promo.customerScope === 'selected' ? new Set(promo.customerCodes) : null;
    // Condition unit: cartons (cases) by default, or pieces (buyUnit 'pcs').
    // Every invoice line carries its piece count in `each` (cases × pack size);
    // when a line lacks it, fall back to cases × pack size from the master data.
    const usePcs = promo.buyUnit === 'pcs';
    const lineQty = l => {
      if (!usePcs) return Calc.num(l.cases);
      const ea = Calc.num(l.each);
      if (ea > 0) return ea;
      const pk = packOf(l.code);
      return pk ? Calc.num(l.cases) * pk : Calc.num(l.cases);
    };
    const byCust = new Map();
    let invScanned = 0;
    pool.forEach(inv => {
      const d = FilterEngine.parseDate(inv.date);
      if (from != null && d != null && d < from) return;
      if (to != null && d != null && d > to) return;
      if (custSet && !custSet.has(inv.code)) return;
      let touched = false;
      (inv.lines || []).forEach(l => {
        if (!prodSet.has(l.code)) return;
        if (Calc.num(l.net) <= 0) return; // paid volume only — free goods and returns never qualify
        let o = byCust.get(inv.cust);
        if (!o) { o = { cust: inv.cust, code: inv.code, city: inv.city, rep: inv.sales, bought: 0, paidValue: 0, perProd: new Map() }; byCust.set(inv.cust, o); }
        o.bought += lineQty(l);
        o.paidValue += Calc.num(l.net);
        o.perProd.set(l.code, Calc.num(o.perProd.get(l.code)) + lineQty(l));
        touched = true;
      });
      if (touched) invScanned++;
    });

    const buy = Calc.num(promo.buyQty);
    const rows = [];
    byCust.forEach(o => {
      let ach = 0;
      const achByProd = {};
      if (buy > 0) {
        if (promo.qtyMode === 'each') o.perProd.forEach((c, code) => { const a = Math.floor(Calc.num(c) / buy); if (a > 0) achByProd[code] = a; ach += a; });
        else ach = Math.floor(o.bought / buy);
      }
      rows.push({ cust: o.cust, code: o.code, city: o.city, rep: o.rep, bought: o.bought, paidValue: o.paidValue, achievements: ach, achByProd });
    });
    rows.sort((a, b) => b.achievements - a.achievements || b.bought - a.bought);
    const qualifying = rows.filter(r => r.achievements > 0);
    const totalAch = Calc.sum(qualifying, 'achievements');

    const out = {
      rows, buyers: rows.length, qualifying: qualifying.length, achievements: totalAch,
      invoices: invScanned, poolSize: pool.length, coverage: cov,
      rewardType: promo.rewardType, rewardLabel: '', rewardQty: null, freeCases: null,
      unitPrice: null, cost: null, note: '',
      unitWord: usePcs ? 'piece(s)' : 'case(s)', unitShort: usePcs ? 'pcs' : 'cs',
    };
    if (promo.repIncentive && Calc.num(promo.repIncentive.minCustomers) > 0) {
      // REP INCENTIVE mode: the buy condition qualifies CUSTOMERS; salesmen
      // are paid per achieving the minimum number of qualifying customers.
      const minC = Calc.num(promo.repIncentive.minCustomers);
      const sal = Calc.num(promo.reward.rewardAmount);
      const sup = Calc.num(promo.repIncentive.supervisorAmount);
      const byRep = new Map();
      qualifying.forEach(r => {
        const k = r.rep || '—';
        const o = byRep.get(k) || { rep: k, customers: 0 };
        o.customers++;
        byRep.set(k, o);
      });
      out.repRows = [...byRep.values()]
        .map(o => ({ ...o, achieved: o.customers >= minC, payout: o.customers >= minC ? sal + sup : 0 }))
        .sort((a, b) => b.customers - a.customers);
      out.repMode = true;
      out.repMin = minC;
      out.repsTotal = out.repRows.length;
      out.repsAchieved = out.repRows.filter(r => r.achieved).length;
      out.cost = out.repsAchieved * (sal + sup);
      out.rewardLabel = 'Incentive payout';
      out.note = 'Rep incentive: a customer counts when they buy ≥ ' + Calc.num(promo.buyQty) + ' ' + out.unitWord + ' '
        + (promo.qtyMode === 'combined' ? 'across the selected products (mix allowed)' : 'of a single selected product (no mixing)')
        + '; a salesman achieves at ≥ ' + minC + ' qualifying customers — SAR ' + Fmt.n0(sal) + ' salesman + SAR ' + Fmt.n0(sup) + ' supervisor per achieving rep. Staff payout, not a customer settlement.';
      return out;
    }
    if (promo.rewardType === 'free_product' && promo.reward.rewardProduct === '__SAME__') {
      // reward is the same SKU the customer bought — value each achievement
      // at its own product's average list price in the loaded invoices
      const qty = Calc.num(promo.reward.rewardQty);
      out.rewardQty = qty;
      out.freeCases = totalAch * qty;
      const priceCache = new Map();
      const priceOf = code => {
        if (!priceCache.has(code)) {
          let pr = avgCasePrice(code, pool);
          if (usePcs && pr != null) { const pk = packOf(code); pr = pk ? pr / pk : null; } // per-piece value
          priceCache.set(code, pr);
        }
        return priceCache.get(code);
      };
      let cost = 0, valued = 0;
      if (promo.qtyMode === 'each') {
        qualifying.forEach(r => Object.entries(r.achByProd || {}).forEach(([code, a]) => {
          const pr = priceOf(code);
          if (pr != null) { cost += a * qty * pr; valued += a; }
        }));
      } else {
        const prices = promo.productCodes.map(priceOf).filter(x => x != null);
        const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : null;
        if (avg != null) { cost = out.freeCases * avg; valued = totalAch; }
      }
      out.cost = valued > 0 ? cost : null;
      out.rewardLabel = usePcs ? 'Free pieces owed' : 'Free cases owed';
      out.note = 'Reward = the same SKU the customer bought; each free ' + (usePcs ? 'piece' : 'case') + ' is valued at that SKU’s own average list price in the loaded invoices.';
    } else if (promo.rewardType === 'free_product') {
      const qty = Calc.num(promo.reward.rewardQty);
      out.rewardQty = qty;
      out.freeCases = totalAch * qty;
      out.unitPrice = avgCasePrice(promo.reward.rewardProduct, pool);
      if (usePcs && out.unitPrice != null) { const pk = packOf(promo.reward.rewardProduct); out.unitPrice = pk ? out.unitPrice / pk : null; }
      out.cost = out.unitPrice != null ? out.freeCases * out.unitPrice : null;
      out.rewardLabel = usePcs ? 'Free pieces owed' : 'Free cases owed';
      out.note = out.unitPrice == null
        ? 'The reward product has no price history in the loaded invoices, so only the quantity is shown.'
        : 'Valued at the average list price of the reward product in the loaded invoices (SAR ' + Fmt.n2(out.unitPrice) + '/' + (usePcs ? 'piece' : 'case') + ').';
    } else if (promo.rewardType === 'discount_pct') {
      const pct = Calc.num(promo.reward.discountPct) / 100;
      out.cost = Calc.sum(qualifying, 'paidValue') * pct;
      out.rewardLabel = 'Discount cost';
      out.note = 'Discount applied to the qualifying customers’ paid value (ex-VAT) of the selected products.';
    } else {
      const amt = Calc.num(promo.reward.rewardAmount);
      out.cost = totalAch * amt;
      out.rewardLabel = promo.rewardType === 'salesman_reward' ? 'Salesman payout' : 'Cash payout';
      out.note = 'One reward of SAR ' + Fmt.n0(amt) + ' per completed buy condition.';
    }
    return out;
  }
  return { analyze, invoicePool, coverage };
})();

/* ---------- shared UI fragments for the simulator ---------- */
function simStrip(sim) {
  if (sim.repMode) {
    return `<div class="pb-preview" style="margin-top:0">
      <div class="pbp"><span>Buyers of selected SKUs</span><b>${Fmt.n0(sim.buyers)}</b></div>
      <div class="pbp"><span>Qualifying customers</span><b>${Fmt.n0(sim.qualifying)}</b></div>
      <div class="pbp"><span>Salesmen in scope</span><b>${Fmt.n0(sim.repsTotal)}</b></div>
      <div class="pbp"><span>Achieved (≥${Fmt.n0(sim.repMin)} customers)</span><b>${Fmt.n0(sim.repsAchieved)}</b></div>
      <div class="pbp"><span>Incentive payout</span><b class="hl">${Fmt.money0(sim.cost)}</b></div>
      <div class="pbp"><span>Per achieving rep</span><b>${sim.repsAchieved ? Fmt.money0(sim.cost / sim.repsAchieved) : '—'}</b></div>
    </div>`;
  }
  const compAtRate = sim.rewardType === 'free_product' && sim.cost != null ? sim.cost * engine.active.rate : null;
  return `<div class="pb-preview" style="margin-top:0">
    <div class="pbp"><span>Buyers of selected SKUs</span><b>${Fmt.n0(sim.buyers)}</b></div>
    <div class="pbp"><span>Qualifying customers</span><b>${Fmt.n0(sim.qualifying)}</b></div>
    <div class="pbp"><span>Conditions completed</span><b>${Fmt.n0(sim.achievements)}</b></div>
    <div class="pbp"><span>${sim.rewardLabel}</span><b>${sim.rewardType === 'free_product' ? Fmt.n2(sim.freeCases) : (sim.cost != null ? Fmt.money0(sim.cost) : '—')}</b></div>
    <div class="pbp"><span>Est. cost (list price)</span><b class="hl">${sim.cost != null ? Fmt.money0(sim.cost) : '—'}</b></div>
    <div class="pbp"><span>If reimbursed @ ${(engine.active.rate * 100).toFixed(0)}%</span><b>${compAtRate != null ? Fmt.money0(compAtRate) : '—'}</b></div>
  </div>`;
}
function simHint(sim, promo) {
  const period = (promo.startDate || promo.endDate)
    ? `${promo.startDate || '…'} → ${promo.endDate || '…'}` : 'all loaded data';
  const zero = sim.invoices === 0
    ? `<div class="up-status warn" style="margin-top:10px">No loaded invoice falls inside the promotion period with the selected products. The data pool currently covers <b>${sim.coverage ? sim.coverage.label : '—'}</b> — the promotion stays at zero until you upload that period's sales file under <b>Administration → Data Upload → Add to Data Pool</b>; it will then calculate automatically.</div>`
    : '';
  return `<div class="risk-note" style="margin-top:10px"><b>Estimate, not a settlement.</b> Simulated against the ${Fmt.n0(sim.poolSize)} invoices in the data pool
    (campaign bundles + your uploads, deduplicated; coverage ${sim.coverage ? sim.coverage.label : '—'}), period ${Util.esc(period)}, paid volume only.
    ${sim.note} Upload new sales periods any time — every promotion recalculates automatically. Settlement figures for the audited campaigns are unaffected.</div>${zero}`;
}
function openSimModal(promo) {
  const sim = PromoSimulator.analyze(promo);
  if (typeof PromoExport !== 'undefined') PromoExport.setContext(promo); // allow export of unsaved drafts from the modal
  const exportBtns = `<button class="btn" data-promoexport="excel" data-id="${Util.esc(promo.id)}">⤓ Excel</button>
    <button class="btn" data-promoexport="pdf" data-id="${Util.esc(promo.id)}">⤓ PDF</button>`;
  if (sim.repMode) {
    const repRows = sim.repRows.map((r, i) => `<tr>
      <td data-l="#" class="tnum">${i + 1}</td>
      <td data-l="Salesman"><b>${Util.esc(r.rep)}</b></td>
      <td class="num tnum" data-l="Qualifying customers">${Fmt.n0(r.customers)} / ${Fmt.n0(sim.repMin)}</td>
      <td class="num" data-l="Status">${r.achieved ? '<span class="pill ok">Achieved</span>' : '<span class="pill neutral">Not yet</span>'}</td>
      <td class="num tnum" data-l="Payout">${r.payout ? Fmt.money0(r.payout) : '—'}</td></tr>`).join('');
    Modal.open({
      title: 'Calculation — ' + (promo.name || 'Untitled promotion'), size: 'lg',
      body: `${simStrip(sim)}${simHint(sim, promo)}
        <div class="twrap" style="max-height:340px;margin-top:12px"><table class="dt cardable"><thead><tr>
          <th>#</th><th>Salesman</th><th class="num">Qualifying customers</th><th class="num">Status</th><th class="num">Payout</th>
        </tr></thead><tbody>${repRows || `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--faint)">No sales of the selected products in this period.</td></tr>`}</tbody></table></div>`,
      foot: `${exportBtns}<div class="spacer"></div><button class="btn" data-close>Close</button>`,
    });
    return;
  }
  const shown = 80;
  const rows = sim.rows.slice(0, shown).map((r, i) => `<tr>
    <td data-l="#" class="tnum">${i + 1}</td>
    <td data-l="Customer"><b>${Util.esc(r.cust)}</b><div class="code">${Util.esc(r.code)}${r.city ? ' · ' + Util.esc(r.city) : ''}</div></td>
    <td class="num tnum" data-l="Bought (${sim.unitShort})">${Fmt.n2(r.bought)}</td>
    <td class="num tnum" data-l="Conditions met">${Fmt.n0(r.achievements)}</td>
    <td class="num tnum" data-l="Reward">${
      promo.rewardType === 'free_product' ? Fmt.n2(r.achievements * Calc.num(promo.reward.rewardQty)) + ' ' + sim.unitShort
      : promo.rewardType === 'discount_pct' ? (r.achievements > 0 ? Fmt.money0(r.paidValue * Calc.num(promo.reward.discountPct) / 100) : '—')
      : (r.achievements > 0 ? Fmt.money0(r.achievements * Calc.num(promo.reward.rewardAmount)) : '—')
    }</td></tr>`).join('');
  Modal.open({
    title: 'Calculation — ' + (promo.name || 'Untitled promotion'), size: 'lg',
    body: `${simStrip(sim)}${simHint(sim, promo)}
      <div class="twrap" style="max-height:340px;margin-top:12px"><table class="dt cardable"><thead><tr>
        <th>#</th><th>Customer</th><th class="num">Bought (${sim.unitShort})</th><th class="num">Conditions met</th><th class="num">Reward</th>
      </tr></thead><tbody>${rows || `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--faint)">No purchases of the selected products in this period.</td></tr>`}</tbody></table></div>
      ${sim.rows.length > shown ? `<div class="code" style="margin-top:8px">Showing top ${shown} of ${sim.rows.length} buyers.</div>` : ''}`,
    foot: `<div class="spacer"></div><button class="btn" data-close>Close</button>`,
  });
}

/* ===== END VERBATIM ===== */
export { PromoSimulator, simStrip, simHint, openSimModal };