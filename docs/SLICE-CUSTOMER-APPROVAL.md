# Slice — Customer Approval Workflow — Design Review (pilot)

> **Design for approval — decisions locked; no build yet (review-first).** A
> pilot-safe customer approval flow: statuses **Draft · Pending · Approved ·
> Rejected**; Pending/Rejected customers are unusable for sales; **per-company
> configurable** via permissions; **reusable** for updates / credit-limit / master
> data. Grounding showed the generic Workflow & Approval Engine (0088–0090) is
> already here — so this is **wiring + a real status field + gates**, not new
> machinery.

---

## ✅ Locked decisions (owner)
1. **On creation (governance ON):** status = **Pending Approval** (not Draft);
   the `customer_onboarding` workflow auto-starts. *(Draft stays a valid status for
   future save-before-submit, but creation goes straight to Pending.)*
2. **Rejection:** a **reason is mandatory**; **history + comments are kept** (the
   engine's `erp_workflow_tasks`/events already record every submit→decide cycle;
   the latest reason is also mirrored on the customer).
3. **Pending or Rejected ⇒ not usable** for **orders, invoices, route assignment,
   and sales activities** (rep/journey/salesman assignment).
4. **Updates:** **minor** (phone, contact person, notes) save directly; **sensitive**
   (CR, VAT/tax number, credit limit, channel, segment, classification, payment
   terms) go through a **staged change request** — the customer **stays Approved and
   sellable on its current values**; the new values apply **only after approval**
   (reject discards them). Mirrors the existing credit-limit pattern.
5. **Approval model = permission, not role:** add **`customers.approve`**; each
   company grants it (matrix) to whoever approves. No hard-coded approver.
6. **Roadmap (same engine):** Customer Creation · Customer Update · Credit-Limit
   Change · Customer Master-Data Change Requests.

## 1. Grounding — what already exists (≈90%)
- **Engine (0088–0090):** per-company **or** global `erp_workflow_definitions`
  (key+entity), steps, instances (pending/approved/rejected/…), tasks (approver
  company_admin/user/role). RPCs `erp_workflow_start(key,entity,record_id,ctx)` +
  `erp_workflow_decide(task, approve|reject, comment)`; outcome-handler registry.
- **Seeded templates:** `customer_onboarding` (1 step) + `credit_limit_approval`
  (proof of reuse). **Inbox** `/approvals` + `decideTask` already do approve/**reject**.
- **Customer side:** `requestCustomerApproval()` starts the workflow;
  `approveCustomer()` is a legacy super-admin direct button; badges Pending/Active/
  Suspended. **Orders ✅ + invoices ✅ already block on `is_approved=false`.**
- **Gaps:** binary `is_approved` only; new customers default **approved**; **route
  assignment + journey have no gate**; rejection isn't reflected on the customer.

## 2. Smallest pilot-safe design (reuse the engine)
**A. Real status; `is_approved` kept as the gate mirror.** Migration (additive):
- `erp_customers.approval_status TEXT` ∈ {`draft`,`pending`,`approved`,`rejected`}
  default **`approved`** (zero regression); `rejection_reason TEXT` (latest).
- **`is_approved` is maintained as a mirror** (`= approval_status='approved'`)
  wherever status changes → **every existing `is_approved` gate keeps working
  untouched** (orders/invoices). No churn there.

**B. Per-company governance toggle.** `erp_companies.customers_require_approval
BOOLEAN DEFAULT false`:
- **OFF (default = today):** create → `approved`.
- **ON (pilot):** create → **`pending`** + auto `erp_workflow_start('customer_onboarding')`.

**C. Approve / Reject via the existing inbox — gated by `customers.approve`.**
- Reuse `/approvals` + `decideTask`. **Extend the customer outcome handler:**
  approve → `approval_status='approved'`, `is_approved=true`; reject →
  `approval_status='rejected'`, `is_approved=false`, store the (mandatory) comment
  as `rejection_reason`. **Reject requires a non-empty reason** (enforced in
  `decideTask` for customer tasks + UI).
- Replace the per-customer button's `isSuperAdmin` gate with **`customers.approve`**;
  add a **Reject** button. The approvals inbox surfaces customer tasks to holders of
  `customers.approve`. **History** lives in the engine (tasks + events) and is
  viewable per customer via its workflow instance.

**D. Close the missing gates.** Add an approved-status check to
`assignCustomerToRoute()` **and** `setCustomerJourney()` (block route/rep assignment
for non-approved customers). Orders/invoices already gated.

**E. Sensitive-update = staged change request (non-blocking).** On `upsertCustomer`
of an **approved** customer:
- **Minor** fields (phone, contact_person, contact_phone, notes, email, address,
  city, name_ar, visit_day) → saved immediately; status unchanged.
- **Sensitive** fields (cr_number, tax_number, credit_limit, channel_id, segment_id,
  classification_id, payment_terms_days) → **do not touch the live customer.**
  Instead create an **`erp_customer_change_requests`** row holding the proposed
  values (jsonb) and `erp_workflow_start('customer_update','customer',id)`. The
  customer **stays `approved` and fully sellable on its current values.** On
  **approve**, the outcome handler **applies** the staged values to the customer
  (re-validating them) + audits; on **reject**, it **discards** them and stores the
  (mandatory) reason. This mirrors the existing `erp_credit_limit_requests` flow
  (proof the pattern already works on this engine). The customers UI shows a
  "change pending approval" indicator while a request is open.

**F. UI.** 4-state badge (add **Draft**/**Rejected**, show `rejection_reason`);
"Submit for approval" available if a Draft ever occurs; Approve/Reject where
`customers.approve`. Mobile/RTL parity.

**G. Configurable + reusable — no new designer.** The global `customer_onboarding`
+ new `customer_update` definitions work out-of-the-box; a company can add its own
(multi-step, role/permission approver) in `/settings/workflows`. Credit-limit
already reuses the engine; master-data change requests are the same pattern (future).

## 3. Why this is the smallest safe option
No new engine, no new inbox. `is_approved` mirror → existing sales gates untouched.
Default OFF + default `approved` → **zero change for existing tenants**; the pilot
flips one company flag. The staged sensitive-update **reuses the credit-limit
request pattern** (a tiny generalization), so active customers are never disrupted.
Net: **one migration** (status/reason/company-flag + `customers.approve` seed +
`customer_update` template + `erp_customer_change_requests`), **one outcome-handler
extension** (creation approve/reject + change-request apply/discard), **two gate
additions** (route + journey), **a sensitive-field diff in upsert**, and **UI**.
~1 reviewed slice.

## 4. Build plan (on approval) — all decisions locked
- **Migration** (additive, held from prod): on `erp_customers` add
  `approval_status` (default `approved`) + `rejection_reason`; on `erp_companies`
  add `customers_require_approval` (default `false`); **new `erp_customer_change_requests`**
  (id, company_id, customer_id, `changes` jsonb, status, requested_by, decided_*,
  RLS); keep `is_approved` as the maintained mirror; seed `customers.approve` into
  `erp_role_permissions` (admin/manager — companies grant the rest via the matrix);
  seed the global `customer_update` workflow definition. Backfill existing → `approved`.
- **App:** `upsertCustomer` — governance-aware **create → Pending** + auto-start
  workflow; **minor vs sensitive diff** → sensitive becomes a staged
  `customer_change_request` (customer untouched). **Outcome handler:** creation
  approve→`approved`/reject→`rejected`(+reason); change-request approve→**apply**
  staged values (re-validated)/reject→**discard**(+reason). `decideTask` requires a
  reason on reject for customer tasks. **Gates:** add approved-check to
  `assignCustomerToRoute` + `setCustomerJourney`. **Permission:** `customers.approve`
  replaces the super-admin gate (per-customer Approve/Reject + inbox). **UI:** 4-state
  badge + Rejected reason + "change pending approval" indicator + history (from the
  workflow instance/events). TS `permissions.ts` adds `customers.approve`.
- **Tests:** integration (DB) — governance ON: create→**pending** (not sellable/
  assignable) → approve→sellable; reject(with reason)→**rejected**+blocked, reason
  in history; **sensitive update** on approved → customer **stays sellable on old
  values**, change-request pending → approve→new values applied / reject→discarded;
  **minor update**→saved immediately; governance OFF→`approved` (today). Unit:
  sensitive-field set + mirror. `tsc`/build.

*(Design fully locked — no build yet. On your go-ahead I build this single slice
with rolled-back-live + integration tests, held from production. Engine reuse means
Customer Update / Credit-Limit / Master-Data change requests plug in later with no
rework — exactly your roadmap.)*
