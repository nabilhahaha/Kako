import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { Client } from 'pg';
import { hasTestDb, withRollback, actAs, resetRole } from '../db';

/**
 * FE-5c — configurable weighted scoring + component states.
 * Weights/states resolve rep → route → company → industry-pack, with no code
 * change. Overall = Σ(score·weight)/Σ(participating weights); breakdown shows
 * Component Score × Weight = Contribution. States: required (missing ⇒ 0),
 * optional (missing ⇒ excluded), disabled (never participates). Scope is
 * unchanged — weighting never widens what a manager may see.
 */

async function capFor(c: Client, company: string, cust: string, rep: string, kind: string, values: object): Promise<void> {
  const form = (await c.query("select id from erp_form_definitions where key='fe_merchandising_audit' and company_id is null")).rows[0].id;
  const sub = (await c.query('insert into erp_form_submissions(company_id, form_id, record_id, submitter, values, status) values($1,$2,$3,$4,$5::jsonb,$6) returning id',
    [company, form, cust, rep, JSON.stringify(values), 'approved'])).rows[0].id;
  await c.query('insert into erp_fe_captures(company_id, customer_id, form_id, submission_id, kind, created_by) values($1,$2,$3,$4,$5,$6)', [company, cust, form, sub, kind, rep]);
}

describe.skipIf(!hasTestDb)('FE-5c · configurable weighted scoring', () => {
  it('pure overall + breakdown honour weights and component states', async () => {
    await withRollback(async (c) => {
      const w = '{"coverage":25,"compliance":20,"merchandising":20,"oos":15,"survey":10,"opportunity":10}';
      const sReq = '{"coverage":"required","compliance":"required","merchandising":"required","oos":"optional","survey":"optional","opportunity":"optional"}';
      const sOpt = '{"coverage":"required","compliance":"required","merchandising":"optional","oos":"optional","survey":"optional","opportunity":"optional"}';
      const ov = async (comp: string, states: string) =>
        Number((await c.query('select erp_fe_weighted_overall($1::jsonb,$2::jsonb,$3::jsonb) v', [comp, w, states])).rows[0].v);

      // all present → straight weighted average
      expect(await ov('{"coverage":80,"compliance":90,"merchandising":70,"oos":60,"survey":50,"opportunity":100}', sOpt)).toBe(76);
      // optional survey missing → excluded (denominator drops its weight)
      expect(await ov('{"coverage":80,"compliance":90,"merchandising":70,"oos":60,"survey":null,"opportunity":100}', sOpt)).toBe(79);
      // required merchandising missing → counts as 0 (penalty, weight retained)
      expect(await ov('{"coverage":80,"compliance":90,"merchandising":null,"oos":60,"survey":50,"opportunity":100}', sReq)).toBe(62);
      // disabled opportunity (even with data) → excluded entirely
      const disabled = sOpt.replace('"opportunity":"optional"', '"opportunity":"disabled"');
      expect(await ov('{"coverage":80,"compliance":90,"merchandising":70,"oos":60,"survey":50,"opportunity":100}', disabled)).toBe(73);
      // capture-only surface (coverage/compliance keys absent) → never penalised
      expect(await ov('{"merchandising":70,"oos":60,"survey":50,"opportunity":100}', sReq)).toBe(69);

      // breakdown: Score × Weight = Contribution, normalised over participating weights
      const bdStates = '{"coverage":"required","compliance":"required","merchandising":"required","oos":"optional","survey":"optional","opportunity":"disabled"}';
      const bd = (await c.query('select erp_fe_score_breakdown($1::jsonb,$2::jsonb,$3::jsonb) v',
        ['{"coverage":80,"compliance":90,"merchandising":null,"oos":60,"survey":null,"opportunity":100}', w, bdStates]
      )).rows[0].v as { component: string; score: number | null; weight: number; state: string; contribution: number | null }[];
      const by = Object.fromEntries(bd.map((r) => [r.component, r]));
      // participating weights = coverage 25 + compliance 20 + merch 20 + oos 15 = 80
      expect(by.coverage.contribution).toBe(25);       // 80·25/80
      expect(by.compliance.contribution).toBe(22.5);   // 90·20/80
      expect(by.merchandising.score).toBe(0);          // required + missing ⇒ 0
      expect(by.merchandising.contribution).toBe(0);
      expect(by.oos.contribution).toBe(11.3);          // 60·15/80 = 11.25 → 11.3
      expect(by.survey.contribution).toBeNull();       // optional + missing
      expect(by.opportunity.contribution).toBeNull();  // disabled
    });
  }, 30_000);

  it('resolves rep → route → company → industry-pack defaults', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEW') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x')", [admin]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true)", [admin, branch]);
      const route = (await c.query("insert into erp_routes(company_id, name) values($1,'R1') returning id", [company])).rows[0].id;
      const rep = randomUUID();

      await actAs(c, admin);
      // 1) no company rows → industry-pack (FMCG) defaults
      let r = (await c.query('select erp_fe_resolve_weights(null,null) w, erp_fe_resolve_states(null,null) s')).rows[0];
      expect(Number(r.w.coverage)).toBe(25);
      expect(Number(r.w.opportunity)).toBe(10);
      expect(r.s.coverage).toBe('required');
      expect(r.s.survey).toBe('optional');

      // 2) company override via the no-code save RPC
      await c.query('select erp_fe_save_weights($1::jsonb)', [JSON.stringify([{ component: 'coverage', weight: 40, state: 'required' }, { component: 'survey', weight: 5, state: 'disabled' }])]);
      r = (await c.query('select erp_fe_resolve_weights(null,null) w, erp_fe_resolve_states(null,null) s')).rows[0];
      expect(Number(r.w.coverage)).toBe(40);          // company beats pack
      expect(r.s.survey).toBe('disabled');
      expect(Number(r.w.compliance)).toBe(20);        // untouched → still pack default
      expect((await c.query("select (erp_fe_company_weights()->>'custom')::boolean b")).rows[0].b).toBe(true);
      await resetRole(c);

      // 3) route + rep overrides (written directly) beat company
      await c.query("insert into erp_fe_score_weights(company_id,scope_level,scope_id,component,weight,state) values($1,'route',$2,'coverage',60,'required')", [company, route]);
      await c.query("insert into erp_fe_score_weights(company_id,scope_level,scope_id,component,weight,state) values($1,'rep',$2,'coverage',70,'required')", [company, rep]);
      await actAs(c, admin);
      expect(Number((await c.query('select erp_fe_resolve_weights($1,null) w', [route])).rows[0].w.coverage)).toBe(60);   // route override
      expect(Number((await c.query('select erp_fe_resolve_weights($1,$2) w', [route, rep])).rows[0].w.coverage)).toBe(70); // rep beats route
      expect(Number((await c.query('select erp_fe_resolve_weights(null,null) w')).rows[0].w.coverage)).toBe(40);          // company default unchanged
      await resetRole(c);
    });
  }, 30_000);

  it('perf overall is weighted from company config; breakdown is drillable; scope preserved', async () => {
    await withRollback(async (c) => {
      const company = (await c.query("insert into erp_companies(name) values('FEWP') returning id")).rows[0].id;
      const branch = (await c.query("insert into erp_branches(company_id, code, name) values($1,'B','Main') returning id", [company])).rows[0].id;
      const admin = randomUUID(), mgr = randomUUID(), rep = randomUUID(), repOther = randomUUID();
      await c.query("insert into auth.users(id,email) values($1,'ad@x'),($2,'mg@x'),($3,'rp@x'),($4,'ro@x')", [admin, mgr, rep, repOther]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default) values($1,$2,'admin',true),($3,$2,'supervisor',true)", [admin, branch, mgr]);
      await c.query("insert into erp_user_branches(user_id,branch_id,role,is_default,reports_to) values($1,$2,'rep',true,$3),($4,$2,'rep',true,$3)", [rep, branch, mgr, repOther]);
      await c.query("insert into erp_matrix_role_permissions(company_id, role_key, permission) values($1,'supervisor','field_ops:view')", [company]);
      const cust = (await c.query("insert into erp_customers(company_id, code, name, salesman_id) values($1,'C1','C1',$2) returning id", [company, rep])).rows[0].id;
      // rep has merch (planogram yes ⇒ 100) + one high-severity OOS (⇒ 100−30 = 70); no plan ⇒ coverage/compliance excluded
      await capFor(c, company, cust, rep, 'merchandising', { planogram_compliance: 'yes' });
      await capFor(c, company, cust, rep, 'out_of_stock', { severity: 'high' });

      // company config: merch weight 30, oos weight 10 (both optional)
      await actAs(c, admin);
      await c.query('select erp_fe_save_weights($1::jsonb)', [JSON.stringify([
        { component: 'merchandising', weight: 30, state: 'optional' }, { component: 'oos', weight: 10, state: 'optional' }])]);
      await resetRole(c);

      // supervisor reads the rep node — overall is weighted from company config
      await actAs(c, mgr);
      const perf = (await c.query("select erp_fe_perf('rep',$1::text,null,null,'week') j", [rep])).rows[0].j;
      // expected = (100·30 + 70·10) / 40 = 3700/40 = 92.5 → 93
      expect(perf.metrics.overall).toBe(93);
      const bd = Object.fromEntries((perf.breakdown as { component: string; score: number | null; weight: number; contribution: number | null }[]).map((r) => [r.component, r]));
      expect(Number(bd.merchandising.weight)).toBe(30);
      expect(bd.merchandising.score).toBe(100);
      expect(bd.oos.score).toBe(70);
      // participating weight = 40 → merch 100·30/40 = 75, oos 70·10/40 = 17.5
      expect(bd.merchandising.contribution).toBe(75);
      expect(bd.oos.contribution).toBe(17.5);
      expect(bd.survey.contribution).toBeNull();        // optional + no data
      // SCOPE PRESERVED: the other team's rep is out of this supervisor's scope
      const other = (await c.query("select erp_fe_perf('rep',$1::text,null,null,'week') j", [repOther])).rows[0].j;
      expect(other.metrics.captures).toBe(0);
      expect(other.metrics.overall).toBeNull();
      await resetRole(c);
    });
  }, 30_000);
});
