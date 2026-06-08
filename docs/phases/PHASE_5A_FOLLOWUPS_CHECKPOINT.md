# VANTORA — Phase 5A Follow-ups Readiness Checkpoint

**Date:** 2026-06-08 · **Status: ✅ Complete — staging-ready behind default-OFF flags.**
The two 5A follow-ups identified in the 5A readiness checkpoint are delivered, completing
the Global Tax Engine Core ahead of country packs. Discipline held: reuse-first ·
additive-only · `KAKO_TAX`/`KAKO_FINANCE` OFF · multi-tenant RLS + auditability ·
integration before merge.

## Delivered
1. **Legal entities + tax registrations** (`0202`, #192) — `erp_legal_entities`
   (taxpayer dimension §3.1) + `erp_tax_registrations` (multiple per entity, effective-
   dated §3.2). Backfilled one **primary legal entity per company**; added
   `erp_branches.legal_entity_id` (backfilled). **Promoted** the placeholder columns to
   real FKs + covering indexes (`erp_tax_ledger`, `erp_document_tax_treatments`,
   `erp_tax_determination_rules`). Company-scoped RLS.
2. **Tax service** (#193) — `assessDocumentTax`: determine (M4c) → compute (M1/M2) →
   persist `erp_tax_document_lines` + output `erp_tax_ledger` → returns the figure the GL
   orchestrator (M5 `postTaxGl`) posts. No-op when flag off; idempotent per document;
   DB-free gateway for tests + thin Supabase impl.

## Verification
- Migration `0202` additive, idempotent, backfill safe, schema-health FK + RLS invariants pass; CI staging-apply green.
- **936 unit + 38 integration tests green**; build clean.
- No behaviour change (flag-OFF); no existing tables' semantics altered.

## State of the Global Tax Engine Core (5A + follow-ups)
Determination → document profile → VAT compute (incl/excl, groups, kinds, CN/DN) →
tax document lines + tax ledger (per legal entity + registration) → GL posting (Augment) →
VAT return — all country-agnostic, multi-tenant, effective-dated, flag-OFF. Country packs
(M6 registry) plug in next.

## Next
**5B — country-pack hardening:** `erp_tax_submissions` lifecycle table + pure submission
state machine (draft→generated→signed→submitted→cleared|rejected) + retry handling, on
the M6 registry. Then 5C Egypt ETA → 5D Saudi ZATCA → 5E GCC.

## Stop-conditions
None. No architectural blocker.
