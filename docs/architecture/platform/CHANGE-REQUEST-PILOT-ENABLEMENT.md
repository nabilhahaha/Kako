# Change Request engine — pilot enablement guide

How to safely turn the universal Change Request engine on for a **pilot**, validate
it end-to-end, monitor it, and roll back if needed. The engine (design:
`CHANGE-REQUEST-ENGINE-DESIGN.md`) ships **OFF by default** behind
`KAKO_CHANGE_REQUESTS`; no tenant uses it until you enable the flag.

> **Approval gate:** Do **not** enable in any shared/production environment until
> the pilot is explicitly approved. The legacy customer-approval flow is untouched
> and keeps working regardless (its absorption — Phase 10 — is deferred until the
> engine is proven here).

---

## 0. Enablement model (read first)

Unlike Van Sales (platform flag **+** per-company toggle), the Change Request engine
today has **one switch**: the platform flag `KAKO_CHANGE_REQUESTS`. Governed entities
are seeded as **global** metadata (`customer`, `product`, `supplier`, `route`), so when
the flag is ON the capability is available to **every** tenant that has those entities.

Implications for a controlled pilot:

- **Preferred:** enable in a **dedicated pilot/staging environment** (one tenant), not
  in the shared production environment.
- The engine is **behaviorally inert** until users actually submit requests — turning
  the flag on does not change any existing record by itself.
- If you need to scope the capability to a single tenant **inside** a shared
  environment, add a per-company enablement gate (a small follow-up, mirroring
  `erp_van_sales_settings.is_enabled`) before enabling there. This guide assumes the
  dedicated-environment approach.

---

## 1. Environment configuration

In the pilot environment set:

| Variable | Purpose | Required |
|---|---|---|
| `KAKO_CHANGE_REQUESTS=1` | Master switch — exposes submit, the `/change-requests` UI, the due-sweep, and the external callback | **Yes** |
| `CRON_SECRET` | Authorizes the due-sweep + external callback internal routes | **Yes** |
| `CR_APPROVAL_SECRET` | HMAC secret for the external approval callback | Only if using external approvals |
| service-role key (already configured) | The due-sweep applies via the service client | Already set |

The due-sweep cron (`/api/internal/change-request-tick`, every 10 min) is already in
`vercel.json`; it is a **no-op while the flag is OFF** and starts applying approved /
due requests once ON.

Redeploy so the flags take effect.

---

## 2. Roles & metadata (already in place)

No per-tenant setup is required — the entities are seeded globally. Confirm the pilot
users hold the **existing** permissions each entity's request path uses:

| Entity | Create permission | Approval (default workflow) |
|---|---|---|
| Customer | `customers.manage` | `customers.approve` |
| Product | `product.create` | Manager role |
| Supplier | `suppliers.manage` | Manager role |
| Route | `route.create` | Manager role |

A company may **customise** any entity's approval chain by publishing a company-scoped
workflow definition with the same key (`change_request:{entity}`) in the Workflow
Builder — multi-level or different approvers — overriding the global default.

---

## 3. Pre-go-live validation checklist

Run as the pilot users; mirrors the CI integration suites.

- [ ] `KAKO_CHANGE_REQUESTS=1` + `CRON_SECRET` set in the pilot env; redeployed.
- [ ] `/change-requests` renders (flag ON) and lists nothing yet.
- [ ] **Submit (single):** create a customer change request (e.g. `credit_limit`);
      it appears as `submitted`/`pending`, the customer is **unchanged**.
- [ ] **Governance:** a field the requester can't edit (DFG) or one outside the
      entity's `allowed_fields` is rejected.
- [ ] **Validation:** a bad value (e.g. VAT not `3…15 digits`, negative price) is rejected.
- [ ] **Approval:** the approver sees the task; approving flips the request to `approved`.
- [ ] **Apply:** within a sweep interval the change is applied — the record updates,
      status → `applied`, and the audit log holds the **before/after**.
- [ ] **Bulk:** a shared patch across several records applies to all; a bad target →
      `partially_applied` (good ones applied, bad one `failed`).
- [ ] **Effective dating:** a future-dated approved request parks as `scheduled` and
      applies after its date.
- [ ] **Attachments:** a document with a `doc_type` attaches to a request and is visible.
- [ ] **Other entities:** a product price change and a supplier/route change apply.
- [ ] **External (if used):** a signed callback to `/api/internal/change-requests/approvals/callback`
      is recorded; a bad signature is rejected (401).

Sign off only when every box passes.

---

## 4. Rollback

Non-destructive and fast — applied changes are real master-data writes (audited), but
turning the engine off stops all new activity immediately.

1. **Stop new activity:** unset `KAKO_CHANGE_REQUESTS` (and redeploy). Submit, the UI,
   the due-sweep, and the callback all go inert. In-flight `approved`/`scheduled`
   requests simply stop being applied (they resume if re-enabled).
2. **Undo an applied change:** apply writes through the same governed path as a normal
   edit — reverse it with a normal edit (or a compensating change request). Never delete
   audit rows; the before/after is the record of what changed.
3. **Remove a registered entity (if needed):** delete its `erp_change_request_apply_tables`
   row and/or deactivate its `erp_change_request_entities` row — the engine refuses to
   apply to it thereafter.

The legacy customer-approval flow is independent and unaffected throughout.

---

## 5. Post-enablement monitoring

- **Queue health** — `/change-requests`: watch for requests stuck in `submitted`/`pending`
  (stalled approvals) or `scheduled` (awaiting their date). Workflow SLAs escalate
  overdue approval tasks to the manager (existing `erp_workflow_tick`).
- **Apply outcomes** — alert on `failed` / `partially_applied`: inspect
  `erp_change_request_targets.error` for the per-target reason.
- **Audit** — every apply writes a `change_request.apply` audit row with before/after;
  spot-check that applied changes match approvals.
- **Sweep** — the due-sweep returns the count applied; a persistently rising backlog of
  `approved` requests means the cron isn't running (check `CRON_SECRET` / schedule).
- **External decisions (if used)** — `erp_change_request_external_decisions` is the inbox
  of verified callbacks; investigate signature rejections in the route logs.
- **Integrity** — applied writes are company-scoped and allowlist-constrained; any write
  to an unexpected table is impossible by construction (apply allowlist).

**Escalation:** if an applied change looks wrong or governance/validation is bypassed,
**roll back at the flag (step 1)** and investigate before re-enabling.

---

## Quick reference

| Item | Value |
|---|---|
| Platform flag | `KAKO_CHANGE_REQUESTS` (default OFF) |
| Cron / callback auth | `CRON_SECRET`; external HMAC `CR_APPROVAL_SECRET` |
| Registered entities | customer, product, supplier, route (global metadata) |
| Apply allowlist | `erp_change_request_apply_tables` (migration-seeded) |
| Due-sweep | `/api/internal/change-request-tick` (every 10 min) |
| External callback | `POST /api/internal/change-requests/approvals/callback` |
| UI | `/change-requests`, `/change-requests/[id]` |
| Approval override | company-scoped `change_request:{entity}` in the Workflow Builder |
| Rollback | unset `KAKO_CHANGE_REQUESTS` → engine inert |
