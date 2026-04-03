'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { recalculateAll } from '@/lib/calculations'
import { minutesToHours } from '@/lib/time'
import type {
  Sprint,
  MainTask,
  SprintTask,
  WorkloadEntry,
  SprintTaskStatus,
  TaskPriority,
  MainTaskStatus,
} from '@/types/database'

// ─── Local types ──────────────────────────────────────────────────────────────

type SprintTaskWithEntry = SprintTask & { workload_entries: WorkloadEntry[] }
type MainTaskGroup = { mainTask: MainTask; sprintTasks: SprintTaskWithEntry[] }

// Raw shape returned by Supabase nested select
type RawRow = SprintTask & { main_tasks: MainTask; workload_entries: WorkloadEntry[] }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildGroups(rows: RawRow[]): MainTaskGroup[] {
  const map = new Map<string, MainTaskGroup>()
  for (const row of rows) {
    const { main_tasks, workload_entries, ...task } = row
    const sprintTask: SprintTaskWithEntry = { ...task, workload_entries }
    if (!map.has(main_tasks.id)) {
      map.set(main_tasks.id, { mainTask: main_tasks, sprintTasks: [] })
    }
    map.get(main_tasks.id)!.sprintTasks.push(sprintTask)
  }
  return Array.from(map.values())
}

function formatSprintRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function displayTime(minutes: number): string {
  return minutes === 0 ? '—' : minutesToHours(minutes)
}

// ─── Style / label maps ───────────────────────────────────────────────────────

const MAIN_STATUS_STYLES: Record<MainTaskStatus, string> = {
  backlog:     'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked:     'bg-red-100 text-red-700',
  stopped:     'bg-orange-100 text-orange-700',
  done:        'bg-green-100 text-green-700',
}

const MAIN_STATUS_LABELS: Record<MainTaskStatus, string> = {
  backlog: 'Backlog', in_progress: 'In Progress',
  blocked: 'Blocked', stopped: 'Stopped', done: 'Done',
}

const TASK_STATUS_STYLES: Record<SprintTaskStatus, string> = {
  not_started:      'bg-gray-100 text-gray-600',
  in_progress:      'bg-blue-100 text-blue-700',
  done:             'bg-green-100 text-green-700',
  partly_completed: 'bg-amber-100 text-amber-700',
  blocked:          'bg-red-100 text-red-700',
  stopped:          'bg-orange-100 text-orange-700',
}

const TASK_STATUS_LABELS: Record<SprintTaskStatus, string> = {
  not_started: 'Not Started', in_progress: 'In Progress', done: 'Done',
  partly_completed: 'Partly Done', blocked: 'Blocked', stopped: 'Stopped',
}

const ALL_SPRINT_STATUSES: SprintTaskStatus[] = [
  'not_started', 'in_progress', 'done', 'partly_completed', 'blocked', 'stopped',
]

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low:      'bg-gray-100 text-gray-600',
  medium:   'bg-blue-100 text-blue-600',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MainStatusBadge({ status }: { status: MainTaskStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${MAIN_STATUS_STYLES[status]}`}>
      {MAIN_STATUS_LABELS[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-400">{pct.toFixed(0)}%</span>
    </div>
  )
}

function SkeletonSection() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
        <div className="h-4 w-40 animate-pulse rounded bg-gray-200" />
        <div className="h-5 w-16 animate-pulse rounded-full bg-gray-200" />
        <div className="h-2 w-24 animate-pulse rounded-full bg-gray-200" />
      </div>
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0">
          <div className="h-4 w-4 animate-pulse rounded bg-gray-200" />
          <div className="h-4 w-52 animate-pulse rounded bg-gray-200" />
          <div className="h-5 w-20 animate-pulse rounded-full bg-gray-200" />
          <div className="h-5 w-14 animate-pulse rounded-full bg-gray-200" />
        </div>
      ))}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const [sprint, setSprint]       = useState<Sprint | null>(null)
  const [groups, setGroups]       = useState<MainTaskGroup[]>([])
  const [loading, setLoading]     = useState(true)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [addingFor, setAddingFor] = useState<string | null>(null)
  const [addName, setAddName]     = useState('')
  const [addPriority, setAddPriority] = useState<TaskPriority>('medium')
  const [addSubmitting, setAddSubmitting] = useState(false)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: sprintData } = await supabase
        .from('sprints')
        .select('*')
        .eq('status', 'active')
        .maybeSingle()

      if (!sprintData) { setLoading(false); return }
      setSprint(sprintData)

      const { data: rows } = await supabase
        .from('sprint_tasks')
        .select('*, main_tasks(*), workload_entries(*)')
        .eq('sprint_id', sprintData.id)
        .order('created_at')

      if (rows) setGroups(buildGroups(rows as unknown as RawRow[]))
      setLoading(false)
    }
    load()
  }, [])

  // ── Expand / collapse ──────────────────────────────────────────────────────
  function toggleExpand(taskId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(taskId) ? next.delete(taskId) : next.add(taskId)
      return next
    })
  }

  // ── Sprint task status change ──────────────────────────────────────────────
  async function handleStatusChange(taskId: string, newStatus: SprintTaskStatus) {
    await supabase.from('sprint_tasks').update({ status: newStatus }).eq('id', taskId)
    setGroups((prev) =>
      prev.map((g) => ({
        ...g,
        sprintTasks: g.sprintTasks.map((t) =>
          t.id === taskId ? { ...t, status: newStatus } : t
        ),
      }))
    )
  }

  // ── Workload entry time field blur ─────────────────────────────────────────
  async function handleTimeBlur(
    entryId: string,
    field: 'planned_time' | 'actual_time',
    rawValue: string,
    mainTaskId: string,
  ) {
    const minutes = Math.max(0, Math.round(Number(rawValue) || 0))
    await supabase.from('workload_entries').update({ [field]: minutes }).eq('id', entryId)
    await recalculateAll(mainTaskId, supabase)

    // Refresh the affected main_task row so progress / time_spent update in UI
    const { data: updatedMain } = await supabase
      .from('main_tasks').select('*').eq('id', mainTaskId).single()

    setGroups((prev) =>
      prev.map((g) => {
        if (g.mainTask.id !== mainTaskId) return g
        return {
          mainTask: updatedMain ?? g.mainTask,
          sprintTasks: g.sprintTasks.map((t) => ({
            ...t,
            workload_entries: t.workload_entries.map((e) =>
              e.id === entryId ? { ...e, [field]: minutes } : e
            ),
          })),
        }
      })
    )
  }

  // ── Add subtask ────────────────────────────────────────────────────────────
  async function handleAddSubtask(e: React.FormEvent, mainTaskId: string) {
    e.preventDefault()
    if (!sprint || !addName.trim()) return
    setAddSubmitting(true)

    const { data } = await supabase
      .from('sprint_tasks')
      .insert({
        main_task_id: mainTaskId,
        sprint_id: sprint.id,
        name: addName.trim(),
        priority: addPriority,
        status: 'not_started',
      })
      .select()
      .single()

    if (data) {
      const newTask: SprintTaskWithEntry = { ...(data as SprintTask), workload_entries: [] }
      setGroups((prev) =>
        prev.map((g) =>
          g.mainTask.id === mainTaskId
            ? { ...g, sprintTasks: [...g.sprintTasks, newTask] }
            : g
        )
      )
    }

    setAddName('')
    setAddPriority('medium')
    setAddingFor(null)
    setAddSubmitting(false)
  }

  function cancelAdd() {
    setAddingFor(null)
    setAddName('')
    setAddPriority('medium')
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-4 py-8">

      {/* ── Header ── */}
      <div className="mb-6">
        {loading ? (
          <div className="h-8 w-36 animate-pulse rounded bg-gray-200" />
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">
              {sprint ? sprint.name : 'No Active Sprint'}
            </h1>
            {sprint && (
              <p className="mt-1 text-sm text-gray-500">
                {formatSprintRange(sprint.start_date, sprint.end_date)}
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="space-y-4">
          <SkeletonSection />
          <SkeletonSection />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white px-4 py-16 text-center shadow-sm">
          <p className="text-sm font-medium text-gray-500">No sprint tasks yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Add sprint tasks from the Dashboard to get started.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ mainTask, sprintTasks }) => (
            <div key={mainTask.id} className="rounded-lg border border-gray-200 bg-white shadow-sm">

              {/* ── Main task section header ── */}
              <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-3">
                <span className="font-semibold text-gray-900">{mainTask.name}</span>
                <MainStatusBadge status={mainTask.status} />
                <ProgressBar value={mainTask.progress} />
              </div>

              {/* ── Sprint task rows ── */}
              {sprintTasks.map((task) => {
                const entry = task.workload_entries[0] ?? null
                const isExpanded = expandedIds.has(task.id)

                return (
                  <div key={task.id} className="border-b border-gray-50 last:border-0">

                    {/* Row */}
                    <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 hover:bg-gray-50">
                      {/* Expand toggle */}
                      <button
                        onClick={() => toggleExpand(task.id)}
                        className="shrink-0 text-gray-400 hover:text-gray-600 focus:outline-none"
                        aria-label={isExpanded ? 'Collapse' : 'Expand'}
                      >
                        <svg
                          className={`h-3.5 w-3.5 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {/* Name */}
                      <span className="flex-1 text-sm text-gray-800">{task.name}</span>

                      {/* Inline status dropdown */}
                      <select
                        value={task.status}
                        onChange={(e) =>
                          handleStatusChange(task.id, e.target.value as SprintTaskStatus)
                        }
                        className={`shrink-0 cursor-pointer rounded-full border-0 px-2.5 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${TASK_STATUS_STYLES[task.status]}`}
                      >
                        {ALL_SPRINT_STATUSES.map((s) => (
                          <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                        ))}
                      </select>

                      {/* Priority badge */}
                      <PriorityBadge priority={task.priority} />
                    </div>

                    {/* Expanded workload panel */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 bg-gray-50 px-8 py-4">
                        {entry ? (
                          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">

                            {/* Planned time */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-gray-500">Planned (min)</p>
                              <input
                                key={`${entry.id}-planned-${entry.planned_time}`}
                                type="number"
                                min="0"
                                defaultValue={entry.planned_time}
                                onBlur={(e) =>
                                  handleTimeBlur(entry.id, 'planned_time', e.target.value, mainTask.id)
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              <p className="mt-1 text-xs text-gray-400">{displayTime(entry.planned_time)}</p>
                            </div>

                            {/* Actual time */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-gray-500">Actual (min)</p>
                              <input
                                key={`${entry.id}-actual-${entry.actual_time}`}
                                type="number"
                                min="0"
                                defaultValue={entry.actual_time}
                                onBlur={(e) =>
                                  handleTimeBlur(entry.id, 'actual_time', e.target.value, mainTask.id)
                                }
                                className="w-24 rounded border border-gray-300 px-2 py-1 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                              <p className="mt-1 text-xs text-gray-400">{displayTime(entry.actual_time)}</p>
                            </div>

                            {/* Start date */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-gray-500">Start</p>
                              <p className="text-sm text-gray-700">{entry.start_date ?? '—'}</p>
                            </div>

                            {/* Due date */}
                            <div>
                              <p className="mb-1.5 text-xs font-medium text-gray-500">Due</p>
                              <p className="text-sm text-gray-700">{entry.due_date ?? '—'}</p>
                            </div>

                          </div>
                        ) : (
                          <p className="text-xs text-gray-400">
                            No workload entry yet. Set this task to&nbsp;
                            <span className="font-medium text-gray-600">In Progress</span>
                            &nbsp;to auto-create one.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}

              {/* ── Add subtask ── */}
              <div className="px-4 py-2.5">
                {addingFor === mainTask.id ? (
                  <form
                    onSubmit={(e) => handleAddSubtask(e, mainTask.id)}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <div className="min-w-[160px] flex-1">
                      <input
                        type="text"
                        value={addName}
                        onChange={(e) => setAddName(e.target.value)}
                        placeholder="Subtask name"
                        autoFocus
                        className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                      />
                    </div>
                    <select
                      value={addPriority}
                      onChange={(e) => setAddPriority(e.target.value as TaskPriority)}
                      className="rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                    <button
                      type="submit"
                      disabled={addSubmitting || !addName.trim()}
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addSubmitting ? 'Adding…' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelAdd}
                      className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setAddingFor(mainTask.id)
                      setAddName('')
                      setAddPriority('medium')
                    }}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    + Add subtask
                  </button>
                )}
              </div>

            </div>
          ))}
        </div>
      )}

    </main>
  )
}
