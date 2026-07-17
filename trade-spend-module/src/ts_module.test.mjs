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

eval(src);
const T = global.TS._internals;
let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : (fail++, console.log('FAIL', name, '\n  got ', JSON.stringify(got), '\n  want', JSON.stringify(want)));
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

// 4) calcSalesForRange — multi-entry acct + category filter
eq('sales pre window (both name variants)', T.calcSalesForRange('10-001495', ['Bonny Fruit'], [], '2025-11-01', '2026-01-31'), { amount: 1000, cases: 10 });
eq('sales post window', T.calcSalesForRange('10-001495', ['Bonny Fruit'], [], '2026-02-01', '2026-04-30'), { amount: 1600, cases: 16 });
eq('sales ALL categories includes Roshetto row', T.calcSalesForRange('10-001495', ['ALL'], [], '2026-02-01', '2026-04-30'), { amount: 2599, cases: 25 });
eq('sales SKU filter', T.calcSalesForRange('10-001495', ['ALL'], ['Roshetto Dark'], '2026-02-01', '2026-04-30'), { amount: 999, cases: 9 });
eq('sales unknown acct', T.calcSalesForRange('nope', ['ALL'], [], '2025-01-01', '2027-01-01'), { amount: 0, cases: 0 });

// 5) uplift / roi / verdict — legacy formulas & thresholds
const perf = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 500);
eq('perf pre', perf.preAmount, 1000);
eq('perf post', perf.postAmount, 1600);
eq('perf incremental', perf.incremental, 600);
eq('perf uplift', perf.uplift, 0.6);
eq('perf roi = (600-500)/500', perf.roi, 0.2);
eq('perf verdict at exactly 0.2', perf.verdict, 'Successful');
const perf2 = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 1600);
eq('perf2 roi negative', perf2.roi, (600 - 1600) / 1600);
eq('perf2 verdict Loss', perf2.verdict, 'Loss');
const perf3 = T.computePerf('10-001495', ['Bonny Fruit'], [], 'Floor Display', '2026-02-01', null, 600);
eq('perf3 verdict Break-even (roi=0)', perf3.verdict, 'Break-even');

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
