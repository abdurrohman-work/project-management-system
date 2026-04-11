import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onWorkloadEntryChanged } from '@/lib/cascade'
import type { WorkloadStatus } from '@/types/database'

const VALID_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'stopped', 'blocked']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { planned_time, actual_time, start_date, due_date, status } = body

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    if (planned_time !== undefined && (typeof planned_time !== 'number' || planned_time < 0)) {
      return NextResponse.json(
        { success: false, error: 'planned_time must be a non-negative number (minutes)' },
        { status: 400 }
      )
    }

    if (actual_time !== undefined && (typeof actual_time !== 'number' || actual_time < 0)) {
      return NextResponse.json(
        { success: false, error: 'actual_time must be a non-negative number (minutes)' },
        { status: 400 }
      )
    }

    const patch: Record<string, unknown> = {}
    if (planned_time !== undefined)      patch.planned_time = Math.round(planned_time)
    if (actual_time  !== undefined)      patch.actual_time  = Math.round(actual_time)
    if ('start_date' in body)            patch.start_date   = start_date ?? null
    if ('due_date'   in body)            patch.due_date     = due_date   ?? null
    if (status       !== undefined)      patch.status       = status

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('workload_entries')
      .update(patch)
      .eq('id', id)
      .select('*, sprint_tasks(main_task_id)')
      .single()

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Workload entry not found' }, { status: 404 })
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Cascade: propagate status to sprint_task (Rule F) + recalculate progress/time_spent
    const mainTaskId = (data as unknown as { sprint_tasks: { main_task_id: string } }).sprint_tasks.main_task_id
    try {
      await onWorkloadEntryChanged(
        mainTaskId,
        supabase,
        data.sprint_task_id,
        status !== undefined ? (status as WorkloadStatus) : undefined,
      )
    } catch (cascadeErr) {
      console.error('Cascade error after workload_entry PATCH:', cascadeErr)
    }

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
