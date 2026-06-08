# VANTORA — Phase 5A (Global Tax Engine Core) Readiness Checkpoint

**Date:** 2026-06-08 · **Status: ✅ Phase 5A complete — staging-ready behind default-OFF
flags.** Built against the approved frozen baseline
`docs/architecture/platform/PHASE_5_GLOBAL_TAX_EINVOICING_PROPOSAL.md`. Discipline held:
reuse-first · pure-engine-first · additive-only migrations · `KAKO_TAX` (+ `KAKO_FINANCE`
for GL) default-OFF · multi-tenant RLS + company overrides + auditability · tests +
integration before every merge.

## 1. Milestones delivered
| # | Milestone | PR | Migration |
|---|-----------|----|-----------|
| M1 | Core VAT calculation engine (excl/incl, kinds, rounding, CN/DN) | #183 | — |
| M2 | Tax groups / multi-rate (compound + non-compound) | #184 | — |
| M3 | Tax ledger + VAT-return report builder | #185 | `0197` |
| M4a | Document tax profile catalog (12 seeded) | #186 | `0198` |
| M4b | Document-level taxation cascade + document stamp | #187 | `0199` |
| M4c | Tax determination rules engine | #188 | `0200` |
| M5 | GL posting integration (reuse Phase-1 poster) | #189 | `0201` |
| M6 | Country pack framework foundation | #190 | — |

## 2. What the core now does (end to end, behind flags)
`determineTax(ctx, asOf)` (M4c) / document cascade (M4b) → **document tax profile** (M4a)
→ `computeTax` / `computeGroupedTax` (M1/M2) → **tax document lines + tax ledger** (M3)
→ `postTaxGl` (M5) posts Output/Input/Adjustment VAT via the **Phase-1 poster** under
distinct reference types → `buildVatReturn` (M3) nets output−input per registration/period
→ a **country pack** (M6 registry) will serialize/submit (5C+). Country-agnostic core;
packs plug in.

## 3. Data model (additive)
`0197` tax document lines + tax ledger · `0198` document tax profile catalog (12) ·
`0199` document tax treatments (cascade) + `erp_invoices.document_tax_profile_id` ·
`0200` tax determination rules · `0201` tax posting rules (seed). All idempotent,
FK-covered, company-RLS; schema-health FK + RLS invariants pass; CI staging-apply green.
`legal_entity_id` / `registration_id` are nullable placeholders until the entity model is
built (a later 5A-followup), per the roadmap.

## 4. Baseline requirements coverage
- **Multi-tenant:** all `erp_tax_*` company-scoped RLS; platform/pack defaults
  (`company_id NULL`) overridden per company (codes/profiles/determination rules).
- **Effective-dated:** determination rules + document treatments resolve **as-of the
  document tax point**; rate/rule changes are new rows, history untouched (tested).
- **Document-level taxation:** profile per document, mixed tax/non-tax same customer
  same day with no conflict (tested).
- **Determination engine:** deterministic most-specific-wins + explainable trace; KSA/
  Egypt/UAE examples tested.
- **Pack versioning:** registry resolves highest applicable semver as-of mandate date;
  capability negotiation (tested).
- **Augment GL:** tax posts under its own reference types — zero overlap with
  sales/AR/COGS/AP; idempotent; never partial.

## 5. Data-integrity invariants (tested)
Inclusive/exclusive reconcile (base+tax=gross); zero/exempt/out-of-scope/reverse-charge
carry correct (often zero) tax; multi-rate net counted once; rounding policies; signed
CN/DN; determination deterministic; cascade most-specific-wins; ledger output−input nets;
GL idempotent + no-partial; tenant isolation. **930 unit + 38 integration tests green;
build clean.**

## 6. Activation plan (post-5A, separate reviewed change)
1. Map account keys `output_vat` / `input_vat` (+ existing `ar`/`ap`) in `erp_account_map`.
2. Seed per-tenant tax codes + determination rules (or adopt pack defaults).
3. Enable `KAKO_TAX` (then `KAKO_FINANCE` for GL legs) on a pilot tenant.
4. Issue a document → determination picks the profile → tax computed + ledgered → GL
   posts under tax reference types → VAT return nets; reconcile to VAT control accounts.
5. Rollback = flags OFF + inert schema; no data mutation.

## 7. Follow-ups before/with country packs (5B+)
- **Legal-entity + registration model** (`erp_legal_entities` / `erp_tax_registrations`
  + backfill primary entity; promote the ledger's nullable columns to FKs) — a small
  additive milestone, per the roadmap.
- **Tax service (compute→persist) wiring** into the live invoice/bill issue paths
  (engines + ledger + posting exist; the orchestration that calls them on document
  finalize is the next additive step, flag-OFF).
- **Generic VAT report read service / dashboard tile** (builder exists).
- Then **5B pack framework hardening → 5C Egypt ETA → 5D Saudi ZATCA → 5E GCC**.

## 8. Stop-conditions
None encountered. No data-integrity, security, irreversible-migration, or architectural
blocker. All new behaviour additive + flag-OFF; no existing behaviour changed.

**Conclusion:** Phase 5A (Global Tax Engine Core) is **complete and staging-ready behind
default-OFF flags**, fully on the approved baseline, reusing the Phase-1 posting engine
and the established additive/RLS/test discipline. Ready to proceed to the entity-model
follow-up + tax-service wiring, then the country packs (5C+), on greenlight.
