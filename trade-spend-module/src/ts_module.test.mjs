// Mechanical parity tests for TS calc/model logic (Node, stubbed globals).
import { readFileSync } from 'fs';
const src = readFileSync('/home/user/Kako/trade-spend-module/src/ts_module.js', 'utf8');

// ── stub browser + dashboard globals ──
global.window = global;
global.document = {
  readyState: 'complete',
  addEventListener() {}, getElementById: () => null, querySelectorAll: () => [],
  createElement: () => ({ getContext: () => ({ drawImage() {} }), style: {}, classList: { add() {}, toggle() {}, remove() {} } }),
  documentElement: {}, body: { appendChild() {} }, head: { appendChild() {} }
};
global.getComputedStyle = () => ({ getPropertyValue: () => '' });
global.CURRENT_MODE = 'tradespend';
// dashboard dataset: epoch 2025-01-01, ints
global.dateToInt = (s) => { const [y,m,d] = String(s).slice(0,10).split('-').map(Number); return Math.round((Date.UTC(y,m-1,d) - Date.UTC(2025,0,1)) / 86400000); };
global.DIMS = { categories: ['Bonny Fruit', 'Sweet Packet', 'Roshetto'] };
global.CUSTOMERS = [
  { id: 1, acct: '10-001495', name: 'WOW KHAMSA CO.' },
  { id: 2, acct: '10-001495', name: 'WOW KHAMSA CO' },   // name-variant duplicate (legacy bug-fix case)
  { id: 3, acct: '10-000002', name: 'OTHER' }
];
global.SKUS = [ { id: 11, d: 'Berry Mix 18X200G', c: 0 }, { id: 12, d: 'Roshetto Dark', c: 2 } ];
global.SKU_BY_ID = Object.fromEntries(SKUS.map(s => [s.id, s]));
// rows: cust 1&2 share acct; values chosen so pre=1000, post=1600 for Bonny Fruit
global.D = {
  cu: [1, 2, 1, 1, 3],
  sk: [11, 11, 11, 12, 11],
  d:  [dateToInt('2026-01-10'), dateToInt('2026-01-20'), dateToInt('2026-02-15'), dateToInt('2026-02-20'), dateToInt('2026-02-10')],
  s:  [600, 400, 1600, 999, 5555],
  q:  [6, 4, 16, 9, 55]
};
global.QC = (i) => D.q[i];
global.META = { dateMin: '2025-01-01', dateMax: '2027-12-31' };  // full coverage for baseline tests

eval(src);
const T = global.TS._internals;
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)));
};
const approx = (name, got, want, tol = 1e-9) => {
  const ok = got != null && Math.abs(got - want) <= tol;
  ok ? pass++ : (fail++, console.log('FAIL', name, 'got', got, 'want', want));
};

// 1) computeOverall matrix — verbatim legacy behaviour
eq('overall both approved + fully executed', T.computeOverall({ reliaStatus: 'Approved', roshenStatus: 'Approved', execStatus: 'Fully Executed' }), 'Completed');
eq('overall both approved not executed', T.computeOverall({ reliaStatus: 'Approved', roshenStatus: 'Approved', execStatus: 'Not Executed' }), 'Approved');
eq('overall one rejected', T.computeOverall({ reliaStatus: 'Rejected', roshenStatus: 'Approved' }), 'Rejected');
eq('overall pending', T.computeOverall({ reliaStatus: 'Pending Approval', roshenStatus: 'Approved' }), 'Pending Approval');
eq('overall in progress', T.computeOverall({ reliaStatus: 'X', roshenStatus: 'Y' }), 'In Progress');

// 2) period windows — non-rental default 3 months
const p = T.getPeriodForActivity('Floor Display', '2026-02-01', null, '10-001495', ['Bonny Fruit']);
eq('pre start (3mo back)', p.preStartDateStr, '2025-11-01');
eq('pre end (day before)', p.preEndDateStr, '2026-01-31');
eq('post start', p.postStartDateStr, '2026-02-01');
eq('post end', p.postEndDateStr, '2026-04-30');
eq('post days', p.postDays, 89);
eq('rental months null', p.rentalMonths, null);

// 3) rental 6 months
const p6 = T.getPeriodForActivity('Gondola - Rent 6 Months', '2026-02-01', null, 'X', ['Bonny Fruit']);
eq('rental6 pre start', p6.preStartDateStr, '2025-08-01');
eq('rental6 post end', p6.postEndDateStr, '2026-07-31');
eq('rental6 months', p6.rentalMonths, 6);

// 4) calcSalesForRange — multi-entry acct + category filter (subset match: v2 adds discount/gross fields)
const sub = (name, got, want) => eq(name, Object.fromEntries(Object.keys(want).map(k => [k, got[k]])), want);
sub('sales pre window (both name variants)', T.calcSalesForRange('10-001495', ['Bonny Fruit'], [], '2025-11-01', '2026-01-31'), { amount: 1000, cases: 10 });
sub('sales post window', T.calcSalesForRange('10-001495', ['Bonny Fruit'], [], '2026-02-01', '2026-04-30'), { amount: 1600, cases: 16 });
sub('sales ALL categories includes Roshetto row', T.calcSalesForRange('10-001495', ['ALL'], [], '2026-02-01', '2026-04-30'), { amount: 2599, cases: 25 });
sub('sales SKU filter', T.calcSalesForRange('10-001495', ['ALL'], ['Roshetto Dark'], '2026-02-01', '2026-04-30'), { amount: 999, cases: 9 });
sub('sales unknown acct', T.calcSalesForRange('nope', ['ALL'], [], '2025-01-01', '2027-01-01'), { amount: 0, cases: 0 });

// 5) uplift / roi / verdict — DAY-NORMALIZED, coverage-aware business math
// windows: pre Nov1–Jan31 = 92d, post Feb1–Apr30 = 89d; pre=1000, post=1600
// preRate=1000/92, baseline=preRate*89=967.3913..., incremental=632.6086...
const perf = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 500);
eq('perf pre (raw sum)', perf.preAmount, 1000);
eq('perf post (raw sum)', perf.postAmount, 1600);
eq('perf covered days', [perf.preDaysCovered, perf.postDaysCovered], [92, 89]);
approx('perf baseline pro-rated', perf.baselineAmount, 967.3913043478261, 1e-6);
approx('perf incremental vs baseline', perf.incremental, 632.6086956521739, 1e-6);
approx('perf uplift (rate-based)', perf.uplift, 0.6539325842696629, 1e-6);
approx('perf roi = (inc-500)/500', perf.roi, 0.26521739130434774, 1e-6);
eq('perf verdict Successful', perf.verdict, 'Successful');
const perf2 = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 1600);
approx('perf2 roi negative', perf2.roi, -0.6046195652173914, 1e-6);
eq('perf2 verdict Loss', perf2.verdict, 'Loss');
const perf3 = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 600);
approx('perf3 roi small positive', perf3.roi, 0.054347826086956465, 1e-6);
eq('perf3 verdict Break-even', perf3.verdict, 'Break-even');

// 5b) EQUAL DAILY RATE across unequal windows -> incremental ~ 0 (the core fix).
// Simulate truncation via the test hook: next activity 28 days after this one.
TS._setActivitiesForTest([
  { id: 'TRUNC-NEXT', custCode: '10-001495', categories: ['Bonny Fruit'], activityDate: '2026-03-01' }
]);
const perfT = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', 'CUR', 500);
eq('truncated post window (28d)', [perfT.periods.truncatedBy, perfT.postDaysCovered], ['TRUNC-NEXT', 28]);
// post window Feb1–Feb28 contains the 2026-02-15 (day 411? no: dataset rows) — post rows: 2026-02-15 (1600) only
// preRate=1000/92 -> baseline=10.8696*28=304.348; incremental=1600-304.348=1295.652 -> strong positive, NOT a fake loss
approx('truncated baseline', perfT.baselineAmount, 1000/92*28, 1e-6);
approx('truncated incremental', perfT.incremental, 1600 - 1000/92*28, 1e-6);
eq('truncated verdict not fake-Loss', perfT.verdict, 'Successful');
TS._setActivitiesForTest([]);

// 5c) ZERO post-window coverage -> Pending, null metrics (no fake -100% Loss)
global.META = { dateMin: '2025-01-01', dateMax: '2026-02-20' };
const perfZ = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-06-01', null, 500);
eq('zero-coverage post -> Pending', perfZ.verdict, 'Pending');
eq('zero-coverage metrics null', [perfZ.roi, perfZ.uplift, perfZ.incremental, perfZ.baselineAmount], [null, null, null, null]);
eq('zero-coverage postDays', perfZ.postDaysCovered, 0);

// 5d) PARTIAL post coverage normalizes by covered days
const perfP = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 500);
eq('partial post covered (Feb1-Feb20 = 20d)', perfP.postDaysCovered, 20);
approx('partial baseline = preRate*20', perfP.baselineAmount, 1000/92*20, 1e-6);
global.META = { dateMin: '2025-01-01', dateMax: '2027-12-31' };

// 6) row mapping round-trip
const act = { id: 'TS-2026-099', custCode: '10-001495', custName: 'WOW', categories: ['Bonny Fruit'], skus: ['Berry Mix 18X200G'], actType: 'Floor Display', activityDate: '2026-02-01', postEndDate: '2026-04-30', totalAmount: 500, reliaPct: 50, roshenPct: 50, reliaAmount: 250, roshenAmount: 250, execStatus: 'Fully Executed', claimReceived: 'Yes', claimRef: 'CR-1', roshenStatus: 'Approved', reliaStatus: 'Approved', finalApproved: 'No', overallStatus: 'Completed', execPhotos: ['data:x'], creditNoteImage: 'data:y', creditNoteFilename: 'cn.jpg', notes: 'n', createdBy: 'a@b.c', createdAt: '2026-02-01T00:00:00Z', uplift: 0.6, roi: 0.2, verdict: 'Successful' };
const row = T.activityToRow(act);
eq('row code', row.activity_code, 'TS-2026-099');
eq('row category single', row.category, 'Bonny Fruit');
eq('row claim', row.claim_received, 'Yes');
eq('row photos separated', row.photos.execPhotos.length, 1);
eq('row data has no photos', row.data.execPhotos === undefined && row.data.creditNoteImage === undefined, true);
const back = T.rowToActivity(row);
eq('roundtrip id', back.id, 'TS-2026-099');
eq('roundtrip photos restored', back.execPhotos.length, 1);
eq('roundtrip credit note', back.creditNoteImage, 'data:y');
eq('roundtrip roi', back.roi, 0.2);

// 7) live display layer — always current dataset, stored fallback for unresolvable customers
// (module must expose displayPerf/livePerf through _internals for this to run)
if (T.displayPerf) {
  const actLive = { id: 'TS-L1', custCode: '10-001495', custName: 'WOW', categories: ['Bonny Fruit'], actType: 'Floor Display', activityDate: '2026-02-01', totalAmount: 500, preAmount: 1, postAmount: 2, uplift: 9, roi: 9, verdict: 'Loss' };
  const dpLive = T.displayPerf(actLive);
  eq('display live flag', dpLive.live, true);
  eq('display live ignores stored (pre)', dpLive.pre, 1000);
  approx('display live roi (day-normalized)', dpLive.roi, 0.26521739130434774, 1e-6);
  approx('display live baseline', dpLive.baseline, 967.3913043478261, 1e-6);
  eq('display live verdict', dpLive.verdict, 'Successful');
  const actGhost = { id: 'TS-L2', custCode: 'NO-SUCH', custName: 'X', categories: ['Bonny Fruit'], actType: 'Shelf', activityDate: '2026-02-01', totalAmount: 100, preAmount: 111, postAmount: 222, uplift: 1, roi: 0.5, verdict: 'Successful', postStartDate: '2026-02-01', postEndDate: '2026-04-30', duration: 89 };
  const dpGhost = T.displayPerf(actGhost);
  eq('display fallback flag', dpGhost.live, false);
  eq('display fallback keeps stored pre', dpGhost.pre, 111);
  eq('display fallback keeps stored verdict', dpGhost.verdict, 'Successful');
}

// 6) ENGINE V2 — ROTS, Trade Spend %, After window, retention, baseline floor, overlaps
// base case: pre=1000/92d, during=1600/89d, spend=500 -> incremental=632.6086956521739
{
  const v = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 500);
  approx('v2 ROTS = incremental/spend', v.rots, 632.6086956521739 / 500, 1e-9);
  approx('v2 Trade Spend % = spend/during', v.spendPct, 500 / 1600, 1e-9);
  // after window: during ends 2026-04-30 (89d) -> after = 2026-05-01..2026-07-28, dataset ends 2026-05-31 in stub META
  eq('v2 after window start', v.periods.afterStartDateStr, '2026-05-01');
}
// after-window measurement with full coverage: widen META, place a sale in the after window
{
  const M0 = global.META;
  global.META = { dateMin: '2025-01-01', dateMax: '2026-12-31' };
  const v = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 500);
  eq('v2 after days covered = during length', v.afterDaysCovered, 89);
  // no dataset rows fall in May-Jul -> after amount 0, retention 0
  eq('v2 after amount (no rows)', v.afterAmount, 0);
  approx('v2 retention 0 when after empty', v.retention, 0, 1e-9);
  global.META = M0;
}
// after window blocked by an immediately-following activity
{
  TS._setActivitiesForTest([{ id: 'NEXT-IMMEDIATE', custCode: '10-001495', categories: ['Bonny Fruit'], activityDate: '2026-03-01' }]);
  const v = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', 'CUR', 500);
  eq('v2 after blocked by next activity', [v.periods.afterBlocked, v.periods.afterStartDateStr, v.afterDaysCovered], [true, null, 0]);
  TS._setActivitiesForTest([]);
}
// overlap detection: same-day activity for same customer + overlapping cats
{
  TS._setActivitiesForTest([{ id: 'SAME-DAY', custCode: '10-001495', categories: ['ALL'], actType: 'Floor Display', activityDate: '2026-02-01' }]);
  const v = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', 'CUR', 500);
  eq('v2 same-day overlap detected', v.overlaps, ['SAME-DAY']);
  TS._setActivitiesForTest([]);
}
// consecutive (not simultaneous) activities are NOT flagged as overlap (truncation handles them)
{
  TS._setActivitiesForTest([{ id: 'LATER', custCode: '10-001495', categories: ['Bonny Fruit'], actType: 'Floor Display', activityDate: '2026-03-01' }]);
  const v = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', 'CUR', 500);
  eq('v2 consecutive not flagged as overlap', v.overlaps, []);
  TS._setActivitiesForTest([]);
}
// discount accounting: gross = net + discount, discountPct = discount/gross
{
  const r = T.calcSalesForRange('10-001495', ['Bonny Fruit'], [], '2025-11-01', '2026-01-31');
  eq('v2 gross = net + discount', r.gross, r.amount + r.discount);
}
// baseline floor: returns-heavy pre period must not produce a negative baseline
{
  const M0 = global.META, D0 = global.D;
  // craft a tiny dataset: one big return before, one sale during
  const QC0 = global.QC;
  global.D = { cu: [1, 1], sk: [11, 11], d: [global.dateToInt('2026-01-10'), global.dateToInt('2026-02-10')], s: [-500, 300], qx: [100, 100], di: [0, 0] };
  global.QC = (i) => global.D.qx[i] / 100;
  global.META = { dateMin: '2025-01-01', dateMax: '2026-12-31' };
  TS._setActivitiesForTest([]);
  TS._resetSalesIndexForTest && TS._resetSalesIndexForTest();
  const v = T.computePerf('10-001495', ['ALL'], [], 'Floor Display', '2026-02-01', null, 100);
  eq('v2 baseline floored at 0', [v.baselineAmount, v.baselineFloored], [0, true]);
  approx('v2 incremental = during when floored', v.incremental, 300, 1e-9);
  global.D = D0; global.META = M0; global.QC = QC0;
  TS._resetSalesIndexForTest && TS._resetSalesIndexForTest();
}

// 7) PRODUCTION-BUG REGRESSIONS (found in authenticated live session)
// 7a. legacy photo objects {name,data} must render (src = .data)
{
  const row = T.activityToRow({ id: 'TS-P1', custCode: 'x', custName: 'x', categories: ['ALL'], skus: [], actType: 'T', activityDate: '2026-01-01', totalAmount: 1, execPhotos: [{ name: 'a.jpg', data: 'data:image/jpeg;base64,AAA' }], creditNoteImage: '', creditNoteFilename: '', roshenStatus: 'Pending Approval', reliaStatus: 'Pending Approval', finalApproved: 'No', createdBy: 'a@b.c', createdAt: 'z' });
  const back = T.rowToActivity(row);
  eq('photo object survives roundtrip', back.execPhotos[0].data, 'data:image/jpeg;base64,AAA');
}
// 7b. dataset swap with SAME lengths but different ids must invalidate the sales index
{
  const before = T.calcSalesForRange('10-001495', ['ALL'], [], '2026-01-01', '2026-03-01');
  // swap: remap in place — same array lengths, different customer ids
  const oldCu = global.D.cu.slice();
  global.CUSTOMERS[0].id = 91; global.CUSTOMERS[1].id = 92; // acct 10-001495 now ids 91/92
  global.D.cu = global.D.cu.map(v => (v === 1 ? 91 : v === 2 ? 92 : v));
  const after = T.calcSalesForRange('10-001495', ['ALL'], [], '2026-01-01', '2026-03-01');
  eq('stale-index guard: same-size swap recomputes correctly', Math.round(after.amount), Math.round(before.amount));
  global.CUSTOMERS[0].id = 1; global.CUSTOMERS[1].id = 2; global.D.cu = oldCu;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
