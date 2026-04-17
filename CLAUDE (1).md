# CLAUDE.md — Project Management System
# Based on original Google Apps Script source code analysis
# Timezone: Asia/Tashkent

---

## What this system is

A sprint-based project management tool replacing a Google Sheets system used by the Mohir.dev team.
It tracks main tasks (epics), sprint subtasks, workload/time entries, and generates efficiency reports.
Single user in v1. Team login comes in Phase 4.

---

## Tech stack

- Next.js 14 (App Router, TypeScript strict mode)
- Supabase (PostgreSQL + Supabase JS client)
- Tailwind CSS v3 with custom brand colors
- Vercel (deployment + cron jobs)
- Recharts (workload report charts)
- Timezone: Asia/Tashkent for all date calculations

---

## Repository structure

```
project-management-system/
├── app/
│   ├── api/
│   │   ├── main-tasks/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── sprint-tasks/
│   │   │   ├── route.ts
│   │   │   └── [id]/route.ts
│   │   ├── workload-entries/
│   │   │   ├── route.ts
│   │   │   ├── [id]/route.ts
│   │   │   └── list/route.ts
│   │   ├── sprints/
│   │   │   ├── route.ts
│   │   │   └── active/route.ts
│   │   ├── reports/
│   │   │   └── generate/route.ts
│   │   └── cron/
│   │       ├── sprint-rollover/route.ts
│   │       └── workload-report/route.ts
│   ├── dashboard/page.tsx
│   ├── sprints/page.tsx
│   ├── workload/page.tsx
│   ├── report/page.tsx
│   └── layout.tsx
├── lib/
│   ├── supabase.ts
│   ├── supabase-server.ts
│   ├── cascade.ts
│   ├── calculations.ts
│   └── time.ts
├── types/
│   └── database.ts
├── supabase/migrations/
├── vercel.json
├── CLAUDE.md
├── TICKETS.md
└── .env.local
```

---

## Database tables

### sprints
- id uuid PK
- sprint_number integer UNIQUE
- name text (e.g. "sprint1", "sprint2")
- status sprint_status (active | archived)
- start_date date
- end_date date
- created_at timestamptz
- RULE: Only ONE sprint can be active at a time

### main_tasks
- id uuid PK
- mt_number SERIAL → display_id = 'MT-' || LPAD(mt_number, 3, '0')
- name text
- status main_task_status
- progress numeric(5,2) — CALCULATED ONLY, never set directly
- time_spent integer (minutes) — CALCULATED ONLY, never set directly
- category text nullable
- priority task_priority
- task_owner text nullable (email)
- deadline timestamptz nullable
- taken_at timestamptz nullable
- blocked_by text nullable
- link text nullable
- note text nullable
- created_at, updated_at timestamptz

### sprint_tasks
- id uuid PK
- st_number SERIAL → display_id = 'ST-' || LPAD(st_number, 3, '0')
- main_task_id uuid FK → main_tasks (CASCADE DELETE)
- sprint_id uuid FK → sprints (CASCADE DELETE)
- name text
- status sprint_task_status
- priority task_priority
- blocked_by text nullable
- link text nullable
- note text nullable
- rolled_over_from uuid nullable (self FK, SET NULL on delete)
- created_at, updated_at timestamptz

### workload_entries
- id uuid PK
- sprint_task_id uuid FK → sprint_tasks (CASCADE DELETE)
- status workload_status
- start_date date nullable
- due_date date nullable
- planned_time integer (minutes = SP)
- actual_time integer (minutes = AP)
- created_at, updated_at timestamptz

### calendar_events
- id uuid PK
- workload_entry_id uuid UNIQUE FK → workload_entries (CASCADE DELETE)
- external_event_id text UNIQUE
- calendar_id text default 'primary'
- synced_at timestamptz

### workload_reports (append-only, never modify)
- id uuid PK
- week_start date UNIQUE
- week_end date
- total_planned integer (minutes)
- total_actual integer (minutes)
- efficiency numeric(6,2)
- load_level numeric(6,2)
- load_category load_category
- generated_at timestamptz

---

## Enum types (EXACT values — never change)

main_task_status:   backlog | in_progress | blocked | stopped | done
sprint_task_status: not_started | in_progress | done | partly_completed | blocked | stopped
workload_status:    not_started | in_progress | done | halted
task_priority:      low | medium | high | critical
sprint_status:      active | archived
load_category:      underloaded | underperforming | balanced | overloaded

---

## Cascade logic — lib/cascade.ts

ALL cascade logic lives ONLY in lib/cascade.ts.
API routes call functions from cascade.ts — never inline logic in routes.

### onMainTaskStatusChanged(mainTaskId, newStatus, previousStatus, supabase)

Rule D — Block cascade:
  If newStatus = blocked OR stopped:
    → Get active sprint
    → Set all sprint_tasks for this main_task in active sprint to newStatus
    → SKIP tasks already marked done

Rule E — Unblock cascade:
  If newStatus = in_progress AND previousStatus was blocked OR stopped:
    → Get active sprint
    → Revert sprint_tasks that are blocked OR stopped → in_progress
    → SKIP tasks already done

### onSprintTaskCreated(sprintTaskId, mainTaskId, supabase)

Rule B — Promote parent:
  If parent main_task status is backlog or empty → set to in_progress
  Do NOT change if parent is blocked, stopped, or done

### onSprintTaskPatched(sprintTaskId, mainTaskId, newStatus, supabase)

Rule A — Auto-create workload entry:
  If newStatus = in_progress:
    → Check if workload_entry exists for this sprint_task_id
    → If none: create one with status not_started
    → If exists and status is not_started: set to in_progress

Rule B — Promote parent:
  If parent main_task status is backlog or empty → set to in_progress
  Do NOT change if parent is blocked, stopped, or done

Rule C — Auto-complete + reversal:
  Fetch ALL sprint_tasks for this main_task across ALL sprints
  If ALL are done → set main_task to done
  If NOT all done AND main_task is currently done → revert to in_progress

### onWorkloadEntryChanged(sprintTaskId, mainTaskId, newStatus, supabase)

Status propagation to sprint (map workload → sprint status):
  done         → Done
  halted       → Stopped
  in_progress  → In progress
  not_started  → Not started

Target: Look in ACTIVE sprint first. Fall back to any sprint if SID not found in active.

Recalculation:
  Always call recalculateAll(mainTaskId) after any workload change.

Calendar sync (Phase 5 — not yet implemented):
  If BOTH start_date AND due_date set → create/update Google Calendar event
  If either removed → delete the calendar event

---

## Calculation rules — lib/calculations.ts

### recalculateMainTaskProgress(mainTaskId, supabase)

1. Fetch all sprint_tasks for this mainTaskId across ALL sprints
2. For each sprint_task, get MAX planned_time from its workload_entries (minutes)
3. Weight rule:
   - If MAX planned_time > 0: weight = MAX planned_time
   - If MAX planned_time = 0 BUT other tasks have SP > 0: weight = average SP of tasks with SP > 0
   - If ALL tasks have planned_time = 0: weight = 1 per task
4. progress = (sum of weights for DONE tasks) / (total sum of weights) × 100
5. Round to 2 decimal places
6. Write to main_tasks.progress

### recalculateTimeSpent(mainTaskId, supabase)

1. Sum ALL actual_time from ALL workload_entries of ALL sprint_tasks of this mainTaskId
2. Write total minutes to main_tasks.time_spent

### recalculateAll(mainTaskId, supabase)

Calls both functions sequentially (not parallel — avoids write-race on same row).

---

## Sprint rollover — app/api/cron/sprint-rollover/route.ts

Schedule: Monday 1:00 AM Asia/Tashkent = Sunday 20:00 UTC

Steps:
1. Find active sprint
2. Create new sprint: sprint_number = last + 1, name = 'sprint' + number
3. For each incomplete sprint_task (status != done) in old sprint:
   a. Copy to new sprint with status = not_started
   b. Set rolled_over_from = old task ID
   c. In OLD sprint:
      - If task was not_started → keep as not_started (do NOT change)
      - If task was in_progress, blocked, stopped → set to partly_completed
      - Done tasks → leave unchanged
4. Archive old sprint (status = archived)
5. Set new sprint status = active
6. Run recalculateAll for all affected main_tasks

---

## Workload report — app/api/reports/generate/route.ts

Schedule: Monday 2:00 AM Asia/Tashkent = Sunday 21:00 UTC (bi-weekly)
Look back: 12 weeks

Week assignment (weekStartFromStartDue — CRITICAL):
- BOTH start AND due exist in SAME week → use that week's Monday
- BOTH start AND due exist in DIFFERENT weeks → use DUE DATE's week Monday
- Only due_date → use due_date's week Monday
- Only start_date → use start_date's week Monday

Filters: Skip entries with status = in_progress (only count done and halted)

Per week calculation:
- total_planned = SUM of MAX planned_time per sprint_task
- total_actual = raw SUM of all actual_time
- efficiency = (total_actual / total_planned) × 100, rounded 2dp
- load_level = (total_planned_minutes / 60 / 30) × 100 (30h baseline)
- load_category:
  efficiency < 80%         → underloaded
  efficiency 80% to <90%   → underperforming
  efficiency 90% to 110%   → balanced
  efficiency > 110%        → overloaded

UPSERT by week_start (UNIQUE constraint prevents duplicates from double runs).

---

## Time normalization — lib/time.ts

parseTimeToMinutes(input):
- "1:30" or "01:30" → 90 min
- "1.5"             → 90 min
- 90 (number)       → 90 min
- "2h"              → 120 min
- 0 < n ≤ 1 (day fraction from Google Sheets) → n × 24 × 60 min

minutesToHours(minutes):
- 90  → "1h 30m"
- 60  → "1h"
- 45  → "45m"
- 0   → "0m"

---

## Design tokens

Font:        Gilroy (https://fonts.cdnfonts.com/css/gilroy-free)
Background:  #18232d
Sidebar:     #111b24
Accent:      #3f9cfb
Surface:     #1e2d3d
Border:      #2a3f52
Text:        #ffffff
Muted:       rgba(255,255,255,0.6)
Progress:    #4ade80

Status badge colors:
  backlog:           bg=#374151  text=#9ca3af
  in_progress:       bg=#1e3a5f  text=#3f9cfb
  blocked:           bg=#450a0a  text=#f87171
  stopped:           bg=#431407  text=#fb923c
  done:              bg=#052e16  text=#4ade80
  not_started:       bg=#374151  text=#9ca3af
  partly_completed:  bg=#3b2f04  text=#fbbf24

Priority badge colors:
  low:      bg=#374151  text=#9ca3af
  medium:   bg=#1e3a5f  text=#60a5fa
  high:     bg=#431407  text=#fb923c
  critical: bg=#450a0a  text=#f87171

---

## API response format

All routes return: { success: boolean, data?: any, error?: string }
All routes have try/catch with proper HTTP status codes.

---

## Column reference (from original Google Sheets)

Dashboard (main_tasks):
  display_id | name | category | status | priority | taken_at | deadline | task_owner | progress | time_spent | blocked_by | link | note

Sprint view (sprint_tasks grouped by main_task):
  display_id (ST-) | name | status | priority | blocked_by | link | note

Workload (workload_entries):
  sprint_task display_id | task name | status | priority | start_date | due_date | planned_time (SP h) | actual_time (AP h) | main_task display_id

---

## Critical rules — NEVER violate

1. progress and time_spent are CALCULATED. Never set via API directly.
2. All cascade logic in lib/cascade.ts only. Zero in API routes.
3. All time stored as INTEGER minutes. Convert for display only.
4. Enum values are exact. No changes without a migration.
5. workload_reports is append-only. Never UPDATE or DELETE rows.
6. Sprint rollover: not_started tasks stay not_started in old sprint.
7. Auto-complete reversal: if main done but task un-done → revert to in_progress.
8. Report week: use DUE DATE's week when start and due are in different weeks.
9. Status propagation: target ACTIVE sprint first, fall back to any sprint.
10. Timezone: Asia/Tashkent for all date/week calculations.

---

## Cron schedule (vercel.json)

{
  "crons": [
    { "path": "/api/cron/sprint-rollover", "schedule": "0 20 * * 0" },
    { "path": "/api/cron/workload-report", "schedule": "0 21 * * 0" }
  ]
}

Vercel cron is UTC. Asia/Tashkent = UTC+5.
Monday 1am Tashkent = Sunday 20:00 UTC
Monday 2am Tashkent = Sunday 21:00 UTC

---

## Current status

[UPDATE THIS AT THE START OF EVERY SESSION]

Phase: 3 complete — all 4 views built with dark theme
Live URL: project-management-system-xi-flame.vercel.app

Known bugs to fix:
- Bug 1: Report week grouping uses only start_date (needs weekStartFromStartDue logic)
- Bug 2: Sprint rollover marks not_started tasks as partly_completed (wrong)
- Bug 3: Auto-complete reversal missing from cascade Rule C
- Bug 4: Workload→sprint propagation needs active-sprint-first targeting
- Missing: taken_at, blocked_by, link, note columns not yet in UI

Next: Tickets 017-021 (bug fixes + missing columns)

## What NOT to change without asking

- Enum values
- progress and time_spent (calculated only)
- Cascade rule order
- Week assignment logic for reports
- Cron UTC offset calculation
