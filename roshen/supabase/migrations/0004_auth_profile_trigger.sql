-- =====================================================================
-- Roshen KSA — 0004 auth profile provisioning
-- Auto-create a profile row when a new auth user signs up, assigned to the
-- (single) company with the default 'area_manager' role. Company managers /
-- admins are promoted manually afterward.
-- =====================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profile (id, email, full_name, company_id, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    (select id from company order by created_at limit 1),
    'area_manager'
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
