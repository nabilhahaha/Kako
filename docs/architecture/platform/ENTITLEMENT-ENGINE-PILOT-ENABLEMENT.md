# Module & Feature Entitlement Engine — pilot enablement guide

How to safely pilot the entitlement layer, validate it, and roll back. Ships **OFF by
default** behind `KAKO_ENTITLEMENTS`; while OFF (or with no entitlement rows) every
engine and permission behaves exactly as today. See `ENTITLEMENT-ENGINE-DESIGN.md`.

> **Approval gate:** do not enable in a shared/production environment until approved.
> Nothing here enables a tenant. **E8 — applying per-user overrides in login
> resolution — is NOT part of this pilot** (separate, approval-gated milestone).

---

## 0. What's live (E1–E7)

- **Catalog:** `erp_modules` (core + engines: van_sales, change_requests, critical_alerts,
  route_management, trade_spend, merchandising) + `erp_features`.
- **Entitlements:** `erp_company_entitlements` — Platform-Owner-set per-company module
  enablement (+ feature rows, set by Company Admins, capped at the module).
- **Gate:** `hasPermissionWithEntitlement` (= `hasPermission` while OFF) + `isEntitled`.
- **Engine subsumption (fallback-safe):** van_sales / critical_alerts / change_requests
  consult their module entitlement — but only when the flag is ON **and** an entitlement
  row exists; otherwise unchanged.
- **UIs:** Platform-Owner Capability Matrix (`/platform/entitlements`), Company-Admin
  Feature Settings (`/settings/entitlements`), read-only Role Permission summary
  (`/settings/entitlements/summary`).

---

## 1. Environment

| Variable | Purpose | Required |
|---|---|---|
| `KAKO_ENTITLEMENTS=1` | Master switch — the gate, UIs, and engine subsumption | **Yes** |

No other config. Pilot in a **dedicated environment**. With the flag ON but **no
`erp_company_entitlements` rows**, behavior is still unchanged (fallback) — you opt a
company in by adding rows in the capability matrix.

---

## 2. How access is decided (two keys)

A user reaches an engine capability only when **both** hold:
1. **Company entitlement** — the Platform Owner enabled the module for the company
   (and the Company Admin didn't disable the relevant feature).
2. **User permission** — the user's role (and per-user overrides, once E8 lands) grants it.

Core modules (sales, inventory, …) are **never** entitlement-gated — only the optional
engines are. Platform owners / super admins bypass the gate.

---

## 3. Validation checklist

- [ ] `KAKO_ENTITLEMENTS=1` in the pilot env; redeployed.
- [ ] **Fallback:** with no entitlement rows, every engine works exactly as before
      (van_sales / alerts / change_requests unaffected).
- [ ] **Platform Owner:** `/platform/entitlements/[company]` toggles a module → an
      `erp_company_entitlements` row is written + audited (`enable`/`disable`).
- [ ] **Subsumption:** disable `van_sales` for a pilot company → its Van Sales surfaces
      go inert for that company (re-enable → back). Same for `critical_alerts`
      (evaluator skips it) and `change_requests` (submit returns `not_entitled`).
- [ ] **Company Admin:** `/settings/entitlements` toggles a **feature** of an enabled
      module (capped — features of disabled modules don't appear) + audited.
- [ ] **Gate:** a server action using `hasPermissionWithEntitlement` denies an engine
      permission when its module is disabled, and allows it when enabled.
- [ ] **Summary:** `/settings/entitlements/summary` shows roles × permissions with the
      capability-gated ones flagged.
- [ ] **Tenant isolation:** a company sees only its own entitlements; only the platform
      owner can set module-level rows (RLS).

Sign off when every box passes.

---

## 4. Rollback

- **Instant, non-destructive:** unset `KAKO_ENTITLEMENTS` and redeploy → the gate becomes
  a no-op (= `hasPermission`), engine subsumption falls back, and the UIs `notFound()`.
  Existing entitlement rows are retained (inert).
- **Per company:** re-enable a wrongly-disabled module in the capability matrix (audited),
  or delete the company's `erp_company_entitlements` rows to return it to pure fallback.

---

## 5. Monitoring

- **Audit** — every change writes an `erp_audit_logs` row (`entity 'entitlement'` /
  `'entitlement_feature'`, action `enable`/`disable`). Review for unexpected toggles.
- **Access errors** — a spike in `not_entitled` / forbidden from gated actions ⇒ a company
  was disabled for a module its users need; reconcile in the matrix.
- **Engine inertness** — confirm a disabled engine is dark for that company only (others
  unaffected) — the fallback guarantees no cross-company impact.

---

## Quick reference

| Item | Value |
|---|---|
| Flag | `KAKO_ENTITLEMENTS` (default OFF) |
| Owner UI | `/platform/entitlements` (capability matrix) |
| Admin UI | `/settings/entitlements` (feature settings) · `/settings/entitlements/summary` (roles) |
| Tables | `erp_modules`, `erp_features`, `erp_company_entitlements`, `erp_user_permission_overrides` |
| Gate | `hasPermissionWithEntitlement` / `isEntitled` / `entitlementAllows` (= today while OFF) |
| Rollback | unset `KAKO_ENTITLEMENTS` → no-op |
| Not in pilot | **E8** (per-user override login resolution) — separate approval-gated milestone |
