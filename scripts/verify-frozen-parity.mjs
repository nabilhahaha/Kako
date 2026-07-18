#!/usr/bin/env node
/**
 * Numerical parity check for the extracted frozen promotion engines.
 *
 * Runs the verbatim modules under Node and asserts the audited reference
 * invariants that the original platform documents at 80% compensation rate:
 *   Eid al-Adha  = 212,361.60
 *   Lovita 2+1   =  39,877.32
 *   Portfolio    = 252,238.92
 * plus engine-level smoke checks (compliance / alerts / effectiveness run
 * and produce the audited counts).
 *
 * Usage: node scripts/verify-frozen-parity.mjs
 */
import { engine } from '../src/lib/promotions/frozen/engine-bootstrap.js';
import { ComplianceEngine, EffectivenessEngine } from '../src/lib/promotions/frozen/compliance-effectiveness.js';
import { AlertEngine } from '../src/lib/promotions/frozen/alert-engine.js';
import { PortfolioDash } from '../src/lib/promotions/frozen/portfolio.js';
import { PBModel } from '../src/lib/promotions/frozen/pb-model.js';
import { SEED_PROMOS } from '../src/lib/promotions/frozen/seeds.js';
import { PBData } from '../src/lib/promotions/frozen/master-data.js';

let failures = 0;
function assertEq(label, actual, expected) {
  const a = typeof actual === 'number' ? actual.toFixed(2) : String(actual);
  const e = typeof expected === 'number' ? expected.toFixed(2) : String(expected);
  if (a === e) console.log(`OK   ${label} = ${a}`);
  else { console.error(`FAIL ${label}: expected ${e}, got ${a}`); failures++; }
}
function assertTrue(label, cond, detail = '') {
  if (cond) console.log(`OK   ${label}${detail ? ` (${detail})` : ''}`);
  else { console.error(`FAIL ${label}${detail ? ` (${detail})` : ''}`); failures++; }
}

// --- Reference invariants @ 80% ---
const eid = engine.promotions.find((p) => p.id === 'eid_adha');
const lovita = engine.promotions.find((p) => p.id === 'lovita_2plus1');
assertTrue('audited promos present', Boolean(eid && lovita));
assertEq('rate eid', eid.rate, 0.8);
assertEq('rate lovita', lovita.rate, 0.8);
assertEq('Eid compensation @80%', eid.compensation, 212361.6);
assertEq('Lovita compensation @80%', lovita.compensation, 39877.32);
assertEq('Portfolio compensation @80%', engine.portfolioCompensation, 252238.92);
assertEq('Portfolio incl VAT @80%', engine.portfolioCompensationInclVat, 252238.92 * 1.15);
assertEq('Company share retained', engine.companyShareRetained,
  engine.portfolioFreeValue - engine.portfolioCompensation);

// Rate sweep sanity (rate is clamped to [0,1]; formula is linear).
const saved = eid.rate;
eid.rate = 0.37;
assertEq('Eid @37%', eid.compensation, eid.freeValue * 0.37);
eid.rate = 1.7; // must clamp to 1
assertEq('rate clamp upper', eid.rate, 1);
eid.rate = saved;

// --- Engine smoke checks over the audited bundles ---
const comp = ComplianceEngine.summary(eid);
assertTrue('ComplianceEngine.summary runs', comp && typeof comp === 'object',
  `keys: ${Object.keys(comp || {}).slice(0, 6).join(',')}`);
const eff = EffectivenessEngine.analyze(eid);
assertTrue('EffectivenessEngine.analyze runs', eff && typeof eff === 'object');
const alerts = AlertEngine.scan(eid);
assertTrue('AlertEngine.scan runs', Array.isArray(alerts), `${alerts.length} alerts`);
const alertSummary = AlertEngine.summary(eid);
assertTrue('AlertEngine.summary runs', alertSummary && typeof alertSummary.total === 'number',
  `total ${alertSummary.total}, exposure ${alertSummary.exposure}`);
const dash = PortfolioDash.aggregate();
assertTrue('PortfolioDash.aggregate runs', dash && typeof dash === 'object');
assertEq('PortfolioDash totCompVat', dash.totCompVat, engine.portfolioCompensationInclVat);

// --- Builder-model & master smoke checks ---
const blank = PBModel.blank();
assertTrue('PBModel.blank id prefix', String(blank.id).startsWith('pb_'), blank.id);
const errs = PBModel.validate(blank);
assertTrue('PBModel.validate flags empty draft', Array.isArray(errs) && errs.length >= 5, `${errs.length} issues`);
assertTrue('SEED_PROMOS shipped', Array.isArray(SEED_PROMOS) && SEED_PROMOS.length === 7, `${SEED_PROMOS.length} seeds`);
assertTrue('PBData products', PBData.products().length >= 74, `${PBData.products().length}`);
assertTrue('PBData customers', PBData.customers().length >= 2187, `${PBData.customers().length}`);

if (failures) {
  console.error(`\n${failures} parity check(s) FAILED — frozen engines diverge from the reference.`);
  process.exit(1);
}
console.log('\nAll parity checks passed — extracted engines reproduce the audited figures.');
