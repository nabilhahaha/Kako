-- =====================================================================
-- Roshen KSA — 0006 Workspace / Tasks + Calendar + Notifications foundation
--
-- Additive, non-destructive. Implements docs/PROPOSAL-0006-0007.md (0006).
-- Reuses existing helpers: is_admin(), is_global(), app_role(),
-- my_area_ids(), my_region_ids(), my_agent_ids().
--
-- Refinements vs the original proposal (technical, not behavioural):
--   * visibility enum is task_visibility_kind (the table is task_visibility).
--   * city scope added (Region→City→Distributor model from 0008).
--   * notifications are written through a SECURITY DEFINER RPC
--     (enqueue_notification) because the app uses the publishable key and
--     cannot insert rows for other recipients under RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
do $$ begin
  create type task_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_status as enum ('not_started','in_progress','blocked','completed','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type task_visibility_kind as enum
    ('private_assignee','creator_assignee','selected_users','selected_role','selected_scope','all_managers');
exception when duplicate_object then null; end $$;

do $$ begin
  create type reminder_offset as enum ('none','at_due','1h_before','1d_before','custom');
exception when duplicate_object then null; end $$;

do $$ begin
  create type notification_type as enum
    ('task_assigned','task_due_soon','task_overdue','status_changed','comment_added',
     'task_reassigned','task_completed','task_cancelled','mentioned','scope_task_created');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------
create table if not exists task (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  title         text not null,
  description   text,
  priority      task_priority not null default 'normal',
  status        task_status   not null default 'not_started',
  start_date    date,
  due_date      date,
  due_time      time,
  timezone      text not null default 'Asia/Riyadh',
  reminder_offset reminder_offset not null default 'none',
  reminder_at   timestamptz,
  completed_at  timestamptz,
  assigned_to   uuid references profile(id) on delete set null,
  created_by    uuid not null references profile(id) on delete cascade,
  visibility    task_visibility_kind not null default 'creator_assignee',
  visible_role  app_role,
  related_area_id   uuid references area(id) on delete set null,
  related_branch_id uuid references branch(id) on delete set null,
  related_agent_id  uuid references agent(id) on delete set null,
  related_city_id   uuid references city(id) on delete set null,
  related_import_batch_id uuid references import_batch(id) on delete set null,
  related_sla_target_id   uuid references sla_target(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists task_assigned_idx on task (assigned_to);
create index if not exists task_created_by_idx on task (created_by);
create index if not exists task_status_idx on task (status);
create index if not exists task_due_idx on task (due_date);
create index if not exists task_company_idx on task (company_id);

create table if not exists task_visibility (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references task(id) on delete cascade,
  user_id   uuid references profile(id) on delete cascade,
  role      app_role,
  region_id uuid references region(id) on delete cascade,
  area_id   uuid references area(id) on delete cascade,
  branch_id uuid references branch(id) on delete cascade,
  agent_id  uuid references agent(id) on delete cascade,
  city_id   uuid references city(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists task_visibility_task_idx on task_visibility (task_id);

create table if not exists task_comment (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references task(id) on delete cascade,
  author_id uuid not null references profile(id) on delete cascade,
  body      text not null,
  created_at timestamptz not null default now()
);
create index if not exists task_comment_task_idx on task_comment (task_id);

create table if not exists task_activity (
  id        uuid primary key default gen_random_uuid(),
  task_id   uuid not null references task(id) on delete cascade,
  actor_id  uuid references profile(id) on delete set null,
  type      text not null,
  from_value text,
  to_value  text,
  created_at timestamptz not null default now()
);
create index if not exists task_activity_task_idx on task_activity (task_id);

create table if not exists task_reminder (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references task(id) on delete cascade,
  remind_at  timestamptz not null,
  reminder_kind reminder_offset,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists task_reminder_task_idx on task_reminder (task_id);

create table if not exists calendar_event (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references company(id) on delete cascade,
  owner_id   uuid not null references profile(id) on delete cascade,
  title      text not null,
  kind       text not null default 'custom' check (kind in ('task','trip','leave','custom')),
  start_date date not null,
  end_date   date,
  all_day    boolean not null default true,
  status_color text,
  related_task_id uuid references task(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists calendar_event_owner_idx on calendar_event (owner_id);
create index if not exists calendar_event_task_idx on calendar_event (related_task_id);

create table if not exists notification (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid references company(id) on delete cascade,
  user_id    uuid not null references profile(id) on delete cascade,
  type       notification_type not null,
  title      text not null,
  message    text,
  related_task_id uuid references task(id) on delete cascade,
  action_url text,
  is_read    boolean not null default false,
  created_at timestamptz not null default now(),
  read_at    timestamptz
);
create index if not exists notification_user_unread_idx on notification (user_id, is_read);
create index if not exists notification_user_created_idx on notification (user_id, created_at desc);

-- ---------------------------------------------------------------------
-- Visibility helper (SECURITY DEFINER — encodes the task SELECT rule).
-- Columns are passed in so the function never re-selects `task` (no recursion).
-- ---------------------------------------------------------------------
create or replace function can_see_task(
  p_id uuid,
  p_created_by uuid,
  p_assigned_to uuid,
  p_visibility task_visibility_kind,
  p_visible_role app_role,
  p_related_area_id uuid,
  p_related_city_id uuid
) returns boolean
language sql stable security definer set search_path = public as $$
  select
    is_admin()
    or p_created_by = auth.uid()
    or p_assigned_to = auth.uid()
    or (p_visibility = 'all_managers' and is_global())
    or (p_visibility = 'selected_role' and p_visible_role = app_role())
    or exists (
      select 1 from task_visibility g
      where g.task_id = p_id
        and (
          g.user_id = auth.uid()
          or g.role = app_role()
          or g.area_id   in (select my_area_ids())
          or g.region_id in (select my_region_ids())
          or g.agent_id  in (select my_agent_ids())
          or g.city_id   in (select c.id from city c where c.region_id in (select my_region_ids()))
          or g.branch_id in (select b.id from branch b where b.area_id in (select my_area_ids()))
        )
    )
    or (p_related_area_id is not null and p_related_area_id in (select my_area_ids()))
    or (p_related_city_id is not null and p_related_city_id in (select c.id from city c where c.region_id in (select my_region_ids())));
$$;
revoke execute on function can_see_task(uuid,uuid,uuid,task_visibility_kind,app_role,uuid,uuid) from anon, public;
grant execute on function can_see_task(uuid,uuid,uuid,task_visibility_kind,app_role,uuid,uuid) to authenticated;

-- Notifications are inserted via this definer RPC (app cannot write rows for
-- other recipients under RLS). Caller must be authenticated.
create or replace function enqueue_notification(
  p_user_id uuid,
  p_type notification_type,
  p_title text,
  p_message text default null,
  p_task_id uuid default null,
  p_action_url text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;
  select company_id into v_company from profile where id = p_user_id;
  insert into notification (company_id, user_id, type, title, message, related_task_id, action_url)
  values (v_company, p_user_id, p_type, p_title, p_message, p_task_id, p_action_url);
end;
$$;
revoke execute on function enqueue_notification(uuid,notification_type,text,text,uuid,text) from anon, public;
grant execute on function enqueue_notification(uuid,notification_type,text,text,uuid,text) to authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table task            enable row level security;
alter table task_visibility enable row level security;
alter table task_comment    enable row level security;
alter table task_activity   enable row level security;
alter table task_reminder   enable row level security;
alter table calendar_event  enable row level security;
alter table notification    enable row level security;

-- task
drop policy if exists task_select on task;
create policy task_select on task for select to authenticated
  using (can_see_task(id, created_by, assigned_to, visibility, visible_role, related_area_id, related_city_id));
drop policy if exists task_insert on task;
create policy task_insert on task for insert to authenticated
  with check (created_by = auth.uid());
drop policy if exists task_update on task;
create policy task_update on task for update to authenticated
  using (is_admin() or is_global() or created_by = auth.uid() or assigned_to = auth.uid())
  with check (is_admin() or is_global() or created_by = auth.uid() or assigned_to = auth.uid());
drop policy if exists task_delete on task;
create policy task_delete on task for delete to authenticated
  using (is_admin() or is_global() or created_by = auth.uid());

-- child tables: visible iff the parent task is visible
drop policy if exists task_visibility_select on task_visibility;
create policy task_visibility_select on task_visibility for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_visibility_write on task_visibility;
create policy task_visibility_write on task_visibility for all to authenticated
  using (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())))
  with check (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())));

drop policy if exists task_comment_select on task_comment;
create policy task_comment_select on task_comment for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_comment_insert on task_comment;
create policy task_comment_insert on task_comment for insert to authenticated
  with check (author_id = auth.uid() and task_id in (select id from task));
drop policy if exists task_comment_modify on task_comment;
create policy task_comment_modify on task_comment for update to authenticated
  using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());
drop policy if exists task_comment_delete on task_comment;
create policy task_comment_delete on task_comment for delete to authenticated
  using (author_id = auth.uid() or is_admin());

drop policy if exists task_activity_select on task_activity;
create policy task_activity_select on task_activity for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_activity_insert on task_activity;
create policy task_activity_insert on task_activity for insert to authenticated
  with check (task_id in (select id from task));

drop policy if exists task_reminder_select on task_reminder;
create policy task_reminder_select on task_reminder for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_reminder_write on task_reminder;
create policy task_reminder_write on task_reminder for all to authenticated
  using (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())))
  with check (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())));

-- calendar_event
drop policy if exists calendar_event_select on calendar_event;
create policy calendar_event_select on calendar_event for select to authenticated
  using (owner_id = auth.uid() or is_global() or (related_task_id is not null and related_task_id in (select id from task)));
drop policy if exists calendar_event_write on calendar_event;
create policy calendar_event_write on calendar_event for all to authenticated
  using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid() or is_admin());

-- notification: each user only their own; inserts happen via enqueue_notification (definer)
drop policy if exists notification_select on notification;
create policy notification_select on notification for select to authenticated
  using (user_id = auth.uid());
drop policy if exists notification_update on notification;
create policy notification_update on notification for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists notification_delete on notification;
create policy notification_delete on notification for delete to authenticated
  using (user_id = auth.uid());
