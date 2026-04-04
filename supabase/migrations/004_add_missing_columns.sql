-- Migration 004: add missing columns to main_tasks and sprint_tasks
-- Adds fields present in the original Google Sheets system

ALTER TABLE main_tasks
  ADD COLUMN IF NOT EXISTS taken_at   TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS blocked_by TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link       TEXT        DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS note       TEXT        DEFAULT NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN IF NOT EXISTS blocked_by TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS link       TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS note       TEXT DEFAULT NULL;
