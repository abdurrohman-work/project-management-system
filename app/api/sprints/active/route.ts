import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { MainTask, Sprint, SprintTask, WorkloadEntry } from '@/types/database'

type SprintTaskWithEntry = SprintTask & { workload_entries: WorkloadEntry[] }
type MainTaskGroup = { mainTask: MainTask; sprintTasks: SprintTaskWithEntry[] }
type RawRow = SprintTask & { main_tasks: MainTask; workload_entries: WorkloadEntry[] }

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data: sprint, error: sprintError } = await supabase
      .from('sprints')
      .select('*')
      .eq('status', 'active')
      .maybeSingle()

    if (sprintError) {
      return NextResponse.json({ success: false, error: sprintError.message }, { status: 500 })
    }

    if (!sprint) {
      return NextResponse.json({ success: true, data: { sprint: null, groups: [] } })
    }

    const { data: rows, error: tasksError } = await supabase
      .from('sprint_tasks')
      .select('*, main_tasks(*), workload_entries(*)')
      .eq('sprint_id', sprint.id)
      .order('created_at')

    if (tasksError) {
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 })
    }

    // Group sprint_tasks by main_task
    const map = new Map<string, MainTaskGroup>()
    for (const row of (rows ?? []) as unknown as RawRow[]) {
      const { main_tasks, workload_entries, ...task } = row
      const sprintTask: SprintTaskWithEntry = { ...task, workload_entries }
      if (!map.has(main_tasks.id)) {
        map.set(main_tasks.id, { mainTask: main_tasks, sprintTasks: [] })
      }
      map.get(main_tasks.id)!.sprintTasks.push(sprintTask)
    }

    const groups = Array.from(map.values())

    return NextResponse.json({ success: true, data: { sprint: sprint as Sprint, groups } })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
