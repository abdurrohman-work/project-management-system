import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onSprintTaskPatched, completeMainTaskIfAllDone } from '@/lib/cascade'
import { recalculateAll } from '@/lib/calculations'
import type { SprintTaskStatus, TaskPriority } from '@/types/database'

const VALID_STATUSES: SprintTaskStatus[] = [
  'not_started', 'in_progress', 'done', 'partly_completed', 'blocked', 'stopped',
]
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const { status, priority, name, blocked_by, link, note } = body

    if (status !== undefined && !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { success: false, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      )
    }

    if (name !== undefined && (typeof name !== 'string' || name.trim() === '')) {
      return NextResponse.json({ success: false, error: 'name cannot be empty' }, { status: 400 })
    }

    const patch: Record<string, unknown> = {}
    if (status !== undefined)    patch.status     = status
    if (priority !== undefined)  patch.priority   = priority
    if (name !== undefined)      patch.name       = name.trim()
    if ('blocked_by' in body)    patch.blocked_by = blocked_by ?? null
    if ('link'       in body)    patch.link       = link       ?? null
    if ('note'       in body)    patch.note       = note       ?? null

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('sprint_tasks')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Sprint task not found' }, { status: 404 })
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Always run cascade side-effects after any patch
    try {
      await onSprintTaskPatched(
        data.id,
        status !== undefined ? (status as SprintTaskStatus) : undefined,
        data.main_task_id,
        supabase
      )
    } catch (cascadeErr) {
      console.error('Cascade error after sprint_task PATCH:', cascadeErr)
    }

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()

    // Fetch main_task_id before deleting (needed for cascade recalculation)
    const { data: task, error: fetchError } = await supabase
      .from('sprint_tasks')
      .select('main_task_id')
      .eq('id', id)
      .single()

    if (fetchError?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Sprint task not found' }, { status: 404 })
    }
    if (fetchError) return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 })

    const { error } = await supabase
      .from('sprint_tasks')
      .delete()
      .eq('id', id)

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Cascade: check done state + recalculate progress/time_spent
    try {
      await completeMainTaskIfAllDone(task.main_task_id, supabase)
      await recalculateAll(task.main_task_id, supabase)
    } catch (cascadeErr) {
      console.error('Cascade error after sprint_task DELETE:', cascadeErr)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
