-- =====================================================================
-- Roshen KSA — 0018 Add "waiting" task status (additive)
-- Monday-style statuses: Not Started · Working on it (in_progress) ·
-- Stuck/Blocked (blocked) · Waiting (new) · Done (completed) · Cancelled.
-- Labels are i18n; only the new enum value is a schema change.
-- =====================================================================
alter type task_status add value if not exists 'waiting';
