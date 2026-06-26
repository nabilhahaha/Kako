# Workspace / Tasks + Calendar + Notifications — Foundation Proposal (not built)

A Monday-style follow-up module for Roshen: create/assign tasks, track status,
**control who can see each task**, view tasks on a **calendar**, and receive
**in-app notifications/reminders**. This is design only — **no migration applied,
no screens built** until approved.

---

## Migration impact
**Not** `0005` (already used: admin-writes + agent scope). Workspace =
**`0006_workspace_tasks.sql`** (tables + RLS + helpers).

## Enums
- `task_priority`: `low | normal | high | urgent`
- `task_status`: `not_started | in_progress | blocked | completed | cancelled`
- `task_visibility`: `private_assignee | creator_assignee | selected_users |
  selected_role | selected_scope | all_managers`
- `reminder_offset`: `none | at_due | 1h_before | 1d_before | custom`
- `notification_type`: `task_assigned | task_due_soon | task_overdue |
  status_changed | comment_added | task_reassigned | task_completed |
  task_cancelled | mentioned | scope_task_created`

## Proposed tables

**`task`** — core
`id, company_id, title, description, priority, status,
start_date?, due_date, due_time?, timezone (default 'Asia/Riyadh'),
reminder_offset (default none), reminder_at?, completed_at,
assigned_to (profile), created_by (profile),
visibility (task_visibility), visible_role (app_role)?,
related_area_id?, related_branch_id?, related_agent_id?,
related_import_batch_id?, related_sla_target_id?,
created_at, updated_at`.

**`task_visibility`** — explicit grants (for `selected_users`/`selected_scope`)
`id, task_id, user_id?, role?, region_id?, area_id?, branch_id?, agent_id?`
(one grant per row: a user, a role, or a scope node).

**`task_comment`** — discussion
`id, task_id, author_id, body, created_at`. (Attachments later.)

**`task_activity`** — audit/timeline (status changes, reassignments, etc.)
`id, task_id, actor_id, type (notification_type or 'created'/'edited'),
from_value?, to_value?, created_at`.

**`task_reminder`** (optional) — multiple reminders per task
`id, task_id, remind_at, offset (reminder_offset), sent_at?, created_at`.
(For MVP a single `task.reminder_at` is enough; this table supports multiple
reminders later.)

**`notification`** — in-app notifications
`id, company_id, user_id (recipient), type (notification_type), title, message,
related_task_id?, action_url?, is_read (default false), created_at, read_at?`.

Indexes: `task(assigned_to)`, `task(created_by)`, `task(status)`, `task(due_date)`,
`task_comment(task_id)`, `task_activity(task_id)`,
`notification(user_id, is_read)`, `notification(user_id, created_at)`.

## RLS approach
**Tasks** — one `SECURITY DEFINER` helper drives the SELECT policy:
```sql
can_see_task(t) :=
  is_admin()
  or t.created_by = auth.uid()
  or t.assigned_to = auth.uid()
  or (t.visibility = 'all_managers' and is_global())
  or (t.visibility = 'selected_role' and t.visible_role = app_role())
  or exists ( select 1 from task_visibility g where g.task_id = t.id and
        ( g.user_id = auth.uid() or g.role = app_role()
          or g.area_id   in (select my_area_ids())
          or g.region_id in (select my_region_ids())
          or g.branch_id in (select b.id from branch b where b.area_id in (select my_area_ids()))
          or g.agent_id  in (select ag.id from agent ag join branch b on b.id=ag.branch_id where b.area_id in (select my_area_ids())) ) )
  or t.related_area_id in (select my_area_ids())
```
- **INSERT**: creator must be `auth.uid()`; assigning to others requires
  `is_global()` or the assignee being within the creator's scope (server action +
  `with check`).
- **UPDATE**: creator/admin/company_manager full; assignee limited to
  `status` + comments.
- `task_comment` / `task_activity` / `task_visibility`: visible iff the parent
  task is visible (`task_id in (select id from task)` under RLS).

**Notifications** — a row is created **only** for recipients allowed to see the
task (visibility is resolved at notification-creation time, in the server
action/trigger). RLS: `notification` SELECT/UPDATE `using (user_id = auth.uid())`
— each user sees only their own. This satisfies "notifications respect task
visibility" (no notification is ever created for a user who can't see the task).

## Calendar
A **Calendar** view inside Workspace, driven by `task.due_date` (+ optional
`start_date`/`due_time`, timezone `Asia/Riyadh`):
- Views: **Month / Week / Day**; **My tasks** and **Team tasks** (managers).
- Shows: due dates, overdue, completed, high/urgent, assigned-to-me,
  created-by-me, scope-visible tasks.
- Filters: assignee, status, priority, area, branch, agent.
- No new tables — the calendar reads `task` (RLS already scopes visibility).

## Notifications (MVP)
- **In-app only** (no email/push yet).
- Triggers (create a `notification` per allowed recipient): assigned, due-soon,
  overdue, status changed, comment added, reassigned, completed, cancelled,
  mentioned, scope-task-created.
- **Top-bar bell** shows the unread count (`notification` where
  `user_id = me and not is_read`); a Notifications Center screen comes later.
- Due-soon/overdue/reminder firing: a scheduled job (Supabase cron / edge
  function) scans `task.reminder_at`/`due_date` and inserts notifications —
  added in a later phase.

## Sidebar plan
- **Now (added):** `Workspace` (after Home).
- **With this module:** add `Calendar` under Workspace; **Notifications** stays
  as the **top-bar bell** (unread count) for MVP — no separate sidebar item yet.

## MVP scope
Calendar from `due_date`; in-app notifications only; unread bell count; single
`reminder_at` per task. Email/push, multi-reminders (`task_reminder`), and the
Notifications Center screen are later.

## Later screens
Workspace home · My Tasks · Assigned by Me · Team Tasks · Calendar ·
Notifications Center · Task Detail (comments/activity).

## Sequencing
Recommended: review **Screen #2 (built)** → optionally apply the Workspace
**`0006`** foundation (tables + RLS, validated locally then on Roshen) →
continue operational **Screen #3 (Agents)** → Workspace + Calendar screens.
Happy to bring Workspace ahead of Screen #3 if you prefer.

> Nothing applied. On approval I'll create `0006_workspace_tasks.sql`, validate
> on PG16 + Roshen, regenerate types, then build the screens.
