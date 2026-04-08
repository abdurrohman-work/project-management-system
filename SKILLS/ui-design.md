# SKILLS/ui-design.md
# Role: ui-designer
# Read this before any visual design, layout, or UX improvement work.

## Your responsibility
Visual design, layout, spacing, typography, animations, user experience.
You write Tailwind CSS classes and small style improvements.
You do NOT touch lib/ files, API routes, or database files.
You do NOT change business logic — only how things look and feel.

## The visual goal
The app should feel like a professional internal tool used by a real team.
Reference: ds.mohirdev.uz — dense, dark, data-focused, no wasted space.
NOT a generic SaaS with big cards and lots of padding.

## Brand identity
Font: Gilroy — modern, clean, professional
Primary color: #3f9cfb — used sparingly for actions and highlights
Background: #18232d — deep navy, not pure black
Everything else: shades of the background, slightly lighter for surfaces

## Spacing philosophy
Comfortable but dense. Not cramped, not spacious.
Table rows: py-2.5 px-3 (not too tall, not too tight)
Section gaps: space-y-4 or space-y-6
Card padding: p-4 or p-5

## Typography scale
Page title: text-xl font-semibold text-white
Section header: text-sm font-medium text-white
Table header: text-xs font-medium uppercase tracking-wider text-[rgba(255,255,255,0.5)]
Table cell: text-sm text-white
Muted text: text-sm text-[rgba(255,255,255,0.6)]
Tiny label: text-xs text-[rgba(255,255,255,0.4)]

## What good UX looks like in this app

### Hover states
Every clickable row has hover:bg-[#1e2d3d]
Every button has a clear hover state
Every link shows a subtle underline or color change on hover

### Transitions
All hover state changes: transition-colors duration-150
Expanding rows: transition-all duration-200
No jarring instant changes

### Tooltips
Truncated text always has a title attribute showing the full text
Action buttons have tooltips explaining what they do
Status badges have tooltips on hover

### Progress bars
Height: 6px, rounded-full
Green fill: bg-[#4ade80]
Background track: bg-[#2a3f52]
Show percentage as text after the bar

### Badges (status and priority)
Rounded: rounded-full
Padding: px-2 py-0.5
Font: text-xs font-medium
Dot before text for status: a 6px circle in the same color

### Empty states
Icon (SVG, not emoji): 32px, muted color
Title: text-sm font-medium text-white
Description: text-xs text-muted, one line
Action button: small, accent color

### Loading skeletons
Use animate-pulse
Bars match the shape of the content they replace
Background: bg-[#1e2d3d]
Rounded: same border radius as the real content

### Forms and modals
Input fields: bg-[#111b24] border border-[#2a3f52] text-white
Focus: border-[#3f9cfb] ring-0 outline-none
Placeholder: text-[rgba(255,255,255,0.3)]
Labels: text-xs text-[rgba(255,255,255,0.6)] mb-1

### Action buttons
Primary: bg-[#3f9cfb] text-white hover:bg-[#2d8ae8]
Secondary: bg-transparent border border-[#2a3f52] text-white hover:bg-[#1e2d3d]
Danger: bg-transparent border border-[#450a0a] text-[#f87171] hover:bg-[#450a0a]
Size: text-sm px-3 py-1.5 rounded-md

## What NOT to do
- No white backgrounds anywhere
- No rounded-xl or rounded-2xl on table rows (use rounded-md at most)
- No drop shadows (flat design)
- No gradients except in charts
- No emojis in the UI (use SVG icons)
- No large padding (this is a dense data tool, not a marketing page)
- No centered layouts for data tables (left-aligned always)
