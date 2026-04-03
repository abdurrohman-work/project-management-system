-- Migration 002: Add 'blocked' and 'stopped' to sprint_task_status enum
--
-- Required for Ticket 007 cascade logic (Rule D / Rule E).
-- When a main_task is set to blocked or stopped, its non-done sprint_tasks
-- in the active sprint must mirror that status — which requires these values
-- to exist in the sprint_task_status enum.
--
-- PostgreSQL allows appending values to an existing enum without a table rewrite.
-- IF NOT EXISTS prevents errors if this migration is re-run.

ALTER TYPE sprint_task_status ADD VALUE IF NOT EXISTS 'blocked';
ALTER TYPE sprint_task_status ADD VALUE IF NOT EXISTS 'stopped';
