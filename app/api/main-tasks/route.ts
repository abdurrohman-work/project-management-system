import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { MainTaskStatus, TaskPriority } from '@/types/database'

const VALID_STATUSES: MainTaskStatus[] = ['backlog', 'in_progress', 'blocked', 'stopped', 'done']
const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

export async function GET() {
  try {
    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('main_tasks')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, category, priority, taken_at, deadline, task_owner, note, blocked_by } = body

    if (!name || typeof name !== 'string' || name.trim() === '') {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 })
    }

    if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
      return NextResponse.json(
        { success: false, error: `priority must be one of: ${VALID_PRIORITIES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const { data, error } = await supabase
      .from('main_tasks')
      .insert({
        name:       name.trim(),
        category:   category   ?? null,
        priority:   priority   ?? 'medium',
        taken_at:   taken_at   ?? null,
        deadline:   deadline   ?? null,
        task_owner: task_owner ?? null,
        note:       note       ?? null,
        blocked_by: blocked_by ?? null,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, data }, { status: 201 })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
