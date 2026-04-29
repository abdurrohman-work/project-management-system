import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onWorkloadEntryChanged } from '@/lib/cascade'
import type { WorkloadStatus } from '@/types/database'

const VALID_STATUSES: WorkloadStatus[] = [
  'not_started', 'in_progress', 'done', 'stopped', 'blocked',
]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sprint_task_id,
      status,
      start_date,
      due_date,
      planned_time,
      actual_time,
    } = body

    if (!sprint_task_id || typeof sprint_task_id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'sprint_task_id is required' },
        { status: 400 }
      )
    }

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

    const supabase = createServerClient()

    // Resolve parent main_task_id for cascade
    const { data: sprintTask, error: fetchError } = await supabase
      .from('sprint_tasks')
      .select('main_task_id')
      .eq('id', sprint_task_id)
      .single()

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, error: 'sprint_task_id does not match any sprint_task' },
          { status: 400 }
        )
      }
      return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })
    }

    const finalStatus: WorkloadStatus = (status as WorkloadStatus | undefined) ?? 'not_started'

    const { data, error } = await supabase
      .from('workload_entries')
      .insert({
        sprint_task_id,
        status:       finalStatus,
        start_date:   start_date   ?? null,
        due_date:     due_date     ?? null,
        planned_time: planned_time !== undefined ? Math.round(planned_time) : 0,
        actual_time:  actual_time  !== undefined ? Math.round(actual_time)  : 0,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Cascade: propagate status to sprint_task + recalculate progress/time_spent
    try {
      await onWorkloadEntryChanged(
        sprintTask.main_task_id as string,
        supabase,
        sprint_task_id,
        finalStatus,
      )
    } catch (cascadeErr) {
      console.error('Cascade error after workload_entry POST:', cascadeErr)
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
