# Requests Module — Foundation Proposal (Business Trip · Expense · Leave)

An extensible **Requests** module with an approval workflow, integrated with
**Calendar**, **Notifications**, and **Tasks**. Design only — **no migration
applied, no screens built** until approved.

MVP request types (extensible): **Business Trip**, **Expense**, **Leave**.
Sidebar item: **Requests** (added now as a stub). Later screens: All Requests ·
Business Trips · Expenses · Leave Requests · Pending Approvals · My Requests.

---

## Migration plan (answering "should 0005 include all this?")
`0005` is **already applied** (admin-writes + agent scope), so it can't hold
this. Recommended split for reviewability (each validated locally on PG16, then
on Roshen):

- **`0006_workspace_foundation.sql`** — shared infra used by both Tasks and
  Requests: `notification`, `calendar_event` (optional), and the task tables
  (`task`, `task_visibility`, `task_comment`, `task_activity`) + enums + RLS.
- **`0007_requests.sql`** — `request`, `request_approval`, `request_attachment`,
  `business_trip_request_detail`, `expense_request_detail`,
  `leave_request_detail` + enums + RLS.

This keeps shared infra (notifications/calendar) in one place and the Requests
domain in another. If you'd rather ship one big migration, I can combine them
into `0006` — but two smaller, independently-reviewable migrations is safer.

## Generic request model
**Enums:** `request_type (business_trip|expense|leave)`,
`request_status (draft|submitted|pending_approval|approved|rejected|cancelled|completed|closed)`,
`travel_type (domestic|international)`,
`transportation_type (flight|car|train|other)`,
`expense_category (travel|hotel|meals|fuel|parking|customer_meeting|office_admin|other)`,
`leave_type (annual|sick|emergency|unpaid|other)`.

**`request`** (common envelope)
`id, company_id, request_type, title, requested_by, assigned_approver, status,
priority?, related_area_id?, related_branch_id?, related_agent_id?,
submitted_at?, decided_by?, decided_at?, approval_comment?, created_at, updated_at`.

**`request_approval`** (audit of each decision)
`id, request_id, actor_id, action, from_status, to_status, comment, created_at`.

**`request_attachment`**
`id, request_id, kind (invitation|agenda|quotation|receipt|ticket|hotel|other),
storage_path, filename, uploaded_by, created_at`. (Storage wired later.)

**Type-specific detail tables (1:1 with `request`):**
- `business_trip_request_detail` — `request_id, traveler_name, traveler_role,
  purpose, justification, from_city, to_city, country, start_date, end_date,
  num_days, travel_type, transportation_type, hotel_required, accommodation,
  est_flight, est_hotel, est_transport, est_per_diem, est_other,
  total_estimated, currency('SAR')`; post-trip/actuals fields added later
  (actual_* + trip report).
- `expense_request_detail` — `request_id, category, expense_date, amount,
  currency('SAR'), description, related_trip_request_id?`.
- `leave_request_detail` — `request_id, leave_type, start_date, end_date,
  num_days, reason?, cover_person_id?`.

## Approval flow (MVP, configurable later)
Set `assigned_approver` on submit based on requester role:
- Area Manager → Company Manager
- Company Manager → Admin/Director (placeholder)
- Admin → Company Manager

Each decision writes a `request_approval` row (from/to status + comment) and
flips `request.status`. A future approval matrix table can replace the hardcoded
routing.

## RLS / visibility
Helper `can_see_request(r)`:
```
is_admin()
or r.requested_by = auth.uid()
or r.assigned_approver = auth.uid()
or is_global()                          -- company manager sees all
or r.related_area_id in (select my_area_ids())   -- area manager scope
```
- **SELECT**: `using (can_see_request(request))`; detail/approval/attachment rows
  visible iff the parent request is visible.
- **INSERT**: `requested_by = auth.uid()` (anyone active can create their own).
- **UPDATE**: creator may edit while `draft`; approver/company_manager/admin may
  decide (status transitions) — enforced in server actions + `with check`.

## Calendar integration
Business trips (start/end) and leave (start/end) and tasks (due) feed the
calendar. MVP derives calendar entries from `request` (trip/leave dates) +
`task.due_date` via a query/view — no per-event rows required. The optional
`calendar_event` table (in `0006`) is for custom events not tied to a task/request.
Calendar filters: my/team, pending/approved, by area/branch/employee; status color.

## Notifications
Reuse the shared `notification` table (`0006`). Triggers per request type:
- Trip: submitted, approval required, approved, rejected, cancelled, starting
  soon, trip-report required, expense/receipt reminder.
- Expense: submitted, approval required, approved, rejected, missing receipt,
  paid/reimbursed (later).
- Leave: submitted, approval required, approved, rejected, starting soon.
Notifications are created only for users allowed to see the request (visibility
resolved at creation) and each user sees only their own (`user_id = auth.uid()`).

## Task integration
On trip **approval**, optionally auto-create follow-up `task`s (Book flight,
Book hotel, Prepare agenda, Submit trip report, Submit expenses) assigned to the
traveler, linked via `task.related_*` / a `request_id` reference.

## Sidebar (updated plan)
Home · Workspace · **Calendar** · **Requests** · Organization · Agents · Raw
Data Upload · Mapping Profiles · Import Batches · SLA Targets · SLA Report ·
Users & Scopes · Settings. (Calendar + Requests added now as stubs; notifications
remain the top-bar bell.)

---

# Expense Request workflow (approved scope — build with 0007)

Expense Request is a **first-class request type** delivered alongside Business
Trip and Leave when the Requests module (0007) starts. It supports **multiple
expense lines per request, each with its own receipt/proof attachment**.

> Status: captured for the 0007 plan. **Not started** — Requests begins only
> after the Workspace/Tasks foundation is complete and explicitly approved.

## 1. Header fields (`request` + `expense_request_detail`)
Request title · requested_by · request_date · related_region? · related_city? ·
related_distributor (agent)? · related_business_trip (request_id)? · total_amount ·
currency (default `SAR`) · status.

**Status set (expense):** `draft · submitted · pending_approval · approved ·
rejected · cancelled · paid · closed`. (Extends the base `request_status` enum
additively with `paid` and `closed`.)

## 2. Expense lines (`expense_line`, 1 request → many lines)
`id, request_id, category(enum), expense_date, amount, currency('SAR'),
description, merchant?, vat_amount?, payment_method?, receipt_required(bool),
created_at`. Header `total_amount` = sum of line amounts (recomputed on edit).

**Categories (`expense_category` enum):** Fuel · Parking · Taxi/Transportation ·
Hotel · Meals · Customer meeting · Office/Admin · Business-trip related · Other.
`receipt_required` is derived per category (configurable; e.g. Fuel/Hotel/Meals = yes).

## 3. Attachments / proof (Supabase Storage — never bytes in DB)
- Table `expense_attachment`: `id, line_id, request_id, storage_path, filename,
  mime_type, size_bytes, uploaded_by, created_at`. **Only metadata** in Postgres;
  bytes live in a **private Storage bucket** (e.g. `expense-receipts`).
- Allowed types: PDF, JPG, PNG, HEIC (if supported); enforced max size (e.g. 10 MB).
- Preview/download via short-lived **signed URLs** generated server-side after an
  RLS visibility check.
- Editable (replace/delete) **only while `draft`** (or when returned for
  correction); locked after submission.
- **Storage RLS:** bucket policies mirror request visibility — a user can read an
  object only if they may see its parent request (path keyed by request_id;
  policy joins back to `request` visibility). No receipt is reachable for an
  unrelated request.

## 4. Approval flow (MVP)
Area Manager → Company Manager · Admin → Company Manager · Company Manager →
Director/Admin (placeholder). Each decision writes `request_approval`
(actor, action, from_status, to_status, comment, created_at) and updates
`request.status`. Adds a **"return for correction"** action (→ back to `draft`).

## 5. Visibility / RLS
Own requests · assigned approver · Company Manager (is_global) all · Admin
operational · Area Manager own + assigned scope (`related_*` in scope via
my_area_ids/my_region_ids/my_agent_ids). Lines, attachments, approvals follow the
parent request's visibility. Reuse the `can_see_request()` SECURITY DEFINER helper
pattern from 0007; Storage policies enforce the same rule for files.

## 6. Notifications (reuse 0006 `notification` + `enqueue_notification`)
expense_submitted · approval_required · approved · rejected ·
returned_for_correction · paid_reimbursed · missing_receipt. Add these to
`notification_type` additively.

## 7. Calendar / Workspace links
Optional links to Business Trip, Task, Region, City, Distributor (via
`request.related_*` / `related_business_trip`). Approved/expensed dates can feed
the shared calendar query.

## 8. UI screens (under Requests, no duplicate routes)
All Requests · My Requests · Pending Approvals · Expenses · Create Expense
Request (multi-line editor with per-line attachment upload) · Expense Request
Detail · Attachment preview. EN/UK/AR from the start; Arabic RTL. Reuse shell,
sidebar, topbar, dialogs, RLS helpers, notification system, and calendar.

## 9. Implementation guardrails
Additive-safe migrations only · files in Storage (metadata in DB) · signed-URL
access after RLS check · i18n EN/UK/AR + RTL · reuse existing components/helpers ·
no Requests work until Workspace/Tasks is done and approved.

## 10. Print / Export report (Expense Request detail)
A **Print** button on the Expense Request detail page (Export PDF later) opens a
dedicated print route, e.g. `/requests/[id]/print`, rendered without the app
shell (no sidebar/topbar/action buttons), white background, Roshen branding,
A4-friendly spacing, using CSS `@media print`.

**Report content:**
- *Header* — Roshen KSA Platform · "Expense Request Report" · request number ·
  status · requested by · request date · approval date + approver (if approved).
- *Summary* — requester + role · region · city · distributor (if related) ·
  linked business trip (if any) · total amount · currency · status · notes.
- *Expense lines table* — category · expense date · description · amount ·
  VAT (if any) · line total · payment method (if any) · receipt status ·
  attachment filename/link (if any).
- *Approvals* — approver · status · comment · decided date.
- *Attachments* — list of receipts/proofs with filename + uploaded date, and a
  thumbnail/link preview where the file is an image/PDF.

**Access control:** the print route enforces the same `can_see_request()` RLS —
only users who can view the request (and its receipts) can print it; signed URLs
for any thumbnails are generated after the visibility check.

**Status rules:** print available for submitted · pending_approval · approved ·
rejected · paid · closed. `draft` may print with a **"DRAFT" watermark/badge**.

**Future:** server-side PDF generation, email/share, and bulk reports
(by month / user / region) + a finance reimbursement report.

---

> Nothing applied for Requests. On approval I'll create `0006` (workspace/calendar/
> notifications — DONE) then `0007` (requests incl. expense lines + attachments +
> print/export), validate on PG16 + Roshen, regenerate types, then build screens.
> screens in their own passes.
