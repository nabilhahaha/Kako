-- ── Setup wizard flag (additive, safe) ────────────────────────────────────
-- Marks whether the company finished (or skipped) the post-registration setup
-- wizard, so it's only shown once. Defaults false; existing companies are
-- treated as already set up (backfilled true) to avoid prompting them.

alter table erp_companies
  add column if not exists setup_done boolean not null default false;

update erp_companies set setup_done = true where setup_done = false;
