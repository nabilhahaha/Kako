-- =====================================================================
-- Roshen KSA — 0019 Task attachments (additive)
-- Private Storage bucket + metadata table; RLS mirrors task visibility.
-- Files live in Storage; only metadata in Postgres.
-- =====================================================================

-- Private bucket (10 MB cap; pdf + common image types incl. HEIC).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('task-attachments', 'task-attachments', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp','image/gif'])
on conflict (id) do nothing;

-- New notification types
alter type notification_type add value if not exists 'file_attached';
alter type notification_type add value if not exists 'file_shared';

-- Metadata table
create table if not exists task_attachment (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references task(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  mime_type    text,
  size_bytes   bigint,
  title        text,
  uploaded_by  uuid references profile(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists task_attachment_task_idx on task_attachment (task_id);
alter table task_attachment enable row level security;

drop policy if exists task_attachment_select on task_attachment;
create policy task_attachment_select on task_attachment for select to authenticated
  using (task_id in (select id from task));
drop policy if exists task_attachment_insert on task_attachment;
create policy task_attachment_insert on task_attachment for insert to authenticated
  with check (uploaded_by = auth.uid() and task_id in (select id from task));
drop policy if exists task_attachment_delete on task_attachment;
create policy task_attachment_delete on task_attachment for delete to authenticated
  using (uploaded_by = auth.uid()
    or exists (select 1 from task t where t.id = task_id and (t.created_by = auth.uid() or is_global() or is_admin())));

-- Storage RLS (path convention: <task_id>/<file>) — mirror task visibility.
drop policy if exists task_attach_read on storage.objects;
create policy task_attach_read on storage.objects for select to authenticated
  using (bucket_id = 'task-attachments'
    and ((storage.foldername(name))[1])::uuid in (select id from task));
drop policy if exists task_attach_insert on storage.objects;
create policy task_attach_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'task-attachments' and owner = auth.uid()
    and ((storage.foldername(name))[1])::uuid in (select id from task));
drop policy if exists task_attach_delete on storage.objects;
create policy task_attach_delete on storage.objects for delete to authenticated
  using (bucket_id = 'task-attachments'
    and (owner = auth.uid()
      or ((storage.foldername(name))[1])::uuid in (select id from task t where t.created_by = auth.uid() or is_global() or is_admin())));
