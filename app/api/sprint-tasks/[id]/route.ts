import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onSprintTaskPatched } from '@/lib/cascade'
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

    const { status, priority, name } = body

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
    if (status !== undefined) patch.status = status
    if (priority !== undefined) patch.priority = priority
    if (name !== undefined) patch.name = name.trim()

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

    // Run cascade side-effects (non-blocking — errors logged, not surfaced)
    if (status !== undefined) {
      try {
        await onSprintTaskPatched(data.id, status as SprintTaskStatus, data.main_task_id, supabase)
      } catch (cascadeErr) {
        console.error('Cascade error after sprint_task PATCH:', cascadeErr)
      }
    }

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
