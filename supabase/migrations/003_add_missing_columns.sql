-- Migration 003: Add missing columns + sequential display IDs
--
-- main_tasks:
--   mt_number  — SERIAL, auto-increments, used to derive display_id
--   display_id — GENERATED ALWAYS AS 'MT-' || LPAD(mt_number, 3, '0')
--   task_owner — TEXT nullable, free-form owner name or email
--   deadline   — TIMESTAMPTZ nullable
--
-- sprint_tasks:
--   st_number  — SERIAL, auto-increments, used to derive display_id
--   display_id — GENERATED ALWAYS AS 'ST-' || LPAD(st_number, 3, '0')
--
-- NOTE: display_id columns must be added in a separate ALTER TABLE because
-- PostgreSQL cannot reference a column being added in the same statement.
-- UUID primary keys are NOT changed — display_id is for display only.

-- ─── main_tasks ───────────────────────────────────────────────────────────────

ALTER TABLE main_tasks
  ADD COLUMN mt_number  SERIAL,
  ADD COLUMN task_owner TEXT,
  ADD COLUMN deadline   TIMESTAMPTZ;

ALTER TABLE main_tasks
  ADD COLUMN display_id TEXT GENERATED ALWAYS AS (
    'MT-' || LPAD(mt_number::text, 3, '0')
  ) STORED;

-- ─── sprint_tasks ─────────────────────────────────────────────────────────────

ALTER TABLE sprint_tasks
  ADD COLUMN st_number SERIAL;

ALTER TABLE sprint_tasks
  ADD COLUMN display_id TEXT GENERATED ALWAYS AS (
    'ST-' || LPAD(st_number::text, 3, '0')
  ) STORED;
