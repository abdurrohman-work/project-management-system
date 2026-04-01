-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE main_task_status AS ENUM (
  'backlog',
  'in_progress',
  'blocked',
  'stopped',
  'done'
);

CREATE TYPE sprint_task_status AS ENUM (
  'not_started',
  'in_progress',
  'done',
  'partly_completed'
);

CREATE TYPE workload_status AS ENUM (
  'not_started',
  'in_progress',
  'done',
  'halted'
);

CREATE TYPE task_priority AS ENUM (
  'low',
  'medium',
  'high',
  'critical'
);

CREATE TYPE sprint_status AS ENUM (
  'active',
  'archived'
);

CREATE TYPE load_category AS ENUM (
  'underloaded',
  'underperforming',
  'balanced',
  'overloaded'
);

-- ─── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE sprints (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_number  INTEGER NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  status         sprint_status NOT NULL DEFAULT 'active',
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE main_tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  status      main_task_status NOT NULL DEFAULT 'backlog',
  progress    NUMERIC NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  time_spent  INTEGER NOT NULL DEFAULT 0 CHECK (time_spent >= 0),
  category    TEXT,
  priority    task_priority NOT NULL DEFAULT 'medium',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sprint_tasks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  main_task_id      UUID NOT NULL REFERENCES main_tasks(id),
  sprint_id         UUID NOT NULL REFERENCES sprints(id),
  name              TEXT NOT NULL,
  status            sprint_task_status NOT NULL DEFAULT 'not_started',
  priority          task_priority NOT NULL DEFAULT 'medium',
  rolled_over_from  UUID REFERENCES sprint_tasks(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workload_entries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sprint_task_id   UUID NOT NULL REFERENCES sprint_tasks(id),
  status           workload_status NOT NULL DEFAULT 'not_started',
  start_date       DATE,
  due_date         DATE,
  planned_time     INTEGER NOT NULL DEFAULT 0 CHECK (planned_time >= 0),
  actual_time      INTEGER NOT NULL DEFAULT 0 CHECK (actual_time >= 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE calendar_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workload_entry_id   UUID NOT NULL UNIQUE REFERENCES workload_entries(id),
  external_event_id   TEXT NOT NULL UNIQUE,
  calendar_id         TEXT NOT NULL DEFAULT 'primary',
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workload_reports (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start     DATE NOT NULL UNIQUE,
  week_end       DATE NOT NULL,
  total_planned  INTEGER NOT NULL CHECK (total_planned >= 0),
  total_actual   INTEGER NOT NULL CHECK (total_actual >= 0),
  efficiency     NUMERIC NOT NULL,
  load_level     NUMERIC NOT NULL,
  load_category  load_category NOT NULL,
  generated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Seed: Sprint 1 ───────────────────────────────────────────────────────────

INSERT INTO sprints (sprint_number, name, status, start_date, end_date)
VALUES (1, 'Sprint 1', 'active', '2026-03-30', '2026-04-05');
