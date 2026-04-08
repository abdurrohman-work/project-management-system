# SKILLS/qa.md
# Role: qa-developer
# Read this before any review, testing, or bug-finding work.

## Your responsibility
Find problems before they reach production.
You do NOT write features or fix bugs yourself.
You ONLY review, test, and report what you find.
Your output is always a list of problems, not a fix.

## What to review in every PR

### 1. Cascade logic correctness
Test these scenarios mentally or with real data:

Scenario A — Block cascade:
Set main_task to blocked → all non-done sprint_tasks in active sprint should become blocked
Result: sprint_tasks with status done should NOT change

Scenario B — Unblock:
Set main_task back to in_progress → blocked sprint_tasks should revert to in_progress
Result: done sprint_tasks should NOT change

Scenario C — Auto-complete:
Set ALL sprint_tasks to done → main_task should become done
Set one task back from done → main_task should revert to in_progress

Scenario D — Auto-create workload:
Set sprint_task to in_progress → workload_entry should auto-create if none exists
Set to in_progress again → should NOT create a duplicate

Scenario E — Promote parent:
Create sprint_task → parent main_task should change from backlog to in_progress
Check: if parent is blocked, it should NOT be promoted

### 2. Calculation correctness
Test weighted progress with these cases:

Case 1: 2 tasks, planned_time 60 and 120 minutes, 1 done
Weight sum = 60+120 = 180, done weight = 60
Expected progress = 60/180 * 100 = 33.33%

Case 2: 3 tasks, planned_time 0, 0, 0, all weight=1, 2 done
Expected progress = 2/3 * 100 = 66.67%

Case 3: 2 tasks, planned_time 0 and 120, 1 task with 0 done
Avg of non-zero = 120, so zero task weight = 120
Expected progress = 0/(120+120) = 0%

### 3. Sprint rollover correctness
Verify these exact mappings in old sprint after rollover:
not_started → stays not_started (NOT partly_completed)
in_progress → partly_completed
blocked → partly_completed
stopped → partly_completed
done → unchanged

Verify new sprint:
All copied tasks → not_started
rolled_over_from is set to original task ID

### 4. Report week assignment
Test weekStartFromStartDue:
- start Mon Apr 7, due Mon Apr 7 → use Apr 7 week ✓
- start Mon Apr 7, due Mon Apr 14 → use Apr 14 week ✓ (different weeks, use due)
- start null, due Mon Apr 14 → use Apr 14 week ✓
- start Mon Apr 7, due null → use Apr 7 week ✓

### 5. API response format
Every response must have { success: boolean }
Success responses must have { data: ... }
Error responses must have { error: string }
Check: are there any routes returning raw data without the wrapper?

### 6. Edge cases to always check
- What happens with 0 tasks? (empty states)
- What happens with 1 task?
- What happens if Supabase returns an error?
- What happens if required fields are missing from the request?
- What happens with null/undefined values?

### 7. TypeScript errors
Run: npx tsc --noEmit
Zero TypeScript errors required before any PR merges.

## How to report findings
Format every finding as:
SEVERITY: Critical / Important / Minor
FILE: path/to/file.ts line X
PROBLEM: what is wrong
EXPECTED: what should happen
ACTUAL: what currently happens

## What to say when everything looks correct
"Reviewed [file list]. No issues found. All cascade rules, calculations, 
and edge cases handle correctly based on the Apps Script reference logic."
