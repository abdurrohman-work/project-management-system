import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { SprintTaskStatus } from '@/types/database'
import { recalculateAll } from '@/lib/calculations'

// ─── Monday helper ────────────────────────────────────────────────────────────

/** Returns { monday, sunday } as YYYY-MM-DD strings for the week containing `d` (UTC). */
function weekBoundsOf(d: Date): { monday: string; sunday: string } {
  const day  = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  const mon  = new Date(d)
  mon.setUTCDate(d.getUTCDate() + diff)
  mon.setUTCHours(0, 0, 0, 0)
  const sun = new Date(mon)
  sun.setUTCDate(mon.getUTCDate() + 6)
  return {
    monday: mon.toISOString().slice(0, 10),
    sunday: sun.toISOString().slice(0, 10),
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Verify Vercel cron secret (CRON_SECRET env var must match Authorization header)
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = request.headers.get('Authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const supabase = createServerClient()

    // ── 1. Find the active sprint ─────────────────────────────────────────────
    const { data: activeSprint, error: sprintError } = await supabase
      .from('sprints')
      .select('*')
      .eq('status', 'active')
      .maybeSingle()

    if (sprintError) {
      return NextResponse.json({ success: false, error: sprintError.message }, { status: 500 })
    }

    if (!activeSprint) {
      // Nothing to do — no active sprint
      return NextResponse.json({ success: true, data: { message: 'No active sprint found — rollover skipped' } })
    }

    // ── 2. Get all non-done sprint_tasks in the active sprint ─────────────────
    const { data: sprintTasks, error: tasksError } = await supabase
      .from('sprint_tasks')
      .select('*')
      .eq('sprint_id', activeSprint.id)
      .neq('status', 'done')

    if (tasksError) {
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 })
    }

    const tasksToRollover = sprintTasks ?? []

    // ── 3. Create the new sprint (starts this Monday) ─────────────────────────
    const today = new Date()
    const { monday: thisMonday } = weekBoundsOf(today)
    const startDate = new Date(thisMonday + 'T00:00:00Z')
    const endDate = new Date(startDate)
    endDate.setUTCDate(startDate.getUTCDate() + 6)

    const newSprintNumber = activeSprint.sprint_number + 1

    const { data: newSprint, error: newSprintError } = await supabase
      .from('sprints')
      .insert({
        sprint_number: newSprintNumber,
        name:          `Sprint ${newSprintNumber}`,
        start_date:    startDate.toISOString().slice(0, 10),
        end_date:      endDate.toISOString().slice(0, 10),
        status:        'active',
      })
      .select()
      .single()

    if (newSprintError) {
      return NextResponse.json({ success: false, error: newSprintError.message }, { status: 500 })
    }

    // ── 4. Roll over non-done tasks into the new sprint (always not_started) ──
    if (tasksToRollover.length > 0) {
      const inserts = tasksToRollover.map((t) => ({
        main_task_id:     t.main_task_id,
        sprint_id:        newSprint.id,
        name:             t.name,
        priority:         t.priority,
        status:           'not_started' as SprintTaskStatus,
        rolled_over_from: t.id,
        blocked_by:       t.blocked_by   ?? null,
        link:             t.link         ?? null,
        note:             t.note         ?? null,
      }))

      const { error: insertError } = await supabase
        .from('sprint_tasks')
        .insert(inserts)

      if (insertError) {
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
      }

      // ── 5. Update OLD sprint task statuses ──────────────────────────────────
      // not_started → stays not_started; in_progress/blocked/stopped → partly_completed
      const idsToMark = tasksToRollover
        .filter((t) => t.status !== 'not_started')
        .map((t) => t.id)

      if (idsToMark.length > 0) {
        const { error: updateError } = await supabase
          .from('sprint_tasks')
          .update({ status: 'partly_completed' as SprintTaskStatus })
          .in('id', idsToMark)

        if (updateError) {
          return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
        }
      }
    }

    // ── 6. Archive the old sprint ─────────────────────────────────────────────
    const { error: archiveError } = await supabase
      .from('sprints')
      .update({ status: 'archived' })
      .eq('id', activeSprint.id)

    if (archiveError) {
      return NextResponse.json({ success: false, error: archiveError.message }, { status: 500 })
    }

    // ── 7. Recalculate progress/time_spent for affected main tasks ────────────
    const affectedMainTaskIds = Array.from(
      new Set(tasksToRollover.map((t) => t.main_task_id as string))
    )
    for (const mtId of affectedMainTaskIds) {
      await recalculateAll(mtId, supabase)
    }

    return NextResponse.json({
      success: true,
      data: {
        archived_sprint:   activeSprint.name,
        new_sprint:        newSprint.name,
        rolled_over_tasks: tasksToRollover.length,
      },
    })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
