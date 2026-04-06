import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onMainTaskStatusChanged } from '@/lib/cascade'
import type { MainTaskStatus, TaskPriority } from '@/types/database'

const VALID_STATUSES: MainTaskStatus[] = ['backlog', 'in_progress', 'blocked', 'stopped', 'done']
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('main_tasks')
      .select('*')
      .eq('id', id)
      .single()

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    if ('progress' in body || 'time_spent' in body) {
      return NextResponse.json(
        { success: false, error: 'progress and time_spent are calculated fields and cannot be set directly' },
        { status: 400 }
      )
    }

    const { name, status, category, priority, taken_at, blocked_by, link, note, deadline, task_owner } = body

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
    if (name !== undefined)       patch.name       = name.trim()
    if (status !== undefined)     patch.status     = status
    if ('category'  in body)      patch.category   = category  ?? null
    if (priority !== undefined)   patch.priority   = priority
    if ('taken_at'   in body)     patch.taken_at   = taken_at    ?? null
    if ('blocked_by' in body)     patch.blocked_by = blocked_by  ?? null
    if ('link'       in body)     patch.link       = link        ?? null
    if ('note'       in body)     patch.note       = note        ?? null
    if ('deadline'   in body)     patch.deadline   = deadline    ?? null
    if ('task_owner' in body)     patch.task_owner = task_owner  ?? null

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, error: 'No valid fields to update' }, { status: 400 })
    }

    const supabase = createServerClient()

    // Fetch current status before patching (needed for cascade prevStatus)
    let prevStatus: MainTaskStatus | undefined
    if (status !== undefined) {
      const { data: current, error: fetchErr } = await supabase
        .from('main_tasks')
        .select('status')
        .eq('id', id)
        .single()

      if (fetchErr?.code === 'PGRST116') {
        return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
      }
      if (fetchErr) return NextResponse.json({ success: false, error: fetchErr.message }, { status: 500 })
      prevStatus = current.status
    }

    const { data, error } = await supabase
      .from('main_tasks')
      .update(patch)
      .eq('id', id)
      .select()
      .single()

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Run status cascade side-effects
    if (status !== undefined && prevStatus !== undefined && status !== prevStatus) {
      try {
        await onMainTaskStatusChanged(id, status as MainTaskStatus, prevStatus, supabase)
      } catch (cascadeErr) {
        console.error('Cascade error after main_task PATCH:', cascadeErr)
      }
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

    const { error } = await supabase
      .from('main_tasks')
      .delete()
      .eq('id', id)
      .select()
      .single()

    if (error?.code === 'PGRST116') {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
