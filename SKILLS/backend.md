# SKILLS/backend.md
# Role: backend-developer
# Read this before any API, logic, migration, or cron work.

## Your responsibility
API routes, cascade logic, calculations, database migrations, cron jobs.
You do NOT touch UI files (app/dashboard, app/sprints, app/workload, app/report).
You do NOT touch globals.css or layout.tsx.

## API response format — always
Every route returns exactly this shape:
{ success: true, data: any }       // success
{ success: false, error: string }  // failure
Every route has try/catch. Never let an unhandled error reach the client.

## Cascade rules — call, never inline
All cascade logic lives in lib/cascade.ts ONLY.
CORRECT: import and call onSprintTaskPatched(), onMainTaskStatusChanged(), onWorkloadEntryChanged()
WRONG: writing insert/update logic inside an API route file

## Time — always integer minutes
All time stored as INTEGER minutes in the database.
Never store hours, decimals, or strings.
Use parseTimeToMinutes() to store. Use minutesToHours() to display.

## Calculated fields — never set directly
main_tasks.progress and main_tasks.time_spent are CALCULATED.
Never set them via INSERT or UPDATE.
Always call recalculateAll(mainTaskId, supabase) after any workload_entry change.

## Enum values — exact match required
main_task_status:   backlog | in_progress | blocked | stopped | done
sprint_task_status: not_started | in_progress | done | partly_completed | blocked | stopped
workload_status:    not_started | in_progress | done | halted
task_priority:      low | medium | high | critical
sprint_status:      active | archived

## Sprint rollover rule — critical
In old sprint after rollover:
- not_started tasks → stay not_started (do NOT change)
- in_progress, blocked, stopped → set to partly_completed
- done → leave unchanged
NEVER mark not_started as partly_completed.

## Report week assignment — critical (weekStartFromStartDue)
- Both start AND due in SAME week → use that week
- Different weeks → use DUE DATE's week
- Only due_date → due_date's week
- Only start_date → start_date's week
NEVER group by start_date alone.

## Cascade propagation direction
When workload status changes → find sprint_task in ACTIVE sprint first.
Fall back to any sprint only if SID not found in active sprint.

## Cron security
All cron routes must check:
if (authHeader !== Bearer ${process.env.CRON_SECRET}) return 401

## Supabase in routes
Use createServerClient() from lib/supabase-server.ts
Never use the browser client (lib/supabase.ts) in API routes.
