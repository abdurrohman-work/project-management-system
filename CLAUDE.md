# CLAUDE.md — Project Management System

## Project overview
A personal project management system with main tasks (epics), sprint-based subtasks,
time tracking via workload entries, Google Calendar sync, and automated sprint rollover.
Built for solo use. No multi-user support in v1.

## Stack
- Next.js 14 (App Router, TypeScript strict mode)
- Supabase (PostgreSQL + Supabase client)
- Tailwind CSS v3
- Vercel (deployment)
- Vercel Cron Jobs (scheduled jobs)

## Repository structure
```
project-management-system/
├── app/
│   ├── api/
│   │   ├── main-tasks/         # CRUD + cascade triggers
│   │   ├── sprint-tasks/       # CRUD + cascade triggers
│   │   ├── workload-entries/   # CRUD + time tracking
│   │   ├── sprints/            # Sprint management
│   │   └── cron/
│   │       ├── sprint-rollover/   # Weekly Monday 1am
│   │       └── workload-report/   # Bi-weekly Monday 2am
│   ├── dashboard/              # Main dashboard page
│   ├── sprints/                # Sprint view page
│   └── layout.tsx
├── lib/
│   ├── supabase.ts             # Supabase client (browser)
│   ├── supabase-server.ts      # Supabase client (server)
│   ├── calculations.ts         # Progress + time calculations
│   ├── cascade.ts              # State cascade logic
│   └── time.ts                 # Time normalization (→ minutes)
├── types/
│   └── database.ts             # TypeScript types for all tables
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
├── .env.local                  # Never commit
├── CLAUDE.md                   # This file
└── vercel.json                 # Cron job schedule
```

## Database tables (approved schema)
1. `sprints` — sprint containers, one active at a time
2. `main_tasks` — high-level epics (progress + time_spent are calculated, never set directly)
3. `sprint_tasks` — actionable subtasks, linked to main_task + sprint
4. `workload_entries` — time tracking per sprint_task, created auto when task → in_progress
5. `calendar_events` — Google Calendar sync records (one per workload_entry)
6. `workload_reports` — bi-weekly generated snapshots (append-only)

## Critical architecture rules
- All time stored as INTEGER (minutes). Never store hours or decimals.
- `progress` on main_tasks is a stored calculated field. Never set it directly.
  Always recalculate via `recalculateMainTaskProgress(mainTaskId)` in lib/calculations.ts
- `time_spent` on main_tasks is the sum of all AP across all workload_entries for that task.
  Always recalculate via `recalculateTimeSpent(mainTaskId)` in lib/calculations.ts
- Cascade logic lives in lib/cascade.ts ONLY. Never inline cascade logic in API routes.
- API responses always use: `{ success: boolean, data?: any, error?: string }`

## Status enums (exact values — do not change)
- main_task_status: backlog | in_progress | blocked | stopped | done
- sprint_task_status: not_started | in_progress | done | partly_completed
- workload_status: not_started | in_progress | done | halted
- task_priority: low | medium | high | critical
- sprint_status: active | archived
- load_category: underloaded | underperforming | balanced | overloaded

## Cascade rules (implement in this exact order, test each before next)
When main_task status → blocked or stopped:
  → All sprint_tasks in active sprint (not done) → blocked/stopped

When main_task status → in_progress (from blocked/stopped):
  → All affected sprint_tasks → in_progress

When sprint_task created without status:
  → Default to not_started

When sprint_task status → in_progress:
  → Auto-create workload_entry if none exists for this sprint_task

When sprint_task modified:
  → If parent main_task is in backlog → set to in_progress

When all sprint_tasks for a main_task are done (across all sprints):
  → Set main_task status → done

When workload_entry status changes:
  → Propagate back to sprint_task in active sprint
  → Recalculate main_task progress and time_spent

When workload_entry start_date or due_date changes:
  → Create/update/delete Google Calendar event

## Calculation rules
Progress (weighted by planned_time):
  1. Get max planned_time per sprint_task
  2. If planned_time > 0: use it as weight. If 0: use average of others. If all 0: weight = 1
  3. progress = (sum of weights for DONE tasks) / (total sum of all weights) * 100

Load level:
  load_level = (total_planned_minutes / 60 / 30) * 100  (30-hour baseline)

Efficiency:
  efficiency = (total_actual / total_planned) * 100

Load category thresholds:
  efficiency < 80 → underloaded
  efficiency < 90 → underperforming
  efficiency <= 110 → balanced
  efficiency > 110 → overloaded

## Cron job schedule (vercel.json)
Sprint rollover: "0 1 * * 1"  (Monday 1am)
Workload report: "0 2 * * 1"  (Monday 2am, bi-weekly via internal logic)

## Current status
[UPDATE THIS AT THE START OF EVERY SESSION]
Phase: 1 — Database Setup
Completed: SQL migration (001_initial_schema.sql), all 6 tables verified in Supabase, Sprint 1 seeded (active, 2026-03-30 → 2026-04-05), @supabase/supabase-js installed, lib/supabase.ts + lib/supabase-server.ts + types/database.ts scaffolded
In progress: —
Next: Build app/api/ routes (main-tasks, sprint-tasks, workload-entries, sprints) + lib/calculations.ts + lib/cascade.ts + lib/time.ts

## What NOT to change without asking
- Enum values (changing breaks existing data)
- The progress/time_spent calculation approach
- The cascade rule order
