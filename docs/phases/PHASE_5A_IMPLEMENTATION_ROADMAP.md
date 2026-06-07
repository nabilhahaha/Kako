# VANTORA — Phase 5A (Global Tax Engine Core) Implementation Roadmap

**Status:** 📋 **Implementation planning only — no code/migrations yet.** Plans the build
of Phase 5A against the **frozen** baseline
`docs/architecture/platform/PHASE_5_GLOBAL_TAX_EINVOICING_PROPOSAL.md` (approved 2026-06-07).
**Scope of 5A:** the country-agnostic Global Tax Engine core — legal-entity dimension,
multi-registration, effective-dated tax codes/groups/rules, VAT calculation
(inclusive/exclusive/multi-rate/zero/exempt/out-of-scope), credit/debit notes, tax
ledger, generic VAT report, and posting integration. **Country packs (5B+) are out of
5A scope.**
**Discipline (inherited):** pure-engine-first · additive-only migrations · flags OFF
(`KAKO_TAX`) · multi-tenant RLS + audit · reuse the Phase-1 posting engine · tests +
integration before every merge · one increment per PR.

---

## 1. Milestones (increment-by-increment, dependency order)

> Each milestone is one (or two) PR(s), independently green, flag-gated OFF.

**M0 — Flag + module skeleton**
`KAKO_TAX` flag (default OFF); `src/lib/tax/` package; Phase-5A kickoff notes. No DB.

**M1 — Pure VAT calculation engine** *(no DB — the heart of 5A)*
`computeTax(lines, opts)`: exclusive (`tax = base×rate`), inclusive (`tax =
gross×rate/(1+rate)`), multi-rate via tax groups, zero/exempt/out-of-scope kinds,
per-line vs per-invoice rounding policy. `applyNoteAdjustment(original, delta)` for
credit/debit notes (signed). Pure, exhaustively unit-tested.

**M2 — Effective-dated resolution engine** *(pure)*
`resolveTaxCode(ctx, asOf)` and `resolveRule(...)`: select the code/group/rule whose
effective window contains the **document tax point**; overlap/gap guards. Pure, tested
with as-of scenarios (rate changes, back-dated docs, CN inheriting original tax point).

**M3 — Legal-entity + registration data model** *(additive migration)*
`erp_legal_entities`, `erp_tax_registrations` (effective-dated, multi per entity),
`erp_branches.legal_entity_id` (nullable). **Backfill: one primary legal entity per
company; branches → primary** (additive, idempotent). RLS company+entity; FK-covered.

**M4 — Tax configuration data model** *(additive migration)*
`erp_tax_codes`, `erp_tax_groups` + `erp_tax_group_members`, `erp_tax_rules`,
`erp_product_tax_categories`, `erp_customer_tax_profiles`, `erp_supplier_tax_profiles` —
all effective-dated, company-scoped RLS, FK-covered. No seed (config is per tenant).

**M4b — Document tax profiles + treatment resolution (rev 3, §1A)** *(seed catalog + pure resolver + additive migration)*
`erp_document_tax_profiles` (seed the 12 platform profiles) + `erp_document_tax_treatments`
(cascade Company→Legal Entity→Customer→Document Type, effective-dated) + additive nullable
`document_tax_profile_id` stamp on the sales/AR/note document tables. Pure
`resolveDocumentTaxProfile(ctx, asOf)` (most-specific-wins + per-document override) with
exhaustive tests incl. **same-customer-same-day mixed tax/non-tax** scenarios. Feeds M6
(service stamps the profile) and the country packs (which key compliance off the profile).

**M5 — Tax transactions + tax ledger** *(additive migration)*
`erp_tax_document_lines` (computed breakdown per source line) + `erp_tax_ledger`
(legal_entity, registration, period, direction output|input, tax_code, base, tax,
reference_type/id, status). RLS; FK-covered; the returns/reconciliation sub-ledger.

**M6 — Tax service (compute → persist)** *(orchestration over a gateway)*
Loads config (as-of tax point) + resolves codes via M2 + computes via M1 + writes
`erp_tax_document_lines` and `erp_tax_ledger`. Gateway interface (DB-free unit tests) +
thin Supabase impl. Gated by `KAKO_TAX`; idempotent per source document.

**M7 — Posting integration** *(reuse Phase-1 poster; additive seed)*
Seed posting rules: `tax.output` → Dr AR-tax-component / Cr Output VAT; `tax.input` →
Dr Input VAT / Cr AP-tax-component; `tax.adjustment` for CN/DN. New reference types
(`tax_output`, `tax_input`, `tax_adjustment`) — Augment, zero double-post. Orchestrator
mirrors `inventory-gl` / `supplier-invoice-gl` / trade-spend GL. Account keys
(`output_vat`, `input_vat`) resolve per company; poster skips if unmapped.

**M8 — Generic VAT report read-model** *(pure + read service)*
Pure report builder over `erp_tax_ledger`: output − input = net payable, per tax-code
summary, per registration per period. Read service + (optional, inert) dashboard tile.
Country-specific statutory forms are **5C/5D**, not here.

**M9 — End-to-end + multi-company integration tests + 5A readiness checkpoint**
Real-DB e2e: configure codes/registration → invoice tax computed → ledger written →
GL posted under tax reference types → VAT report nets correctly; multi-company RLS
isolation; effective-dated rate-change scenario. Then the 5A readiness checkpoint.

---

## 2. Dependencies
- **Internal (present):** Phase-1 posting engine + `erp_account_map` (add `output_vat` /
  `input_vat` keys per tenant at activation); `erp_audit_logs`; RLS helpers
  (`erp_user_company_id`, `erp_is_platform_owner`); events/jobs-tick; `erp_companies` /
  `erp_branches` / `erp_customers` / `erp_products_catalog`.
- **Sequencing:** M1→M2 pure first; M3 before M4/M5 (entity/registration referenced);
  M6 needs M1–M5; M7 needs M5 + the poster; M8 needs M5; M9 needs all.
- **External:** none for 5A (country connectors/certs are 5B+).
- **Cross-engine:** trade-spend CN/DN (Phase 4) and sales/AP (Phase 1/2) will *feed* the
  tax engine later; 5A does not modify them (additive; wiring is a flagged follow-up).

## 3. Estimated effort
| Milestone | Effort | Risk |
|-----------|--------|------|
| M0 flag/skeleton | XS | low |
| M1 VAT calc engine | **M** | med (rounding/inclusive correctness) |
| M2 effective-dated resolution | S–M | med (as-of edge cases) |
| M3 entity + registration model | M | med (backfill correctness) |
| M4 tax config model | S–M | low (additive) |
| M5 tax txns + ledger | M | med (ledger integrity) |
| M6 tax service | M | med (idempotency) |
| M7 posting integration | S–M | low–med (reuses poster) |
| M8 VAT report read-model | S | low |
| M9 e2e + readiness | M | med |
| M4b document tax profiles + resolution (rev 3) | S–M | med (cascade + mixed-day correctness) |
| **Total 5A** | **~Medium-High** (≈10 increments) | concentrated in M1/M3/M5; +M4b document-profile resolution |

Rough order-of-magnitude: comparable to Phase 2 (Purchasing) in increment count, with
extra care on tax-correctness tests.

## 4. Migration strategy
- **Additive-only**, sequential (next free number after the current head, e.g. `0197+`),
  idempotent (`IF NOT EXISTS` / `NOT EXISTS`-guarded), FK-covering indexes (schema-health
  invariant), RLS company+entity scoped — identical to Phases 1–4.
- **Backfill (M3)** runs inside the migration: insert one `erp_legal_entities` row per
  existing company (primary), set `erp_branches.legal_entity_id` to it. Idempotent;
  re-runnable; no mutation of business data.
- **No changes to existing tables' semantics** — only additive nullable columns
  (`erp_branches.legal_entity_id`) and new tables. Existing invoices remain valid; their
  tax breakdown is computed lazily/on next issue (no destructive backfill of historical tax).
- **Validation:** every migration applied + idempotent-re-applied against the full local
  chain and CI staging-apply before merge (the established gate).

## 5. Rollout plan
1. **Dark ship:** all 5A merges land with `KAKO_TAX` **OFF** — schema inert, no behaviour
   change (same as every prior phase).
2. **Pilot enablement (separate, reviewed change):** on one pilot tenant — create a legal
   entity + registration, map `output_vat`/`input_vat` account keys, seed tax codes/rules,
   enable `KAKO_TAX` (then `KAKO_FINANCE` for the GL legs).
3. **Verify:** issue a test invoice → tax computed + ledgered → GL posts under tax
   reference types → VAT report nets; reconcile to the VAT control accounts.
4. **Per-tenant rollout**, monitoring the tax ledger vs GL control account.
5. **Rollback = flags OFF** + inert schema (no data mutation); clean additive-drop if ever
   required. Country packs (5B+) gate independently per `KAKO_TAX_<CC>`.

## 6. Test strategy
- **Unit (pure, the bulk):** VAT calc matrix — exclusive/inclusive, single/multi-rate,
  zero/exempt/out-of-scope, rounding (per-line vs per-invoice), CN/DN deltas; effective-
  dated resolution (as-of, rate change, back-dated, overlap/gap guards). Target: exhaustive
  on M1/M2 before any DB.
- **Service tests:** tax service over a fake gateway (compute→persist, idempotency,
  flag-off no-op); posting orchestrator over a fake PostingGateway (both legs, no-partial,
  idempotent, flag-off) — mirrors finance/trade-spend GL tests.
- **Integration (real DB):** migrations apply + idempotent + schema-health (FK + RLS);
  end-to-end configure→invoice→ledger→GL→report; **multi-company RLS isolation**;
  effective-dated rate-change crossing a tax point.
- **Gates:** `tsc` + full unit suite + build + integration green on every PR; integration
  run locally before each merge (established practice). No gate bypasses.
- **Data-integrity invariants asserted:** tax never negative where invalid; inclusive/
  exclusive reconcile (base+tax=gross); ledger output−input ties to GL control accounts;
  no double/partial GL post; tenant isolation; as-of resolution deterministic.

## 7. Exit criteria (5A readiness checkpoint)
All M0–M9 merged, flags OFF, all gates green; e2e proves configure→compute→ledger→GL→
report with multi-company isolation + an effective-dated rate change; migration/rollback
documented; account-key + activation steps written. Then proceed to **5B (Country Pack
Framework)**.

---
*Implementation planning only — no code or migrations are created by this document.*
