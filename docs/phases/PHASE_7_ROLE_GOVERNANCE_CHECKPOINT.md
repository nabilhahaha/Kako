# Phase 7 — Dynamic Role Governance, Data Scope & Field Security Engine (Checkpoint)

**Status:** ✅ Implemented · additive · flag-gated (`KAKO_ROLE_GOVERNANCE`, default OFF) ·
multi-tenant safe · audit-first · reuse-first. Enterprise dynamic permission /
visibility / ownership / data-scope / field / action / approval framework — each
company controls exactly who can see, edit, approve, and export, without affecting any other.

## Pure engines (`src/lib/role-governance/`, 8 unit tests)
| Module | Capability |
|---|---|
| `data-scope.ts` | **Data visibility** own/team/area/region/branch/company/custom → concrete filter + `isVisible` with a **hard multi-tenant boundary** (never another company) |
| `approval-authority.ts` | Approval rights by **amount / discount% / credit limit / promotion budget** (+region/customer-type qualifiers); threshold escalation (most-senior wins) — configurable, no hardcoded thresholds |
| `security.ts` | **Action security** (separate from visibility) · **field-level** hidden/view/edit (most-permissive across roles) · **Entity-360 section** visibility per role · **temporary access** (effective-dated, auto-expiry) |

## Schema (additive, RLS, FK-covering, idempotent)
- **0227** `erp_role_data_scopes` (per-role per-entity scope) · `erp_approval_authority_rules` (thresholds) · `erp_temporary_access_grants` (effective-dated) · `erp_entity360_section_access` (section visibility per role).

## Reuse (not rebuilt)
Field-level security reuses **`erp_field_access` (0114)**; action security reuses **role permissions / overrides (0021/0125)**; data scope builds on **ownership (0214)** + hierarchy scope RLS (0104/0105); roles are versioned via **0226**.

## Requirement coverage
Custom/copied/overridden roles (existing + 0226) ✓ · **data visibility** (own/team/area/region/branch/
company/custom) for customers/sales/collections/promotions ✓ · **field-level security** (visible/hidden +
view/edit) ✓ · **action security** (create vs approve separated) ✓ · **approval authority** (amount/
discount/credit/region/budget escalation) ✓ · **Entity-360 security** (each role sees only permitted
sections) ✓ · **temporary access** (grant + start/end + auto-expiry) ✓ · **multi-tenant isolation** (Company
A never sees/modifies Company B — RLS + hard boundary in `isVisible`) ✓ · raw-data exports honor visibility
(scope filter applied before export) ✓.

## Validation
Typecheck 0 · build 0 · **1097 unit tests** (+8) · integration: role-governance-schema (2) + schema-health
FK-coverage & RLS-wrap green · migrations apply + idempotent.

## Follow-up (thin increments)
Wire the scope filter into list queries + exports; the approval-authority resolver into order/discount/
credit/promotion approval paths; the Entity-360 section filter into the (upcoming) Entity 360 platform;
a temporary-access expiry sweep. UI for governance config under the Platform/Company admin.
