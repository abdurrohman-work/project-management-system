# SESSION.md — Live Project State
# Claude Code reads this at the START of every session.
# Claude Code updates this at the END of every session.
# Newest session always goes at the TOP.

---

## CURRENT STATE (update this block every session)

Last session date: April 17, 2026
Last completed work: QA audit of live app — found 9 bugs across all 4 pages
Next task: Fix 6 bugs from QA report using 2 parallel subagents

---

## WHAT IS WORKING ✅

- Dashboard (/dashboard): loads, shows tasks, search works, filters work
- Workload (/workload): loads, filters work, SP/AP editable inline
- Report (/report): loads, Generate Report button works, chart renders
- AI Agent: floating button works, canvas waves work, voice recording works
- All API routes: main-tasks, sprint-tasks, workload-entries, sprints, reports
- Cascade logic: lib/cascade.ts all 5 rules implemented
- Calculations: lib/calculations.ts weighted progress + time_spent
- Sprint rollover cron: app/api/cron/sprint-rollover/route.ts
- Database: all 6 tables, migrations 001-004 applied in Supabase
- Deployment: live at project-management-system-xi-flame.vercel.app
- GitHub: all code on main branch at abdurrohman-work/project-management-system

---

## KNOWN BUGS 🔴 (from QA audit April 17)

| # | Bug | Page | Priority |
|---|-----|------|----------|
| 1 | Sprint page completely blank | /sprints | Critical |
| 2 | AI agent "00:00 SEND" visible when closed | All pages | Critical |
| 3 | Metric cards not rendering | /dashboard | Critical |
| 4 | SP/AP shows "(min)" not "(h)" | /workload | Important |
| 5 | Task count badge shows "…" | /dashboard | Important |
| 6 | Root URL "/" shows Next.js default page | / | Important |
| 7 | Sprint nav item has no active highlight | /sprints | Minor |
| 8 | Report empty state missing | /report | Minor |
| 9 | Workload has no Clear filters button | /workload | Minor |

---

## PENDING WORK 📋

- [ ] Fix 9 bugs from QA report
- [ ] Run migration 004 in Supabase (if not done)
- [ ] Add CRON_SECRET to Vercel environment variables
- [ ] Test AI agent with real team members
- [ ] Switch AI agent from Groq Llama to Claude Haiku

---

## WHAT NOT TO TOUCH ⚠️

- lib/cascade.ts — fragile, all 5 rules working, do not refactor
- lib/calculations.ts — weighted progress formula is correct, do not change
- supabase/migrations/ — never edit existing migration files
- vercel.json — cron UTC offsets are correct for Asia/Tashkent

---

## TECH STACK

- Next.js 14 App Router, TypeScript strict
- Supabase PostgreSQL
- Tailwind CSS v3, brand colors: bg=#18232d accent=#3f9cfb
- Vercel deployment
- Groq API (Whisper for voice, Llama for AI agent chat)
- Recharts for workload report charts

---

## SESSION HISTORY

### Session — April 17, 2026
- QA audit of live app: found 9 bugs
- Updated AI agent system prompt to v2
- Added Caveman skill (manual install)
- Wrote session continuity system

### Session — April 5, 2026
- Completed all 4 bug fixes from Apps Script analysis
- Added missing columns (taken_at, blocked_by, link, note) via migration 004
- Deployed to Vercel — app is live

### Session — April 4, 2026
- Completed tickets 011-016 (Phase 3 UI rebuild)
- Dark theme, Gilroy font, sidebar navigation
- All 4 views rebuilt: Dashboard, Sprint, Workload, Report
- Recharts line chart in report

### Session — April 3, 2026
- Completed tickets 001-010 (Phase 1 + 2)
- Full database schema, all API routes
- Cascade logic and calculations
- TypeScript fix for Supabase client typing

