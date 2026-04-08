# SKILLS/database.md
# Role: database-developer
# Read this file before any database or migration task.

## Your role
You write SQL migrations and design schema changes.
You never touch UI files, API routes, or app logic.
You verify migrations ran correctly by querying the database.

## Migration rules
- Every schema change = new file: supabase/migrations/00N_description.sql
- Never modify existing migration files
- Always use IF NOT EXISTS / IF EXISTS for safety
- Always add a comment at the top explaining the migration
- Number sequentially: 001, 002, 003, 004, 005...
- After writing: remind user to run it manually in Supabase SQL Editor

## File naming
```
001_initial_schema.sql
002_sprint_task_status_blocked_stopped.sql
003_add_missing_columns.sql
004_add_remaining_columns.sql
005_next_change.sql  ← next one to write
```

## Schema conventions
Primary keys: uuid, default gen_random_uuid()
Timestamps: timestamptz with default now()
Soft deletes: NOT used — hard delete with CASCADE
All foreign keys have ON DELETE CASCADE unless specified
All text fields: nullable unless explicitly required

## Display IDs
main_tasks: mt_number SERIAL → display_id = 'MT-' || LPAD(mt_number::text, 3, '0')
sprint_tasks: st_number SERIAL → display_id = 'ST-' || LPAD(st_number::text, 3, '0')
Never change UUID primary keys — display_id is display only.

## Time storage
All time values: INTEGER (minutes)
Never: DECIMAL, FLOAT, VARCHAR for time
Never store hours — always minutes

## Enum types (never change existing values)
main_task_status:   backlog, in_progress, blocked, stopped, done
sprint_task_status: not_started, in_progress, done, partly_completed, blocked, stopped
workload_status:    not_started, in_progress, done, halted
task_priority:      low, medium, high, critical
sprint_status:      active, archived
load_category:      underloaded, underperforming, balanced, overloaded

Adding new enum values requires ALTER TYPE — always check if the value already exists first.

## Index guidelines
Always index:
- Foreign keys (all of them)
- Status columns on large tables
- Date columns used in range queries (start_date, due_date, week_start)
- Composite index on (main_task_id, sprint_id) for sprint_tasks

## Verification queries
After every migration, write verification queries to confirm:
```sql
-- Check new column exists
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'table_name' AND column_name = 'new_column';

-- Check enum value exists
SELECT enumlabel FROM pg_enum 
JOIN pg_type ON pg_enum.enumtypid = pg_type.oid 
WHERE pg_type.typname = 'enum_type_name';

-- Check index exists
SELECT indexname FROM pg_indexes 
WHERE tablename = 'table_name' AND indexname = 'index_name';
```

## workload_reports is append-only
Never write UPDATE or DELETE statements for workload_reports.
If a correction is needed, insert a new row — do not modify existing ones.
