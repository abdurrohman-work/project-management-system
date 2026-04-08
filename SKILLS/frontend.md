# SKILLS/frontend.md
# Role: frontend-developer
# Read this before any UI page or component work.

## Your responsibility
UI pages, components, data fetching, interactivity.
You do NOT touch lib/cascade.ts, lib/calculations.ts, or any API route files.
You do NOT change database schema or migrations.

## Design tokens — use these exact values
Background:  #18232d
Sidebar:     #111b24
Accent:      #3f9cfb
Surface:     #1e2d3d
Border:      #2a3f52
Text:        #ffffff
Muted:       rgba(255,255,255,0.6)
Progress:    #4ade80
Font:        Gilroy

## Status badge colors — exact
backlog:          bg-[#374151] text-[#9ca3af]
in_progress:      bg-[#1e3a5f] text-[#3f9cfb]
blocked:          bg-[#450a0a] text-[#f87171]
stopped:          bg-[#431407] text-[#fb923c]
done:             bg-[#052e16] text-[#4ade80]
not_started:      bg-[#374151] text-[#9ca3af]
partly_completed: bg-[#3b2f04] text-[#fbbf24]

## Priority badge colors — exact
low:      bg-[#374151] text-[#9ca3af]
medium:   bg-[#1e3a5f] text-[#60a5fa]
high:     bg-[#431407] text-[#fb923c]
critical: bg-[#450a0a] text-[#f87171]

## Table structure — always
- Header: bg-[#111b24], text-xs uppercase, muted color, sticky top-0
- Rows: bg-[#18232d], hover:bg-[#1e2d3d], border-b border-[#2a3f52]
- All tables horizontally scrollable on mobile (overflow-x-auto)
- Minimum column widths to prevent text squishing

## Time display — always use lib/time.ts
import { minutesToHours } from '@/lib/time'
Display: minutesToHours(dbValueInMinutes) → "1h 30m"
Never show raw minutes to the user.

## Display IDs — from database
Use display_id (MT-001, ST-001) for showing in UI.
Never show raw UUIDs.

## Loading states — always required
Every data-fetching page must have a loading skeleton.
Use animate-pulse with bg-[#1e2d3d] placeholder bars.
Never show blank white space while loading.

## Empty states — always required
Every list/table must have an empty state message.
Include a small description and a call-to-action button.
Example: "No tasks yet. Create your first task."

## Error states — always required
If API call fails, show an error message in red text.
Never silently fail. Never show a blank screen on error.

## Inline editing pattern
Click on a cell → input appears with current value
Blur or Enter → call PATCH API → update local state
Show saving indicator while request is in progress
Revert to original value if request fails

## Client components rule
Pages that use useState, useEffect, onClick, onChange must have "use client" at the top.
Pages that only display server-fetched data can be Server Components (no directive needed).

## API calls from UI — always handle errors
const { data, error } = await supabase.from(...)
if (error) { setError(error.message); return; }

## No hardcoded data
Never hardcode task names, emails, or IDs in UI components.
All data comes from API calls or props.
