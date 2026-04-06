import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { MainTask, Sprint, SprintTask, WorkloadEntry } from '@/types/database'

type SprintTaskWithEntry = SprintTask & { workload_entries: WorkloadEntry[] }
type MainTaskGroup = { mainTask: MainTask; sprintTasks: SprintTaskWithEntry[] }
type RawRow = SprintTask & { main_tasks: MainTask; workload_entries: WorkloadEntry[] }

export async function GET() {
  try {
    const supabase = createServerClient()

    // Fetch active sprint and all main tasks in parallel
    const [sprintResult, mainTasksResult] = await Promise.all([
      supabase.from('sprints').select('*').eq('status', 'active').maybeSingle(),
      supabase.from('main_tasks').select('*').order('created_at', { ascending: true }),
    ])

    if (sprintResult.error) {
      return NextResponse.json({ success: false, error: sprintResult.error.message }, { status: 500 })
    }
    if (mainTasksResult.error) {
      return NextResponse.json({ success: false, error: mainTasksResult.error.message }, { status: 500 })
    }

    const sprint = sprintResult.data
    const mainTasks = (mainTasksResult.data ?? []) as MainTask[]

    if (!sprint) {
      // No active sprint — return all main tasks as empty groups so the UI can still render
      const groups: MainTaskGroup[] = mainTasks.map((mt) => ({ mainTask: mt, sprintTasks: [] }))
      return NextResponse.json({ success: true, data: { sprint: null, groups } })
    }

    // Fetch sprint tasks for the active sprint
    const { data: rows, error: tasksError } = await supabase
      .from('sprint_tasks')
      .select('*, main_tasks(*), workload_entries(*)')
      .eq('sprint_id', sprint.id)
      .order('created_at')

    if (tasksError) {
      return NextResponse.json({ success: false, error: tasksError.message }, { status: 500 })
    }

    // Build a map: main_task_id → sprint tasks for this sprint
    const sprintTaskMap = new Map<string, SprintTaskWithEntry[]>()
    for (const row of (rows ?? []) as unknown as RawRow[]) {
      const { main_tasks: _mt, workload_entries, ...task } = row
      const sprintTask: SprintTaskWithEntry = { ...task, workload_entries }
      if (!sprintTaskMap.has(task.main_task_id)) {
        sprintTaskMap.set(task.main_task_id, [])
      }
      sprintTaskMap.get(task.main_task_id)!.push(sprintTask)
    }

    // Every main task gets a group — even those with no sprint tasks yet
    const groups: MainTaskGroup[] = mainTasks.map((mt) => ({
      mainTask: mt,
      sprintTasks: sprintTaskMap.get(mt.id) ?? [],
    }))

    return NextResponse.json({ success: true, data: { sprint: sprint as Sprint, groups } })
  } catch {
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
