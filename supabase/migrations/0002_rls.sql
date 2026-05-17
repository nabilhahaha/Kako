-- Row Level Security policies. Idempotent (DROP IF EXISTS then CREATE).

alter table public.profiles         enable row level security;
alter table public.aggregated_data  enable row level security;
alter table public.submissions      enable row level security;

-- ─── PROFILES ────────────────────────────────────────────────────────────────
drop policy if exists "profiles read all authed" on public.profiles;
create policy "profiles read all authed"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- INSERT/DELETE on profiles is intentionally NOT exposed to the client.
-- Use the admin-create-user / admin-delete-user Edge Functions (service_role).

-- ─── AGGREGATED_DATA ─────────────────────────────────────────────────────────
drop policy if exists "agg read all authed" on public.aggregated_data;
create policy "agg read all authed"
  on public.aggregated_data for select
  to authenticated using (true);

drop policy if exists "agg insert by RM" on public.aggregated_data;
create policy "agg insert by RM"
  on public.aggregated_data for insert
  to authenticated with check (
    exists (select 1 from public.profiles
            where id = auth.uid() and role = 'roshen_manager' and is_active)
  );

-- ─── SUBMISSIONS ─────────────────────────────────────────────────────────────
-- SELECT: salesmen see their own; TM/RM see everything.
drop policy if exists "submissions select" on public.submissions;
create policy "submissions select"
  on public.submissions for select
  to authenticated using (
    salesman_id = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid()
                 and role in ('trade_marketing', 'roshen_manager')
                 and is_active)
  );

-- INSERT: only salesmen, only as themselves, only with status = pending_tm.
drop policy if exists "submissions insert by salesman" on public.submissions;
create policy "submissions insert by salesman"
  on public.submissions for insert
  to authenticated with check (
    salesman_id = auth.uid()
    and status = 'pending_tm'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'salesman' and is_active)
  );

-- UPDATE by TM: only rows currently in pending_tm.
drop policy if exists "submissions update by TM" on public.submissions;
create policy "submissions update by TM"
  on public.submissions for update
  to authenticated using (
    status = 'pending_tm'
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'trade_marketing' and is_active)
  );

-- UPDATE by RM: pending_roshen OR approved within 48h of original decision.
drop policy if exists "submissions update by RM" on public.submissions;
create policy "submissions update by RM"
  on public.submissions for update
  to authenticated using (
    (
      status = 'pending_roshen'
      or (status = 'approved'
          and rm_decision_date is not null
          and rm_decision_date > now() - interval '48 hours')
    )
    and exists (select 1 from public.profiles
                where id = auth.uid() and role = 'roshen_manager' and is_active)
  );
