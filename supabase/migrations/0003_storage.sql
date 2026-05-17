-- Private bucket for submission photos. Path convention:
--   submission-photos/{submission_id}/expiry.jpg
--   submission-photos/{submission_id}/qty.jpg

insert into storage.buckets (id, name, public)
values ('submission-photos', 'submission-photos', false)
on conflict (id) do nothing;

drop policy if exists "photos upload by authed" on storage.objects;
create policy "photos upload by authed"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'submission-photos');

drop policy if exists "photos read by authed" on storage.objects;
create policy "photos read by authed"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'submission-photos');

drop policy if exists "photos update by authed" on storage.objects;
create policy "photos update by authed"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'submission-photos');
