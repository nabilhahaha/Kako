# Phase 8D — Rule Engine: Pre-Implementation Design Brief

**Status:** Design review first. **No implementation** until approved. Reuse-first · additive ·
multi-tenant RLS · governance + audit · flag default OFF (`KAKO_RULE_ENGINE`).

## 1. Architecture & intent
A **no-code condition→action rule layer** that generalizes the determination patterns the
platform already implements per-domain into one configurable engine. Today rules live as
**domain-specific tables**: `erp_tax_determination_rules` (0200), `erp_commission_rules` (0218),
`erp_price_rules`/`erp_pricing_rules` (0221), and the MDG change-governance
(`erp_mdg_change_requests`/`erp_mdg_audit_log`, 0225). 8D does **not** replace these proven
engines — it adds a **generic rule builder** for *new* cross-cutting policies (e.g. "flag an order
when discount > X AND channel = wholesale", "auto-assign a task when credit-utilization > 90%").

## 2. Reuse vs net-new
- **Reuse:** the workflow engine's `condition` step + `condition-eval` (already a pure predicate
  evaluator), trigger/event foundation (0176/0184), and the existing determination tables as
  reference patterns. The pure `condition-eval.ts` is the rule predicate core.
- **Net-new:** a generic **rule definition** store + a **priority/most-specific-match resolver**
  (the same "most-specific wins" pattern used by perfect-store scorecards and tax determination),
  + a builder UI.

## 3. Data model (additive)
- `erp_rule_sets` (`company_id, code, name, domain, is_active`) and `erp_rules`
  (`rule_set_id, company_id, priority, conditions jsonb, actions jsonb, effective_from/to,
  is_active`). Company-scoped RLS; FK-covering indexes. Actions reference existing effects
  (raise task / notify / set flag / require approval) — **no new side-effect transport**.
- Rule evaluation is logged (audit) with the matched rule id for explainability.

## 4. Forms / Field-Governance compatibility
Rule conditions may reference custom fields (`erp_custom_fields`, 0087); rule actions that read/
write fields honor the field-governance layer (0114) — no parallel field-access path.

## 5. Mobile / Offline
Rules evaluate **server-side** (on events/determination), so no mobile authoring and no offline
concern in the initial scope. Authoring is an admin screen (`rule.manage`).

## 6. Audit / Security / Multi-tenant
Every rule create/edit/activate and every match is audited (`erp_log_audit`). Action set is a
**closed allow-list** (no arbitrary code/HTTP from a rule — that stays in the workflow `api_call`
step under egress allow-listing). Company-scoped RLS; one tenant's rules never see/affect another.

## 7. Integration
Binds to the existing event foundation as triggers; emits via the existing dispatcher/
notifications. No new transport.

## 8. Phasing / Risks / Non-goals
- **8D-1** rule store + pure resolver (engine-first, unit-tested). **8D-2** builder UI. **8D-3**
  bind to 1–2 high-value triggers as reference.
- **Risk:** scope overlap with pricing/tax/commission engines → 8D is for *new generic* policies,
  not reimplementing those (documented guardrail). **Risk:** action allow-list creep → keep closed.
- **Non-goals:** not a replacement for tax/pricing/commission determination; no arbitrary code
  execution; no new outbound transport.

**Recommendation:** proceed engine-first behind `KAKO_RULE_ENGINE` (OFF); highest reuse is the
pure `condition-eval` predicate core + the most-specific-match resolver pattern. Await approval.
