-- Enable Realtime broadcast on the two tables the UI subscribes to.
-- Idempotent: re-running is safe (table may already be in the publication).
do $$
begin
  begin
    alter publication supabase_realtime add table public.submissions;
  exception when duplicate_object then
    null;
  end;
  begin
    alter publication supabase_realtime add table public.aggregated_data;
  exception when duplicate_object then
    null;
  end;
end $$;
