# Universal Change Request Engine — pilot readiness package

**Audience:** product/platform owner · **Status:** for review **before** any pilot activation
**Decision requested:** Go / No-Go for a pilot (in a dedicated environment). **Nothing is enabled.**

> The engine is fully built, tested, and merged to `main`, **OFF by default**. No company,
> tenant, or production-facing feature has been turned on. This package is the evidence
> you asked for before approving a pilot.

---

## 1. Summary of the completed engine

A **reusable, metadata-driven platform capability** that lets any master-data entity be
changed through a governed, approved, audited request flow — **without engine code per
entity**. New entities are added by *registering metadata* (a row + an allowlist entry +
a default workflow), proven by adding Products, Suppliers, and Routes with zero engine
changes. It is built entirely on existing platform subsystems (workflow engine, event
bus, Dynamic Field Governance, audit, notifications, permissions, attachments) — reuse,
not reinvention.

Capabilities delivered: generic + configurable + multi-level + company-specific approvals;
field-level change tracking with before/after audit; effective dating; single and bulk
requests; document attachments with classification; external approval hooks; full audit;
RBAC via existing permissions; tenant isolation via RLS.

---

## 2. Implemented phases & PRs

| Phase | Scope | PR | Migration |
|---|---|---|---|
| 0 | Design (signed off) | #281 | — |
| 1 | Registry & metadata foundation | #282 | 0252 |
| 2 | Lifecycle — submit, validation, DFG, audit | #283 | 0253 |
| 3 | Workflow & approvals | #284 | 0254 |
| 4 | Generic apply / execution layer | #285 | 0255 |
| 5 | Attachments (doc_type + registry) | #286 | 0256 |
| 6 | Effective dating (due-sweep cron) | #287 | 0257 |
| 7 | Bulk change requests | #288 | — |
| 8 | External approval hooks (verified seam) | #289 | 0258 |
| 9 | Generic read UI (list + detail) | #290 | — |
| 11 | More entities (product/supplier/route) | #291 | 0259 |
| 12 | Pilot enablement guide | #292 | — |
| 10 | Customer absorption | — | **deferred (post-pilot)** |

All merged green. Migrations `0252`–`0259` are additive and reversible (manual rollback noted in each).

---

## 3. Feature flags & default states

| Flag / secret | Purpose | Default / state |
|---|---|---|
| `KAKO_CHANGE_REQUESTS` | Master switch — submit, UI, due-sweep, callback | **OFF (unset)** |
| `CRON_SECRET` | Authorizes the due-sweep + callback internal routes | Already configured (platform) |
| `CR_APPROVAL_SECRET` | HMAC secret for external approval callbacks | Unset (only needed if external approvals used) |
| Service-role key | Due-sweep applies via service client | Already configured (platform) |

The engine is **inert** while `KAKO_CHANGE_REQUESTS` is unset: every surface returns
`notFound()`/`disabled`, and the cron is a no-op. No other module's behavior changes.

---

## 4. Registered entities

| Entity | Target table | Create perm | Approval (default) | Notable allowed fields |
|---|---|---|---|---|
| `customer` | `erp_customers` | `customers.manage` | `customers.approve` | cr_number, tax_number, credit_limit, channel/segment/classification, payment_terms_days |
| `product` | `erp_products_catalog` | `product.create` | manager role | name, barcode, category, unit, cost_price, sell_price, min_stock, tax_rate |
| `supplier` | `erp_suppliers` | `suppliers.manage` | manager role | name, phone, email, address, city, tax_number |
| `route` | `erp_routes` | `route.create` | manager role | name, rep_id, van_warehouse_id, visit_day |

All seeded as **global** metadata (readable by every tenant). Vehicles/Salesmen have no
master table yet; a future module/pack registers them the same way (metadata only).
Each entity has an explicit **allowed-field whitelist** (so a request can never propose
`id`/`company_id`/system columns) and declarative validation (e.g. VAT regex, price ≥ 0).

---

## 5. Approval lifecycle overview

```
draft → submitted → pending → approved → (scheduled?) → applying → applied
                         └→ rejected                              ├→ partially_applied
                                                                  └→ failed
```

1. **Submit** (server action) validates: create-permission → apply allowlist → field
   whitelist → **DFG edit access per field** → diff → declarative/named/reference
   validation → persists header/targets/values (before/after) → emits
   `change_request.submitted`.
2. **Approval** runs on the existing workflow engine: one global definition per entity
   (`change_request:{entity}`), selected by a `trigger_config.where:{entity_key}` payload
   filter, with SLA + escalation. Companies override with a company-scoped definition
   (multi-level / different approvers) in the Workflow Builder.
3. On approval the request flips to `approved`; the **due-sweep** then applies it.
4. **Apply** (`erp_change_request_apply`) is entity-agnostic, allowlist-guarded, idempotent,
   per-target with before/after audit, and partial-failure tolerant.

---

## 6. Attachment & document-type handling

- `erp_attachments` gained a **nullable `doc_type`** column (additive; all existing rows
  unaffected) — the primary, queryable document classification.
- Document categories live in the **`erp_change_request_doc_types`** registry (global +
  per-company): cr_copy, vat_certificate, national_address, photo, contract, approval_doc.
- Documents attach to a request via the **existing** generic attachment pipeline
  (no separate media system); authorization is the request's own RLS readability.
- `requiredDocTypesSatisfied` supports a required-document gate for approval.

---

## 7. Effective dating & bulk

- **Effective dating** — a request carries `effective_at`. On approval: immediate → applied
  on the next sweep; future-dated → parked as `scheduled` and applied once due. One
  mechanism for next-month prices, dated route changes, dated transfers.
- **Bulk** — one request, N records, a **shared patch** (`bulk_max` cap). The apply engine
  fans out per target with per-target status + before/after audit and is partial-failure
  tolerant (`partially_applied`). Covers "update 500 customers / mass price change /
  reassign 200 routes." (Per-target overrides exist at the data/apply layer; the bulk
  submit action currently exposes shared-patch only.)

---

## 8. External hooks readiness

- **Inbound seam ready:** `POST /api/internal/change-requests/approvals/callback` verifies
  an **HMAC-SHA256** signature (`CR_APPROVAL_SECRET`, constant-time) over a canonical
  payload, checks the adapter is registered, maps the task to its tenant, and **records**
  the verified decision in `erp_change_request_external_decisions` (tenant-scoped inbox).
- **Adapter registry** + an **email stub** are in place; real ERP/government/API adapters
  are added by registration (no engine change).
- **Limitation (see §12):** auto-driving `erp_workflow_decide` from a recorded external
  decision needs an engine *external-principal* mode — deferred. Today external decisions
  are verified and recorded; an operator/engine step actions them. Not required for a
  pilot that uses in-app approvals.

---

## 9. Generic UI overview

- `/change-requests` — the company's requests (entity, scope, target count, status badge),
  newest first.
- `/change-requests/[id]` — status / reason / effective date / record count, the
  **field-changes table (before → after)**, and **documents** (with doc_type).
- Both flag-gated (`notFound()` when off) and RLS-scoped. **Read-only** today: creating a
  request is via the `submitChangeRequest` / `submitBulkChangeRequest` server actions;
  approvals use the existing workflow task surfaces. A metadata-driven create form +
  in-UI approval actions are the next UI increment (see §12).

---

## 10. Security / RLS summary

- **Tenant isolation:** RLS on every new table (`company_id = erp_user_company_id()` or
  platform owner). Global registry/doc-type rows are read-only to tenants and seeded by
  migrations only. Verified by integration tests (cross-tenant reads return 0 rows).
- **Apply allowlist:** `erp_change_request_apply` only writes tables present in
  `erp_change_request_apply_tables` (migration-seeded) — a tenant can **never** point the
  engine at an arbitrary table, even via a company-scoped entity override. Mirrored by a
  code-side allowlist for submit-time checks (defense in depth).
- **Governance:** no field is written unless the requester had DFG `edit` access and the
  field is in the entity's whitelist; the apply re-resolves target/columns from metadata
  and casts each value to the column's own type, scoped to the request's `company_id`.
- **Privileged functions:** `erp_change_request_apply` / `run_due` are SECURITY DEFINER,
  fixed `search_path`, **REVOKEd from PUBLIC** (invoked by the service-role cron only).
- **Internal routes:** the cron + callback require `CRON_SECRET` / a valid HMAC; both are
  no-ops while the flag is OFF.
- **No existing RLS/auth/permission behavior was changed.** No new permissions were added.

---

## 11. Test coverage & CI summary

- **Pure unit (~35):** flag, apply allowlist, workflow-key resolution, metadata
  parse/coerce, company-over-global pick, validator/adapter registries, state machine,
  diffing, declarative validation (+ named + deferred checks), missing-doc-types, HMAC
  sign/verify/parse.
- **DB integration (9 suites, `TEST_DATABASE_URL`):** submit + tenant RLS; workflow
  approve gates status; apply + before/after audit; idempotency + gating; effective
  dating (scheduled→applied); bulk fan-out + partial failure; attachments (doc_type +
  RLS); external decisions inbox RLS; more-entities (registration + product price change
  end-to-end).
- **CI gates (all green on every PR):** Typecheck & build, Integration tests (DB) — which
  applies every migration and runs a schema-health guard (FK covering indexes,
  no per-row `auth.uid()` in RLS) — Playwright smoke, staging-migration apply. i18n
  parity + keys-usage for the UI strings.

---

## 12. Known limitations (all non-blocking for a pilot)

1. **External auto-decide deferred** — verified external decisions are *recorded*, not yet
   auto-applied to the workflow (needs an engine external-principal mode). In-app
   approvals are fully functional.
2. **Single platform flag (no per-company toggle)** — entities are global, so enabling the
   flag exposes the capability to every tenant in that environment. Pilot in a **dedicated
   environment**, or add a small per-company gate before enabling in a shared one.
3. **Apply latency** — apply runs on the due-sweep (≤ 10 min), not synchronously at the
   moment of approval. Acceptable for master-data; a synchronous approval→apply hook can
   be added later.
4. **UI is read-only** — create + approval actions are via server actions / existing
   workflow surfaces; a metadata-driven create form + in-UI approve is the next increment.
5. **Bulk = shared patch** in the submit action (per-target overrides exist at the
   data/apply layer).
6. **Customer** is registered but the **legacy** customer-approval flow remains
   authoritative for customers until Phase 10 (deferred).

---

## 13. Deferred Phase 10 (customer absorption) — explanation

Per your decision, the live `erp_customer_change_requests` / customer-approval path is
**not** migrated yet. Rationale: do not change a path existing customers use today until
the new engine is proven in a pilot. The legacy flow keeps working, untouched; `customer`
is registered as the reference entity so the engine is ready to absorb it. After a
successful pilot we migrate customers with **dual-read** (both systems readable during
transition), then deprecate the legacy flow — single-engine end-state, no data loss.

---

## 14. Pilot activation steps (for when you approve — not done yet)

1. Choose a **dedicated pilot environment** (one tenant).
2. Set `KAKO_CHANGE_REQUESTS=1`; confirm `CRON_SECRET` is set; set `CR_APPROVAL_SECRET`
   only if external approvals are in scope. Redeploy.
3. Confirm pilot users hold the create permissions in §4 and that an approver holds the
   manager role / `customers.approve`.
4. Run the **validation checklist** in `CHANGE-REQUEST-PILOT-ENABLEMENT.md` §3.
5. Sign off only when every check passes.

No tenant/company toggle is flipped without your explicit approval.

---

## 15. Rollback plan

- **Stop everything instantly:** unset `KAKO_CHANGE_REQUESTS` and redeploy → submit, UI,
  due-sweep, and callback all go inert; in-flight `approved`/`scheduled` requests pause
  (resume if re-enabled). Non-destructive.
- **Undo an applied change:** apply writes through the same governed path as a normal
  edit — reverse with a normal edit or a compensating request. **Never delete audit rows.**
- **Remove an entity:** delete its `erp_change_request_apply_tables` row and/or deactivate
  its `erp_change_request_entities` row — the engine refuses to apply to it thereafter.
- **Schema:** each migration `0252`–`0259` carries a manual rollback note; all are additive.
- The legacy customer flow is independent and unaffected throughout.

---

## 16. Monitoring checklist (during pilot)

- [ ] **Queue:** `/change-requests` — no requests stuck in `submitted`/`pending` (stalled
      approvals) or `scheduled` past their date.
- [ ] **Apply outcomes:** alert on `failed` / `partially_applied`; inspect
      `erp_change_request_targets.error`.
- [ ] **Audit:** every apply writes a `change_request.apply` row with before/after — spot
      check applied changes match approvals.
- [ ] **Sweep:** a rising backlog of `approved` requests ⇒ cron not running (check
      `CRON_SECRET` / schedule).
- [ ] **SLA:** overdue approval tasks escalate to manager (existing `erp_workflow_tick`).
- [ ] **External (if used):** `erp_change_request_external_decisions` inbox; investigate
      signature rejections in route logs.
- [ ] **Integrity:** confirm no writes outside the apply allowlist (impossible by
      construction; verify in audit).

---

## 17. Go / No-Go checklist

| Item | State |
|---|---|
| Engine code complete & merged to `main` | ✅ |
| All phases CI-green (build, DB integration, schema-health, staging migrations) | ✅ |
| `KAKO_CHANGE_REQUESTS` OFF by default; engine inert | ✅ |
| No tenant / company / production feature enabled | ✅ |
| Migrations additive + reversible; no destructive changes | ✅ |
| RLS on all new tables; no existing RLS/auth/permission changed | ✅ |
| Apply allowlist enforced (no arbitrary-table writes) | ✅ |
| Registered entities verified (customer/product/supplier/route) | ✅ |
| Attachments / effective dating / bulk / external seam tested | ✅ |
| Pilot enablement guide + this readiness package available | ✅ |
| Known limitations reviewed & accepted | ⬜ **owner** |
| Pilot environment + tenant selected | ⬜ **owner** |
| **GO decision to activate the pilot** | ⬜ **owner approval required** |

**Recommendation:** technically **GO** for a pilot in a dedicated environment. The three
owner rows above are the only open items — none are code blockers. Activation awaits your
explicit approval; **no tenant will be enabled until you say so.**
