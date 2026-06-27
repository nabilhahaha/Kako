-- =====================================================================
-- Roshen KSA — 0017 Multiple task assignees (additive, non-destructive)
--
-- Adds task_assignee (many assignees per task), keeps task.assigned_to as a
-- denormalized "primary" for back-compat, backfills existing assignments, and
-- extends can_see_task() so every assignee can read the task.
-- =====================================================================

create table if not exists task_assignee (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references task(id) on delete cascade,
  user_id      uuid not null references profile(id) on delete cascade,
  assigned_by  uuid references profile(id) on delete set null,
  assigned_at  timestamptz not null default now(),
  status       task_status not null default 'not_started',
  completed_at timestamptz,
  unique (task_id, user_id)
);
create index if not exists task_assignee_task_idx on task_assignee (task_id);
create index if not exists task_assignee_user_idx on task_assignee (user_id);

alter table task_assignee enable row level security;

-- Backfill existing single-assignee tasks into the new table.
insert into task_assignee (task_id, user_id, assigned_by)
select id, assigned_to, created_by from task where assigned_to is not null
on conflict (task_id, user_id) do nothing;

-- Visibility helper now also matches any assignee.
create or replace function can_see_task(
  p_id uuid, p_created_by uuid, p_assigned_to uuid,
  p_visibility task_visibility_kind, p_visible_role app_role,
  p_related_area_id uuid, p_related_city_id uuid
) returns boolean language sql stable security definer set search_path = public as $$
  select
    is_admin()
    or p_created_by = auth.uid()
    or p_assigned_to = auth.uid()
    or exists (select 1 from task_assignee ta where ta.task_id = p_id and ta.user_id = auth.uid())
    or (p_visibility = 'all_managers' and is_global())
    or (p_visibility = 'selected_role' and p_visible_role = app_role())
    or exists (
      select 1 from task_visibility g where g.task_id = p_id and (
        g.user_id = auth.uid()
        or g.role = app_role()
        or g.area_id in (select my_area_ids())
        or g.region_id in (select my_region_ids())
        or g.agent_id in (select my_agent_ids())
        or g.city_id in (select c.id from city c where c.region_id in (select my_region_ids()))
        or g.branch_id in (select b.id from branch b where b.area_id in (select my_area_ids()))
      )
    )
    or (p_related_area_id is not null and p_related_area_id in (select my_area_ids()))
    or (p_related_city_id is not null and p_related_city_id in (select c.id from city c where c.region_id in (select my_region_ids())));
$$;
revoke execute on function can_see_task(uuid,uuid,uuid,task_visibility_kind,app_role,uuid,uuid) from anon, public;
grant execute on function can_see_task(uuid,uuid,uuid,task_visibility_kind,app_role,uuid,uuid) to authenticated;

-- RLS: visible iff parent task visible; managed by creator/global/admin;
-- assignees may update their own row (per-assignee status).
drop policy if exists task_assignee_select on task_assignee;
create policy task_assignee_select on task_assignee for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_assignee_manage on task_assignee;
create policy task_assignee_manage on task_assignee for all to authenticated
  using (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())))
  with check (exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())));
drop policy if exists task_assignee_self on task_assignee;
create policy task_assignee_self on task_assignee for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
