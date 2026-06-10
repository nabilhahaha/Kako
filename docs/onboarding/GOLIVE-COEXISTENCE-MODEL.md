# VANTORA — Go-Live (Coexistence Model): keep the demo, add the real customer

**Decision (2026-06-10):** keep **`Nile FMCG (DEMO)`** as a **permanent reference/demo tenant** and
provision the first real customer as a **second, fully isolated tenant** on the same project. **No demo
deletion.** Supersedes the demo-cleanup approach. **Env:** `vantora-staging` (`rsjvgehvastmawzwnqcs`).
**`kako-fmcg` untouched.**

---

## Why this works

VANTORA is **multi-tenant by design**:
- **RLS isolation** — every query is scoped by the user's `erp_user_branches` → company. Demo users see
  only the demo; the real customer's users see only their company. The platform owner sees both.
- **Tenant-scoped document numbering** (migration `0268`) — invoice/collection/return/PO/transfer numbers
  are unique **per branch**, so two tenants can both have `INV-CAI-000001` without collision (already proven
  with two coexisting tenants).
- **Per-tenant role permissions** — `erp_user_has_permission` prefers each company's
  `erp_company_role_permissions`, so tenants can have different role behavior on the same global schema.

So adding a customer is **purely additive** — nothing about the demo changes, and there is no destructive
step to gate.

## What changed vs the earlier plan

| Earlier (cleanup) | Now (coexistence) |
|---|---|
| Wipe the demo tenant (Phase 1, PITR-gated) | **Keep** the demo; **add** a 2nd tenant — no wipe, no gate |
| `golive-demo-cleanup.sql` | **superseded** (kept for reference; won't run after the demo rename) |
| Single production tenant | Demo + real customer side by side, RLS-isolated |

The demo company was renamed **`Nile FMCG Distribution Group` → `Nile FMCG (DEMO)`** so it's unmistakable
in the company switcher.

## One required step per new FMCG tenant

The four refined roles (`merchandiser`, `cash_van`, `collection_officer`, `credit_controller`) have **no
global permission defaults** — they only function via **company-scoped** grants. So each new FMCG tenant
**must** seed those permissions, or users with those roles get nothing. This is automated by
`supabase/pilot/new-tenant-bootstrap.sql` (the system roles `salesman`/`cashier`/`accountant`/… work from
global defaults and need no seeding). The cash-van credit-guard trigger is a **global** object already
present — it applies to any tenant's `cash_van` users automatically.

## Revised go-live sequence

| Phase | Action | Artifact |
|---|---|---|
| 0 | Confirm a backup/restore option exists (good practice; **no destructive gate**) | dashboard |
| 1 | **Bootstrap the real tenant** (empty FMCG shell + settings + refined-role perms) | `supabase/pilot/new-tenant-bootstrap.sql` (edit name/ar/currency/country) |
| 2 | Import real master data **into the new tenant** (branches → warehouses → products → suppliers → routes → customers → opening stock) | `docs/onboarding/templates/*.csv` |
| 3 | Invite real users into the new tenant; assign refined roles (+ van/route) | `07-users.csv`, User Onboarding Guide |
| 4 | Public frontend (prod env vars, domain, disable SSO); serves both tenants | `GOLIVE-VANTORA-STAGING-AS-PROD.md` §4 |
| 5 | Verify: role assertions + sell→collect dry-run **scoped to the new tenant**; demo still isolated | `GO-LIVE-CHECKLIST.md` |

"Empty shell first" (chosen): Phase 1 creates the company + settings + roles now; Phases 2–3 load real
data and users when ready — a staged start.

## Rollback (per tenant, non-destructive to the demo)

- **New tenant gone wrong:** delete just that company (`DELETE FROM erp_companies WHERE id = <new>` cascades
  its data) — the demo and globals are untouched. Or restore from the scheduled backup.
- **Demo:** never deleted in this model; reproducible from `reference-company.sql` if ever needed.

## Guardrails

- `kako-fmcg` untouched. Demo retained. New tenant is RLS-isolated. No schema/global changes — only an
  additive company + its scoped role permissions. Real-customer provisioning proceeds **only** with the
  customer's details and your go-ahead.
