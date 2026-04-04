import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { WorkloadStatus } from '@/types/database'

const VALID_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'halted']

// Shape of each row returned by the nested select
type RawRow = {
  id: string
  status: WorkloadStatus
  planned_time: number
  actual_time: number
  start_date: string | null
  due_date: string | null
  created_at: string
  updated_at: string
  sprint_task_id: string
  sprint_tasks: {
    name: string
    display_id: string
    priority: string
    main_task_id: string
    main_tasks: {
      display_id: string
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status      = searchParams.get('status')
    const startAfter  = searchParams.get('start_after')
    const startBefore = searchParams.get('start_before')

    if (status && !VALID_STATUSES.includes(status as WorkloadStatus)) {
      return NextResponse.json(
        { success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    let query = supabase
      .from('workload_entries')
      .select('*, sprint_tasks(name, display_id, priority, main_task_id, main_tasks(display_id))')
      .order('start_date', { ascending: false, nullsFirst: false })

    if (status)      query = query.eq('status', status as WorkloadStatus)
    if (startAfter)  query = query.gte('start_date', startAfter)
    if (startBefore) query = query.lte('start_date', startBefore)

    const { data, error } = await query

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 })

    // Flatten nested relations for the client
    const rows = (data as unknown as RawRow[]).map((row) => ({
      id:           row.id,
      status:       row.status,
      planned_time: row.planned_time,
      actual_time:  row.actual_time,
      start_date:   row.start_date,
      due_date:     row.due_date,
      st_id:        row.sprint_tasks.display_id,
      st_name:      row.sprint_tasks.name,
      priority:     row.sprint_tasks.priority,
      main_task_id: row.sprint_tasks.main_task_id,
      mt_id:        row.sprint_tasks.main_tasks.display_id,
    }))

    return NextResponse.json({ success: true, data: rows })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
