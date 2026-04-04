# TICKETS.md — Phase 3: UI Rebuild
# Execute in order: 011 → 012 → 013 → 014 → 015 → 016
# Do not skip ahead. Verify each ticket before starting the next.

---

## Ticket 011 — Database: add missing columns + sequential IDs

**Type:** Migration
**Status:** Not started

**Context:**
The current schema is missing columns that exist in the Google Sheets system.
All tables currently use UUID as primary key — the UI needs human-readable IDs
like MT-001, ST-001.

**Build:**
1. Add migration `supabase/migrations/003_add_missing_columns.sql`:
   - Add `mt_number` SERIAL to main_tasks
   - Add `display_id` as generated/computed: 'MT-' || LPAD(mt_number::text, 3, '0')
   - Add `task_owner` text nullable to main_tasks
   - Add `deadline` timestamptz nullable to main_tasks
   - Add `st_number` SERIAL to sprint_tasks
   - Add `display_id` as 'ST-' || LPAD(st_number::text, 3, '0') to sprint_tasks

2. Update `types/database.ts` to include: display_id, task_owner, deadline on MainTask; display_id on SprintTask

3. Update GET /api/main-tasks to include display_id, task_owner, deadline in response
4. Update GET /api/sprint-tasks to include display_id in response
5. Update PATCH /api/main-tasks/[id] to allow setting task_owner and deadline

**Acceptance criteria:**
- [ ] main_tasks rows have display_id like MT-001, MT-002
- [ ] sprint_tasks rows have display_id like ST-001, ST-002
- [ ] task_owner and deadline fields exist on main_tasks and are settable via PATCH
- [ ] TypeScript types include new fields
- [ ] Run migration in Supabase and verify with SELECT * FROM main_tasks LIMIT 1

**Do NOT:** Change the UUID primary keys. display_id is for display only.

---

## Ticket 012 — Dark theme: Tailwind config + Gilroy font + sidebar layout

**Type:** UI Infrastructure
**Status:** Not started

**Design tokens:**
- Font: Gilroy (from https://fonts.cdnfonts.com/css/gilroy-free)
- Background: #18232d
- Sidebar: #111b24
- Accent: #3f9cfb
- Surface (cards/tables): #1e2d3d
- Border: #2a3f52
- Text: #ffffff
- Text muted: rgba(255,255,255,0.6)

**Build:**
1. Update `tailwind.config.js` — add brand color palette
2. Update `app/globals.css`:
   - Import Gilroy font from CDN
   - Set html/body bg to #18232d, font to Gilroy
3. Update `app/layout.tsx` — sidebar layout:
   - Left sidebar: 240px, bg #111b24, fixed height
   - Sidebar logo: "Mohir.dev" text in white, top of sidebar
   - Nav links: Dashboard (/dashboard), Sprint (/sprints), Workload (/workload), Report (/report)
   - Active link: left border 3px #3f9cfb, text white, bg slightly lighter
   - Inactive link: text muted, hover bg #1e2d3d
   - Main content: margin-left 240px, min-height 100vh

**Acceptance criteria:**
- [ ] All pages have dark background #18232d
- [ ] Sidebar visible on all pages
- [ ] Correct link is highlighted when on that page
- [ ] Font is Gilroy (check in browser DevTools)
- [ ] No white/light background anywhere

---

## Ticket 013 — Rebuild Dashboard UI (dark data table)

**Type:** UI rebuild
**Status:** Not started

**Reference:** Google Sheets Dashboard tab — dense data table, dark theme

**Build:**
Completely replace `app/dashboard/page.tsx`:

Top bar:
- Title "Dashboard" left side
- "+ New Task" button right side (bg #3f9cfb, white text)

Summary cards (4, horizontal row):
- Total Tasks / In Progress / Blocked / Done
- bg #1e2d3d, border #2a3f52

Data table:
| Column     | Width  | Notes                                    |
|------------|--------|------------------------------------------|
| ID         | 80px   | display_id (MT-001), monospace font      |
| Task       | flex   | name, left-aligned                       |
| Category   | 120px  | text                                     |
| Status     | 110px  | colored badge                            |
| Priority   | 90px   | colored badge                            |
| Deadline   | 130px  | formatted datetime, dimmed if null       |
| Task Owner | 160px  | email, dimmed if null                    |
| Progress   | 140px  | green bar (#4ade80) + % text             |
| Time Spent | 100px  | minutesToHours() format                  |

Table styles:
- Header: bg #111b24, text rgba(255,255,255,0.5), text-xs uppercase, sticky top
- Rows: bg #18232d, hover bg #1e2d3d, border-bottom 1px #2a3f52
- Selected/active row: left border 3px #3f9cfb

Status badge colors:
- backlog: bg #374151, text #9ca3af
- in_progress: bg #1e3a5f, text #3f9cfb
- blocked: bg #450a0a, text #f87171
- stopped: bg #431407, text #fb923c
- done: bg #052e16, text #4ade80

Priority badge colors:
- low: bg #374151, text #9ca3af
- medium: bg #1e3a5f, text #60a5fa
- high: bg #431407, text #fb923c
- critical: bg #450a0a, text #f87171

**Acceptance criteria:**
- [ ] All columns visible
- [ ] Dark theme — no light elements
- [ ] Status and priority badges correctly colored
- [ ] Progress bar green with %
- [ ] Creating a task works without page reload
- [ ] Horizontal scroll on mobile

---

## Ticket 014 — Rebuild Sprint View UI (dark grouped table)

**Type:** UI rebuild
**Status:** Not started

**Reference:** Google Sheets Sprint tab — subtasks grouped by main task

**Build:**
Completely replace `app/sprints/page.tsx`:

Top bar:
- "Sprint N — [date range]" title
- Active sprint loaded from GET /api/sprints/active

Groups (one per main task that has sprint_tasks in active sprint):
- Group header row: bg #111b24, shows MT display_id + task name + status badge + mini progress bar
- Click header to collapse/expand group
- Sprint task rows inside group: bg #18232d, hover #1e2d3d

Sprint task row columns:
| ST ID | Task Name | Status (dropdown) | Priority | Blocked By | Note |

- Status is a dropdown — change inline, calls PATCH /api/sprint-tasks/[id]
- Expanding a row shows workload_entry details: SP, AP, start date, due date
- "Add subtask" button at bottom of each group

**Acceptance criteria:**
- [ ] Groups collapse and expand
- [ ] ST-001 IDs visible
- [ ] Status changes inline
- [ ] Workload entry details expand inline
- [ ] Dark theme throughout

---

## Ticket 015 — Build Workload View (new page)

**Type:** New page
**Status:** Not started

**Reference:** Google Sheets Workload tab — time tracking with SP/AP

**Build:**
Create `app/workload/page.tsx` and `app/api/workload-entries/list/route.ts`

API route `GET /api/workload-entries/list`:
- Returns workload_entries joined with sprint_task name and main_task display_id
- Optional query params: ?status=&start_after=&start_before=
- Ordered by start_date DESC

Page `app/workload/page.tsx`:
Table columns:
| ST ID | Task Name | Status | Priority | Start Date | Due Date | SP (h) | AP (h) | MT ID |

- SP and AP shown in hours using minutesToHours()
- SP and AP are editable inline — click to edit, saves on blur via PATCH
- Saving SP or AP triggers workload entry update → cascade recalculates main task progress
- Filter bar: status dropdown, date range pickers for start date
- Default sort: start_date DESC

**Acceptance criteria:**
- [ ] Page loads at /workload
- [ ] SP and AP editable inline
- [ ] Editing SP/AP calls PATCH and updates correctly
- [ ] Status filter works
- [ ] Dark theme throughout

---

## Ticket 016 — Build Workload Report with charts

**Type:** New page + API
**Status:** Not started

**Reference:** Google Sheets Workload Report tab — table + line chart + pie chart

**Build:**
Install: `npm install recharts`

API `POST /api/reports/generate`:
- Look back 12 weeks from today
- For each week (Monday to Sunday):
  - Find all workload_entries where start_date falls in that week
  - Skip entries with status 'in_progress' (only count done/halted)
  - total_planned = sum of MAX planned_time per sprint_task (in minutes)
  - total_actual = raw sum of all actual_time (in minutes)
  - efficiency = (total_actual / total_planned) * 100, rounded to 2dp
  - load_level = (total_planned_minutes / 60 / 30) * 100, rounded to 2dp
  - load_category = underloaded (<80% efficiency) / underperforming (<90%) / balanced (90-110%) / overloaded (>110%)
- Upsert into workload_reports (UNIQUE week_start prevents duplicates)
- Returns all generated rows

Page `app/report/page.tsx`:
- "Generate Report" button → POST /api/reports/generate → refresh data
- Table: # | Period | Total SP (h) | Total AP (h) | Efficiency % | Load % | Load Level badge
- Period format: "Jan 12-18", "Feb 2-8"
- Load Level badges: balanced=green, underperforming=yellow, underloaded=gray, overloaded=red
- Recharts LineChart below table:
  - X axis: period labels
  - Line 1: Efficiency % — color #3f9cfb (blue)
  - Line 2: Load % — color #f87171 (red)
  - Legend, tooltip, grid lines

**Acceptance criteria:**
- [ ] Generate button creates report rows
- [ ] Table shows correctly formatted data
- [ ] Load Level badges correctly colored
- [ ] Line chart renders with both lines
- [ ] Chart is responsive width
- [ ] Dark theme throughout

---

## Session starter (use at beginning of every Claude Code session)

```
Read CLAUDE.md and TICKETS.md.
We are working on Phase 3 UI rebuild — tickets 011 through 016.
Tell me which ticket is next (first one not marked done).
Plan it fully. Wait for my approval. Build. Commit and push to main.
```
