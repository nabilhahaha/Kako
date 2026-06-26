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

> Nothing applied. On approval I'll create `0006` (workspace/calendar/notifications)
> then `0007` (requests), validate on PG16 + Roshen, regenerate types, then build
> screens in their own passes.
