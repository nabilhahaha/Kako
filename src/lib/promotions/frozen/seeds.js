/* AUTO-GENERATED — VERBATIM EXTRACT FROM THE REFERENCE IMPLEMENTATION. DO NOT EDIT.
 * Source: roshen_settlement_platform.html lines 3315–3437
 * Block sha256: eebbb9750a99dbc2ea7a8a0b61cf4faf1ac90eca90474f2d5a2b46851a6c38ec
 * Regenerate: node scripts/extract-frozen-promotions.mjs
 * Verify:     node scripts/extract-frozen-promotions.mjs --check
 */
/* eslint-disable */
// @ts-nocheck
import { PBModel } from './pb-model.js';
import { Store } from './store.js';
/* ===== BEGIN VERBATIM (extracted — do not modify) ===== */
/* ============ SEEDED PROMOTIONS — shipped business configurations ============ */
/* ===========================
   SEEDED PROMOTIONS (ADDITIVE) — business-provided configurations shipped
   with the platform. Merged into the promotion store on boot unless the
   user already has them or explicitly deleted them (tombstoned), so they
   appear automatically as campaigns and keep recalculating as new sales
   periods are uploaded. Settlement engines untouched.
   =========================== */
const SEED_PROMOS = [
  {
    id: 'seed_june_10p1', status: 'active', rewardType: 'free_product',
    name: 'June Promo 10+1',
    startDate: '2026-06-01', endDate: '2026-06-30',
    customerScope: 'all', customerCodes: [],
    buyQty: 10, qtyMode: 'each',
    productCodes: ['ROS24001', 'ROS29785', 'ROS34352', 'ROS08810', 'ROS05000', 'ROS11926'],
    reward: { rewardProduct: '__SAME__', rewardQty: 1, rewardAmount: null, discountPct: null },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  {
    id: 'seed_june_4p1', status: 'active', rewardType: 'free_product',
    name: 'June Promo 4+1',
    startDate: '2026-06-01', endDate: '2026-06-30',
    customerScope: 'all', customerCodes: [],
    buyQty: 4, qtyMode: 'each',
    productCodes: ['ROS44061', 'ROS44092'],
    reward: { rewardProduct: '__SAME__', rewardQty: 1, rewardAmount: null, discountPct: null },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  /* July promo — 15 candy SKUs, buy 10 get 1 of the same SKU. Starts at
     zero until July sales are uploaded to the data pool, then calculates
     automatically. */
  {
    id: 'seed_july_10p1', status: 'active', rewardType: 'free_product',
    name: 'July Promo 10+1',
    startDate: '2026-07-01', endDate: '2026-07-31',
    customerScope: 'all', customerCodes: [],
    buyQty: 10, qtyMode: 'each',
    productCodes: ['ROS04591', 'ROS05376', 'ROS28054', 'ROS31085', 'ROS15009', 'ROS41855', 'ROS04294',
      'ROS32327', 'ROS23714', 'ROS23684', 'ROS08711', 'ROS12732', 'ROS02863', 'ROS50291', 'ROS50406'],
    reward: { rewardProduct: '__SAME__', rewardQty: 1, rewardAmount: null, discountPct: null },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  /* June salesman incentive — staff payout programs (never published as
     settlement campaigns). A customer qualifies via the buy condition; a
     salesman achieves at the minimum number of qualifying customers. */
  {
    id: 'seed_june_rep_choc', status: 'active', rewardType: 'salesman_reward',
    name: 'June Rep Incentive — Chocolate Bars',
    startDate: '2026-06-01', endDate: '2026-06-30',
    customerScope: 'all', customerCodes: [],
    buyQty: 2, qtyMode: 'each', // 2 outers per customer, single SKU (no mixing)
    productCodes: ['ROS44061', 'ROS44092'],
    reward: { rewardProduct: '', rewardQty: null, rewardAmount: 8, discountPct: null },
    repIncentive: { minCustomers: 10, supervisorAmount: 2 },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  /* Johnny Krocker COCONUT 2+1 — a standing offer on the coconut wafer only
     (business confirmed; the data agrees: every free JK case in June is
     ROS48038). It was never in the audited tool. Runs 1 Jun - 30 Sep 2026:
     June starts it right after Eid (Apr-May coconut free goods were already
     compensated under the Eid campaign), and each new month's upload
     (Jul-Sep) recalculates it automatically through the frozen engine,
     exactly like the Lovita campaign model. */
  {
    id: 'seed_jk_2p1', rev: 2, status: 'active', rewardType: 'free_product',
    name: 'Johnny Krocker Coconut 2+1',
    startDate: '2026-06-01', endDate: '2026-09-30',
    customerScope: 'all', customerCodes: [],
    buyQty: 2, qtyMode: 'each',
    productCodes: ['ROS48038'],
    reward: { rewardProduct: '__SAME__', rewardQty: 1, rewardAmount: null, discountPct: null },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  /* July salesman incentive — 7 candy SKUs; a customer qualifies at 20 PIECES
     mixed across the selected SKUs (business confirmed: assortment allowed);
     a salesman achieves at 20 qualifying customers and earns SAR 200.
     Condition counted in pieces (buyUnit 'pcs'). */
  {
    id: 'seed_july_rep_candy', rev: 2, status: 'active', rewardType: 'salesman_reward',
    name: 'July Rep Incentive — Candies',
    startDate: '2026-07-01', endDate: '2026-07-31',
    customerScope: 'all', customerCodes: [],
    buyQty: 20, buyUnit: 'pcs', qtyMode: 'combined', // 20 pcs per customer, mix across SKUs allowed
    productCodes: ['ROS23714', 'ROS23684', 'ROS08711', 'ROS12732', 'ROS02863', 'ROS50291', 'ROS50406'],
    reward: { rewardProduct: '', rewardQty: null, rewardAmount: 200, discountPct: null },
    repIncentive: { minCustomers: 20, supervisorAmount: 0 },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
  {
    id: 'seed_june_rep_bisc', status: 'active', rewardType: 'salesman_reward',
    name: 'June Rep Incentive — Tea Biscuits',
    startDate: '2026-06-01', endDate: '2026-06-30',
    customerScope: 'all', customerCodes: [],
    buyQty: 1, qtyMode: 'combined', // 1 box per customer, mix allowed
    productCodes: ['ROS14699', 'ROS14675'],
    reward: { rewardProduct: '', rewardQty: null, rewardAmount: 8, discountPct: null },
    repIncentive: { minCustomers: 15, supervisorAmount: 2 },
    createdAt: 1780300800000, updatedAt: 1780300800000,
  },
];
const Seeds = (() => {
  function merge() {
    const dismissed = Store.get('seedDismissed', []);
    const byId = new Map(PBModel.load().map(p => [p.id, p]));
    SEED_PROMOS.forEach(s => {
      if (dismissed.includes(s.id)) return;
      const cur = byId.get(s.id);
      // rev bump = a business correction to an already-shipped seed; replace
      // the stored copy so every browser picks up the corrected definition
      if (cur && (Number(s.rev) || 1) <= (Number(cur.rev) || 1)) return;
      PBModel.upsert(JSON.parse(JSON.stringify(s)));
    });
  }
  /** Remember that the user deleted a seeded promotion so it never comes back. */
  function dismiss(id) {
    if (!String(id).startsWith('seed_')) return;
    const d = Store.get('seedDismissed', []);
    if (!d.includes(id)) { d.push(id); Store.set('seedDismissed', d); }
  }
  return { merge, dismiss };
})();

/* ===== END VERBATIM ===== */
export { SEED_PROMOS, Seeds };