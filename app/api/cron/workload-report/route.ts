import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { LoadCategory } from '@/types/database'
import { tashkentMondayOf, tashkentMondayFromDateStr } from '@/lib/time'

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a Date */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Determines which week an entry belongs to.
 * Mirrors original weekStartFromStartDue_():
 *   - Both present, same week  → use that week's Monday
 *   - Both present, diff weeks → use DUE date's Monday
 *   - Only due                 → due's Monday
 *   - Only start               → start's Monday
 *   - Neither                  → null (skip entry)
 *
 * Uses Asia/Tashkent calendar weeks via tashkentMondayFromDateStr so the
 * weekday lookup matches the timezone the rest of the system operates in.
 */
function weekStartFromStartDue(
  startDate: string | null,
  dueDate: string | null
): string | null {
  if (!startDate && !dueDate) return null

  if (startDate && dueDate) {
    const msMonday = tashkentMondayFromDateStr(startDate)
    const mdMonday = tashkentMondayFromDateStr(dueDate)
    // Same week → either; different weeks → prefer due date's week
    return msMonday === mdMonday ? msMonday : mdMonday
  }

  if (dueDate) return tashkentMondayFromDateStr(dueDate)
  return             tashkentMondayFromDateStr(startDate!)
}

/**
 * Generates an array of 12 {weekStart, weekEnd} windows, oldest first.
 * Anchors on the Asia/Tashkent Monday containing `today` so that running the
 * job at Sunday 21:00 UTC (= Monday 02:00 Tashkent) bins entries into the
 * Tashkent week the team just finished.
 */
function build12Weeks(today: Date): Array<{ weekStart: string; weekEnd: string }> {
  const thisMondayStr = tashkentMondayOf(today)
  const thisMonday = new Date(`${thisMondayStr}T00:00:00Z`)
  const weeks: Array<{ weekStart: string; weekEnd: string }> = []

  for (let i = 11; i >= 0; i--) {
    const mon = new Date(thisMonday)
    mon.setUTCDate(thisMonday.getUTCDate() - i * 7)
    const sun = new Date(mon)
    sun.setUTCDate(mon.getUTCDate() + 6)
    weeks.push({ weekStart: toDateStr(mon), weekEnd: toDateStr(sun) })
  }

  return weeks
}

// ─── Calculation helpers ──────────────────────────────────────────────────────

type EntryRow = {
  sprint_task_id: string
  planned_time:   number
  actual_time:    number
  start_date:     string | null
  due_date:       string | null
}

function calcLoadCategory(efficiency: number): LoadCategory {
  if (efficiency < 80)   return 'underloaded'
  if (efficiency < 90)   return 'underperforming'
  if (efficiency <= 110) return 'balanced'
  return 'overloaded'
}

function calcWeek(entries: EntryRow[]): {
  total_planned: number
  total_actual:  number
  efficiency:    number
  load_level:    number
  load_category: LoadCategory
} {
  // total_planned = sum of MAX(planned_time) per sprint_task (mirrors buildWorkloadSpMaxMap_)
  const maxByTask = new Map<string, number>()
  for (const e of entries) {
    const cur = maxByTask.get(e.sprint_task_id) ?? 0
    maxByTask.set(e.sprint_task_id, Math.max(cur, e.planned_time))
  }
  const total_planned = Array.from(maxByTask.values()).reduce((a, b) => a + b, 0)

  // total_actual = raw sum of all actual_time (mirrors buildWorkloadApSumMap_)
  const total_actual = entries.reduce((sum, e) => sum + e.actual_time, 0)

  const efficiency  = total_planned === 0 ? 0
    : Math.round((total_actual / total_planned) * 100 * 100) / 100
  const load_level  = Math.round((total_planned / 60 / 30) * 100 * 100) / 100
  const load_category = calcLoadCategory(efficiency)

  return { total_planned, total_actual, efficiency, load_level, load_category }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST() {
  try {
    const today = new Date()
    const weeks = build12Weeks(today)
    const oldest = weeks[0].weekStart  // earliest week's Monday (YYYY-MM-DD)
    const newest = weeks[weeks.length - 1].weekEnd // latest week's Sunday

    const supabase = createServerClient()

    /**
     * Fetch ALL non-in_progress entries (no date pre-filter).
     * Week assignment uses weekStartFromStartDue() which may assign an entry to
     * the due_date's week — so a start_date pre-filter would miss entries where
     * start_date is null or falls before the window.
     * Mirrors the original which reads all workload data and filters in JS.
     */
    const { data: entries, error: fetchError } = await supabase
      .from('workload_entries')
      .select('sprint_task_id, planned_time, actual_time, start_date, due_date')
      .neq('status', 'in_progress')

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    const allEntries = (entries ?? []) as EntryRow[]

    /**
     * Assign each entry to a week using weekStartFromStartDue logic.
     * Build a map: weekStart (YYYY-MM-DD Monday) → entries for that week.
     */
    const weekMap = new Map<string, EntryRow[]>()

    for (const entry of allEntries) {
      const weekStart = weekStartFromStartDue(entry.start_date, entry.due_date)
      if (!weekStart) continue                      // neither date set → skip
      if (weekStart < oldest || weekStart > newest) continue // outside 12-week window → skip

      if (!weekMap.has(weekStart)) weekMap.set(weekStart, [])
      weekMap.get(weekStart)!.push(entry)
    }

    /**
     * Build upsert rows — only for weeks that have data.
     * Mirrors original: if (!byId || byId.size === 0) continue
     * Empty weeks are skipped entirely, not inserted as 0-value rows.
     */
    const upsertRows: {
      week_start:    string
      week_end:      string
      total_planned: number
      total_actual:  number
      efficiency:    number
      load_level:    number
      load_category: LoadCategory
      generated_at:  string
    }[] = []

    for (const { weekStart, weekEnd } of weeks) {
      const weekEntries = weekMap.get(weekStart)
      if (!weekEntries || weekEntries.length === 0) continue // skip empty weeks

      const calc = calcWeek(weekEntries)
      upsertRows.push({
        week_start:    weekStart,
        week_end:      weekEnd,
        total_planned: calc.total_planned,
        total_actual:  calc.total_actual,
        efficiency:    calc.efficiency,
        load_level:    calc.load_level,
        load_category: calc.load_category,
        generated_at:  new Date().toISOString(),
      })
    }

    if (upsertRows.length === 0) {
      // No data in any week — return existing rows unchanged
      const { data: existing } = await supabase
        .from('workload_reports')
        .select('*')
        .order('week_start', { ascending: true })
      return NextResponse.json({ success: true, data: existing ?? [] })
    }

    const { data: upserted, error: upsertError } = await supabase
      .from('workload_reports')
      .upsert(upsertRows, { onConflict: 'week_start' })
      .select()
      .order('week_start', { ascending: true })

    if (upsertError) {
      return NextResponse.json({ success: false, error: upsertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: upserted })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
