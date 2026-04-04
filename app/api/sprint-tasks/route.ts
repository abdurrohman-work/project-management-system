import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import { onSprintTaskCreated } from '@/lib/cascade'
import type { TaskPriority } from '@/types/database'

const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { main_task_id, sprint_id, name, priority } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
    }
    if (!main_task_id || typeof main_task_id !== 'string') {
      return NextResponse.json({ success: false, error: 'main_task_id is required' }, { status: 400 })
    }
    if (!sprint_id || typeof sprint_id !== 'string') {
      return NextResponse.json({ success: false, error: 'sprint_id is required' }, { status: 400 })
    }
    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { success: false, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('sprint_tasks')
      .insert({
        main_task_id,
        sprint_id,
        name: name.trim(),
        priority: priority ?? 'medium',
        status: 'not_started',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Run cascade side-effects
    try {
      await onSprintTaskCreated(data.id, data.main_task_id, supabase)
    } catch (cascadeErr) {
      console.error('Cascade error after sprint_task POST:', cascadeErr)
    }

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
