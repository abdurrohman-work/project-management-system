import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { LoadCategory } from '@/types/database'

// ─── Week helpers ─────────────────────────────────────────────────────────────

/** Returns YYYY-MM-DD string for a Date */
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Returns Monday (start) of the week containing `d` */
function getMondayOf(d: Date): Date {
  const day = d.getUTCDay() // 0=Sun, 1=Mon, …
  const diff = day === 0 ? -6 : 1 - day
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diff)
  mon.setUTCHours(0, 0, 0, 0)
  return mon
}

/** Generates an array of 12 {weekStart, weekEnd} windows, oldest first */
function build12Weeks(today: Date): Array<{ weekStart: string; weekEnd: string }> {
  const thisMonday = getMondayOf(today)
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
  start_date:     string
}

function calcLoadCategory(efficiency: number): LoadCategory {
  if (efficiency < 80)  return 'underloaded'
  if (efficiency < 90)  return 'underperforming'
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
  // total_planned = sum of MAX(planned_time) per sprint_task
  const maxByTask = new Map<string, number>()
  for (const e of entries) {
    const cur = maxByTask.get(e.sprint_task_id) ?? 0
    maxByTask.set(e.sprint_task_id, Math.max(cur, e.planned_time))
  }
  const total_planned = Array.from(maxByTask.values()).reduce((a, b) => a + b, 0)

  // total_actual = raw sum of all actual_time
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
    const today  = new Date()
    const weeks  = build12Weeks(today)
    const oldest = weeks[0].weekStart

    const supabase = createServerClient()

    // Fetch all relevant entries in the 12-week window (done/halted only)
    const { data: entries, error: fetchError } = await supabase
      .from('workload_entries')
      .select('sprint_task_id, planned_time, actual_time, start_date')
      .gte('start_date', oldest)
      .in('status', ['done', 'halted'])
      .not('start_date', 'is', null)

    if (fetchError) {
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    const allEntries = (entries ?? []) as EntryRow[]

    // Build upsert rows for each week
    const upsertRows = weeks.map(({ weekStart, weekEnd }) => {
      const weekEntries = allEntries.filter(
        (e) => e.start_date >= weekStart && e.start_date <= weekEnd
      )
      const calc = calcWeek(weekEntries)
      return {
        week_start:    weekStart,
        week_end:      weekEnd,
        total_planned: calc.total_planned,
        total_actual:  calc.total_actual,
        efficiency:    calc.efficiency,
        load_level:    calc.load_level,
        load_category: calc.load_category,
        generated_at:  new Date().toISOString(),
      }
    })

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
