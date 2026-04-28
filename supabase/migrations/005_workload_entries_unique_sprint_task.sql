-- Migration 005 — enforce one workload_entry per sprint_task
--
-- Backs the UPSERT (`onConflict: 'sprint_task_id'`) used by
-- lib/cascade.ts :: ensureWorkloadEntry, which previously relied on a
-- count-then-insert pattern that could create duplicate rows under
-- concurrent invocations.
--
-- IF NOT EXISTS keeps this migration idempotent — re-applying after a
-- prior run is a no-op.
--
-- Note: if the workload_entries table already contains duplicate
-- sprint_task_id rows from the legacy code path, this CREATE UNIQUE INDEX
-- will fail. Resolve duplicates beforehand (e.g. keep the most recently
-- created row per sprint_task_id and delete the rest) and then re-run.

CREATE UNIQUE INDEX IF NOT EXISTS workload_entries_sprint_task_id_key
  ON workload_entries (sprint_task_id);
