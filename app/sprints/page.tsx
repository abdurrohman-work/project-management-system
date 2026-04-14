'use client'

import { Fragment, useEffect, useState } from 'react'
import { Plus, X, Trash2, ChevronRight, Flag, Zap, ExternalLink } from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type {
  Sprint, MainTask, SprintTask, WorkloadEntry,
  SprintTaskStatus, TaskPriority, MainTaskStatus,
} from '@/types/database'
import { ToastContainer, useToast } from '@/app/components/Toast'
import { ConfirmDialog }           from '@/app/components/ConfirmDialog'

// ─── Types ────────────────────────────────────────────────────────────────────

type SprintTaskWithEntry = SprintTask & { workload_entries: WorkloadEntry[] }
type MainTaskGroup = { mainTask: MainTask; sprintTasks: SprintTaskWithEntry[] }

// ─── Status configs ───────────────────────────────────────────────────────────

const MT_STATUS: Record<MainTaskStatus, { label: string; className: string; dotColor: string; accent: string }> = {
  backlog:     { label: 'Backlog',     className: 'bg-[#374151] text-[#9ca3af]',  dotColor: '#9ca3af', accent: '#9ca3af' },
  in_progress: { label: 'In Progress', className: 'bg-[#1e3a5f] text-[#3f9cfb]',  dotColor: '#3f9cfb', accent: '#3f9cfb' },
  blocked:     { label: 'Blocked',     className: 'bg-[#450a0a] text-[#f87171]',  dotColor: '#f87171', accent: '#f87171' },
  stopped:     { label: 'Stopped',     className: 'bg-[#431407] text-[#fb923c]',  dotColor: '#fb923c', accent: '#fb923c' },
  done:        { label: 'Done',        className: 'bg-[#052e16] text-[#4ade80]',  dotColor: '#4ade80', accent: '#4ade80' },
}

const ST_STATUS: Record<SprintTaskStatus, { label: string; className: string; dotColor: string }> = {
  not_started:      { label: 'Not Started',  className: 'bg-[#374151] text-[#9ca3af]',  dotColor: '#9ca3af' },
  in_progress:      { label: 'In Progress',  className: 'bg-[#1e3a5f] text-[#3f9cfb]',  dotColor: '#3f9cfb' },
  done:             { label: 'Done',         className: 'bg-[#052e16] text-[#4ade80]',  dotColor: '#4ade80' },
  partly_completed: { label: 'Partly Done',  className: 'bg-[#3b2f04] text-[#fbbf24]',  dotColor: '#fbbf24' },
  blocked:          { label: 'Blocked',      className: 'bg-[#450a0a] text-[#f87171]',  dotColor: '#f87171' },
  stopped:          { label: 'Stopped',      className: 'bg-[#431407] text-[#fb923c]',  dotColor: '#fb923c' },
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  critical: { color: '#ef4444', label: 'Critical' },
  high:     { color: '#f59e0b', label: 'High'     },
  medium:   { color: '#3b82f6', label: 'Medium'   },
  low:      { color: '#6b7280', label: 'Low'      },
}

const ALL_ST_STATUSES: SprintTaskStatus[] = [
  'not_started', 'in_progress', 'done', 'partly_completed', 'blocked', 'stopped',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  const s = new Date(start + 'T00:00:00').toLocaleDateString('en-US', opts)
  const e = new Date(end   + 'T00:00:00').toLocaleDateString('en-US', opts)
  return `${s} – ${e}`
}

function displayTime(minutes: number): string {
  return minutes === 0 ? '—' : minutesToHours(minutes)
}

// ─── CircularProgressRing ─────────────────────────────────────────────────────

function CircularProgressRing({ pct }: { pct: number }) {
  const size = 32
  const strokeWidth = 3
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(100, Math.max(0, pct)) / 100) * circumference

  return (
    <svg width={size} height={size} className="rotate-[-90deg]" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#2a3f52"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#3f9cfb"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontSize="7"
        fontWeight="600"
        style={{ transform: 'rotate(90deg)', transformOrigin: '50% 50%' }}
      >
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="border border-[#2a3f52] rounded-lg overflow-hidden">
          {/* Section header skeleton */}
          <div className="bg-[#111b24] px-4 py-3 flex items-center gap-3">
            <div className="animate-pulse bg-[#1e2d3d] rounded w-4 h-4 flex-shrink-0" />
            <div className="animate-pulse bg-[#1e2d3d] rounded w-16 h-4 flex-shrink-0" />
            <div className="animate-pulse bg-[#1e2d3d] rounded flex-1 h-4 max-w-[200px]" />
            <div className="ml-auto flex items-center gap-2">
              <div className="animate-pulse bg-[#1e2d3d] rounded-full w-8 h-8" />
              <div className="animate-pulse bg-[#1e2d3d] rounded-full w-16 h-5" />
              <div className="animate-pulse bg-[#1e2d3d] rounded-full w-20 h-5" />
            </div>
          </div>
          {/* Row skeletons */}
          {Array.from({ length: 3 }).map((_, j) => (
            <div key={j} className="bg-[#18232d] border-b border-[#2a3f52] px-4 py-3 flex items-center gap-3">
              <div className="animate-pulse bg-[#1e2d3d] rounded w-4 h-4 flex-shrink-0" />
              <div className="animate-pulse bg-[#1e2d3d] rounded w-14 h-4 flex-shrink-0" />
              <div className="animate-pulse bg-[#1e2d3d] rounded flex-1 h-4" />
              <div className="animate-pulse bg-[#1e2d3d] rounded-full w-24 h-5 flex-shrink-0" />
              <div className="animate-pulse bg-[#1e2d3d] rounded w-16 h-4 flex-shrink-0" />
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── StatusDropdown ───────────────────────────────────────────────────────────

function StatusDropdown({
  value,
  onChange,
}: {
  value: SprintTaskStatus
  onChange: (s: SprintTaskStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const st = ST_STATUS[value]

  return (
    <div className="relative inline-block">
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium cursor-pointer border-0 transition-opacity duration-150 hover:opacity-80 ${st.className}`}
      >
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: st.dotColor }}
        />
        {st.label}
        <ChevronRight size={9} className="rotate-90 opacity-60 flex-shrink-0" />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          {/* Popover */}
          <div className="absolute left-0 top-full mt-1 z-20 min-w-[150px] bg-[#111b24] border border-[#2a3f52] rounded-md shadow-xl overflow-hidden">
            {ALL_ST_STATUSES.map(s => {
              const cfg = ST_STATUS[s]
              return (
                <button
                  key={s}
                  onClick={e => { e.stopPropagation(); onChange(s); setOpen(false) }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-[12px] font-medium cursor-pointer transition-colors duration-100 hover:bg-[#1e2d3d] text-left ${s === value ? 'bg-[#1e2d3d]' : ''}`}
                  style={{ color: cfg.dotColor }}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: cfg.dotColor }}
                  />
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SprintsPage() {
  const [sprint,       setSprint]       = useState<Sprint | null>(null)
  const [groups,       setGroups]       = useState<MainTaskGroup[]>([])
  const [loading,      setLoading]      = useState(true)
  const [collapsed,    setCollapsed]    = useState<Set<string>>(new Set())
  const [expanded,     setExpanded]     = useState<Set<string>>(new Set())
  const [addingFor,    setAddingFor]    = useState<string | null>(null)
  const [addName,      setAddName]      = useState('')
  const [addPriority,  setAddPriority]  = useState<TaskPriority>('medium')
  const [addLoading,   setAddLoading]   = useState(false)

  // ── Delete confirm ───────────────────────────────────────────────────────
  const [confirmOpen,   setConfirmOpen]   = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ taskId: string; taskName: string; mainTaskId: string } | null>(null)
  const [deletingStId,  setDeletingStId]  = useState<string | null>(null)

  // ── Toast ────────────────────────────────────────────────────────────────
  const { toasts, toast, dismiss } = useToast()

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/sprints/active')
      .then(r => r.json())
      .then(j => {
        if (j.success) { setSprint(j.data.sprint); setGroups(j.data.groups) }
      })
      .finally(() => setLoading(false))
  }, [])

  function toggleGroup(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleStatusChange(taskId: string, newStatus: SprintTaskStatus) {
    const prev = groups.flatMap(g => g.sprintTasks).find(t => t.id === taskId)?.status
    setGroups(g => g.map(group => ({
      ...group,
      sprintTasks: group.sprintTasks.map(t =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ),
    })))
    const res  = await fetch(`/api/sprint-tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    const json = await res.json()
    if (!json.success) {
      setGroups(g => g.map(group => ({
        ...group,
        sprintTasks: group.sprintTasks.map(t =>
          t.id === taskId && prev ? { ...t, status: prev } : t
        ),
      })))
      toast('Failed to update status', 'error')
    } else {
      toast(`Status → ${ST_STATUS[newStatus].label}`)
    }
  }

  function askDeleteSprintTask(taskId: string, taskName: string, mainTaskId: string) {
    setPendingDelete({ taskId, taskName, mainTaskId })
    setConfirmOpen(true)
  }

  async function confirmDeleteSprintTask() {
    if (!pendingDelete) return
    const { taskId, taskName, mainTaskId } = pendingDelete
    setConfirmOpen(false)
    setPendingDelete(null)
    setDeletingStId(taskId)
    const res  = await fetch(`/api/sprint-tasks/${taskId}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingStId(null)
    if (json.success) {
      setGroups(prev => prev.map(g =>
        g.mainTask.id === mainTaskId
          ? { ...g, sprintTasks: g.sprintTasks.filter(t => t.id !== taskId) }
          : g
      ))
      toast(`"${taskName}" deleted`)
    } else {
      toast('Failed to delete subtask', 'error')
    }
  }

  async function handleAdd(e: React.FormEvent, mainTaskId: string) {
    e.preventDefault()
    if (!sprint || !addName.trim()) return
    setAddLoading(true)

    const res  = await fetch('/api/sprint-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ main_task_id: mainTaskId, sprint_id: sprint.id, name: addName.trim(), priority: addPriority }),
    })
    const json = await res.json()

    if (json.success) {
      const newTask: SprintTaskWithEntry = { ...json.data, workload_entries: [] }
      setGroups(prev => prev.map(g =>
        g.mainTask.id === mainTaskId
          ? { ...g, sprintTasks: [...g.sprintTasks, newTask] }
          : g
      ))
      toast(`"${addName.trim()}" added`)
    } else {
      toast('Failed to add subtask', 'error')
    }

    setAddName('')
    setAddPriority('medium')
    setAddingFor(null)
    setAddLoading(false)
  }

  // ── Overall progress ──────────────────────────────────────────────────────
  const allTasks  = groups.flatMap(g => g.sprintTasks)
  const doneTotal = allTasks.filter(t => t.status === 'done').length
  const overallPct = allTasks.length > 0 ? Math.round((doneTotal / allTasks.length) * 100) : 0

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#18232d]">

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Subtask"
        message={`Delete "${pendingDelete?.taskName}"? This will also remove any workload entries. This cannot be undone.`}
        confirmLabel="Delete Subtask"
        onConfirm={confirmDeleteSprintTask}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null) }}
      />

      {/* ── Sticky page header ── */}
      <div className="sticky top-0 z-30 bg-[#18232d] border-b border-[#2a3f52]">
        <div className="flex items-center gap-3 px-7 h-14">
          <Zap size={16} className="text-[#3f9cfb] flex-shrink-0" />

          {loading ? (
            <div className="animate-pulse bg-[#1e2d3d] rounded h-4 w-48" />
          ) : sprint ? (
            <>
              <h1 className="text-sm font-semibold text-white m-0 truncate">
                {sprint.name}
              </h1>
              <span className="text-xs text-white/60 px-2.5 py-0.5 rounded-full border border-[#2a3f52] flex-shrink-0">
                {formatRange(sprint.start_date, sprint.end_date)}
              </span>
              <span className="bg-[#052e16] text-[#4ade80] text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0">
                Active
              </span>
              {allTasks.length > 0 && (
                <span className="ml-auto text-xs text-white/40 flex-shrink-0">
                  {doneTotal}/{allTasks.length} tasks done
                </span>
              )}
            </>
          ) : (
            <h1 className="text-sm font-semibold text-white m-0">No Active Sprint</h1>
          )}
        </div>

        {/* Overall progress bar */}
        {!loading && sprint && allTasks.length > 0 && (
          <div className="h-0.5 bg-[#2a3f52] mx-0">
            <div
              className="h-full bg-[#3f9cfb] transition-all duration-500"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        )}
      </div>

      <div className="px-7 py-6">

        {/* Loading skeleton */}
        {loading && <LoadingSkeleton />}

        {/* Empty state */}
        {!loading && !sprint && (
          <div className="flex flex-col items-center justify-center py-20 border border-[#2a3f52] rounded-lg bg-[#1e2d3d]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-4 text-white/20" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v4l3 3" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-white/50 mb-1">No active sprint found</p>
            <p className="text-xs text-white/30">Activate a sprint to see tasks here.</p>
          </div>
        )}

        {!loading && sprint && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 border border-[#2a3f52] rounded-lg bg-[#1e2d3d]">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="mb-4 text-white/20" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M9 12h6M9 8h6M9 16h4" strokeLinecap="round" />
            </svg>
            <p className="text-sm font-medium text-white/50 mb-1">No tasks yet</p>
            <p className="text-xs text-white/30">Create a task in the Dashboard first, then add subtasks here.</p>
          </div>
        )}

        {/* ── Groups ── */}
        {!loading && (
          <div className="flex flex-col gap-3">
            {groups.map(({ mainTask, sprintTasks }) => {
              const isCollapsed = collapsed.has(mainTask.id)
              const mt          = MT_STATUS[mainTask.status]
              const pct         = Math.min(100, Math.max(0, mainTask.progress))
              const doneCt      = sprintTasks.filter(t => t.status === 'done').length
              const NCOLS       = 9

              return (
                <div
                  key={mainTask.id}
                  className="border border-[#2a3f52] rounded-lg overflow-hidden"
                >
                  {/* ── Section header ── */}
                  <div
                    onClick={() => toggleGroup(mainTask.id)}
                    className="bg-[#111b24] border-b border-[#2a3f52] px-3 py-2 flex items-center gap-2.5 cursor-pointer select-none hover:bg-[#1e2d3d] transition-colors duration-150"
                    style={{ borderLeft: `3px solid ${mt.accent}` }}
                  >
                    {/* Chevron */}
                    <ChevronRight
                      size={13}
                      className="flex-shrink-0 text-white/40 transition-transform duration-200"
                      style={{ transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
                    />

                    {/* Main task display_id */}
                    <span className="font-mono text-[11px] text-[#3f9cfb] bg-[#3f9cfb]/10 px-1.5 py-0.5 rounded flex-shrink-0">
                      {mainTask.display_id ?? '—'}
                    </span>

                    {/* Main task name */}
                    <span className="text-[13px] font-semibold text-white flex-1 truncate">
                      {mainTask.name}
                    </span>

                    {/* Right section */}
                    <div className="ml-auto flex items-center gap-2.5 flex-shrink-0">
                      {/* Circular progress ring */}
                      <CircularProgressRing pct={pct} />

                      {/* Done count badge */}
                      <span className="bg-[#1e2d3d] text-white/50 text-[11px] font-medium px-2 py-0.5 rounded-full border border-[#2a3f52]">
                        {doneCt}/{sprintTasks.length}
                      </span>

                      {/* Task count badge */}
                      <span className="bg-[#1e2d3d] text-white/40 text-[11px] px-2 py-0.5 rounded-full border border-[#2a3f52]">
                        {sprintTasks.length} {sprintTasks.length === 1 ? 'task' : 'tasks'}
                      </span>

                      {/* Status badge */}
                      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full ${mt.className}`}>
                        <span
                          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: mt.dotColor }}
                        />
                        {mt.label}
                      </span>
                    </div>
                  </div>

                  {/* ── Sprint task table ── */}
                  <div
                    className="transition-all duration-200 overflow-hidden"
                    style={{ display: isCollapsed ? 'none' : undefined }}
                  >
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <colgroup>
                          <col style={{ width: 36 }} />
                          <col style={{ width: 80 }} />
                          <col />
                          <col style={{ width: 150 }} />
                          <col style={{ width: 100 }} />
                          <col style={{ width: 120 }} />
                          <col style={{ width: 120 }} />
                          <col style={{ width: 180 }} />
                          <col style={{ width: 44 }} />
                        </colgroup>

                        <thead>
                          <tr className="bg-[#111b24] border-b border-[#2a3f52]">
                            {['', 'ST ID', 'Task', 'Status', 'Priority', 'Blocked By', 'Link', 'Note', ''].map((label, i) => (
                              <th
                                key={i}
                                className="px-3 h-8 text-left text-[11px] font-semibold uppercase tracking-wider text-white/40 whitespace-nowrap"
                              >
                                {label}
                              </th>
                            ))}
                          </tr>
                        </thead>

                        <tbody>
                          {sprintTasks.length === 0 && (
                            <tr>
                              <td
                                colSpan={NCOLS}
                                className="px-6 py-5 text-center border-b border-[#2a3f52] bg-[#18232d]"
                              >
                                <p className="text-xs text-white/30 m-0">No tasks in this group yet. Add one below.</p>
                              </td>
                            </tr>
                          )}

                          {sprintTasks.map(task => {
                            const entry      = task.workload_entries[0] ?? null
                            const isExpanded = expanded.has(task.id)
                            const pr         = PRIORITY_CONFIG[task.priority]

                            return (
                              <Fragment key={task.id}>
                                <tr
                                  className="bg-[#18232d] hover:bg-[#1e2d3d] border-b border-[#2a3f52] transition-colors duration-150 cursor-pointer"
                                  style={{ opacity: deletingStId === task.id ? 0.4 : 1 }}
                                  onClick={() => toggleRow(task.id)}
                                >
                                  {/* Expand toggle */}
                                  <td className="px-3 py-2.5 w-9" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => toggleRow(task.id)}
                                      title={isExpanded ? 'Collapse workload' : 'Expand workload'}
                                      className="p-1 rounded text-white/30 hover:text-white hover:bg-[#1e2d3d] transition-colors duration-100 cursor-pointer flex items-center"
                                    >
                                      <ChevronRight
                                        size={12}
                                        className="transition-transform duration-150"
                                        style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                                      />
                                    </button>
                                  </td>

                                  {/* ST ID */}
                                  <td className="px-3 py-2.5">
                                    <span className="font-mono text-[11px] text-[#3f9cfb] bg-[#3f9cfb]/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                                      {task.display_id ?? '—'}
                                    </span>
                                  </td>

                                  {/* Task name */}
                                  <td className="px-3 py-2.5 max-w-[280px]">
                                    <span className="block overflow-hidden text-ellipsis whitespace-nowrap text-white text-[13px] font-medium">
                                      {task.name}
                                    </span>
                                  </td>

                                  {/* Status dropdown */}
                                  <td className="px-3 py-2.5" onClick={e => e.stopPropagation()}>
                                    <StatusDropdown
                                      value={task.status}
                                      onChange={s => handleStatusChange(task.id, s)}
                                    />
                                  </td>

                                  {/* Priority */}
                                  <td className="px-3 py-2.5">
                                    <span
                                      className="inline-flex items-center gap-1 text-[12px] font-medium"
                                      style={{ color: pr.color }}
                                    >
                                      <Flag size={11} fill={pr.color} className="flex-shrink-0" />
                                      {pr.label}
                                    </span>
                                  </td>

                                  {/* Blocked By */}
                                  <td className="px-3 py-2.5 max-w-[120px]">
                                    <span
                                      className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px]"
                                      style={{ color: task.blocked_by ? '#f87171' : 'rgba(255,255,255,0.3)' }}
                                    >
                                      {task.blocked_by ?? '—'}
                                    </span>
                                  </td>

                                  {/* Link */}
                                  <td className="px-3 py-2.5 max-w-[120px]">
                                    {task.link ? (
                                      <a
                                        href={task.link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={e => e.stopPropagation()}
                                        className="flex items-center gap-1 text-[#3f9cfb] text-[12px] hover:underline overflow-hidden text-ellipsis whitespace-nowrap cursor-pointer"
                                      >
                                        <ExternalLink size={10} className="flex-shrink-0" />
                                        <span className="truncate">{task.link.replace(/^https?:\/\//, '')}</span>
                                      </a>
                                    ) : (
                                      <span className="text-white/30 text-[12px]">—</span>
                                    )}
                                  </td>

                                  {/* Note */}
                                  <td className="px-3 py-2.5 max-w-[180px]">
                                    <span
                                      className="block overflow-hidden text-ellipsis whitespace-nowrap text-[12px]"
                                      style={{ color: task.note ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}
                                    >
                                      {task.note ?? '—'}
                                    </span>
                                  </td>

                                  {/* Delete */}
                                  <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                                    <button
                                      onClick={() => askDeleteSprintTask(task.id, task.name, mainTask.id)}
                                      disabled={deletingStId === task.id}
                                      title="Delete subtask"
                                      className="p-1.5 rounded text-white/30 hover:text-[#f87171] hover:bg-[#f87171]/10 transition-colors duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center"
                                    >
                                      <Trash2 size={12} />
                                    </button>
                                  </td>
                                </tr>

                                {/* ── Workload expand panel ── */}
                                {isExpanded && (
                                  <tr>
                                    <td
                                      colSpan={NCOLS}
                                      className="bg-[#111b24] border-b border-[#2a3f52] border-l-2 border-l-[#3f9cfb] px-12 py-3.5 transition-all duration-200"
                                    >
                                      {entry ? (
                                        <div className="grid grid-cols-4 gap-x-6 gap-y-2">
                                          {[
                                            { label: 'ST ID',       value: task.display_id ?? '—' },
                                            { label: 'Start Date',  value: entry.start_date ?? '—' },
                                            { label: 'Due Date',    value: entry.due_date   ?? '—' },
                                            { label: 'Planned',     value: displayTime(entry.planned_time) },
                                            { label: 'Actual',      value: displayTime(entry.actual_time)  },
                                            { label: 'Status',      value: ST_STATUS[task.status].label },
                                          ].map(({ label, value }) => (
                                            <div key={label}>
                                              <p className="m-0 mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
                                                {label}
                                              </p>
                                              <p
                                                className="m-0 text-[13px]"
                                                style={{ color: value === '—' ? 'rgba(255,255,255,0.3)' : 'white' }}
                                              >
                                                {value}
                                              </p>
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <p className="m-0 text-[12px] text-white/30">
                                          No workload entry.{' '}
                                          <span className="text-white/50">Set status to In Progress</span>{' '}
                                          to auto-create one.
                                        </p>
                                      )}
                                    </td>
                                  </tr>
                                )}
                              </Fragment>
                            )
                          })}

                          {/* ── Add subtask row ── */}
                          <tr>
                            <td
                              colSpan={NCOLS}
                              className="px-4 py-2 bg-[#18232d] border-t border-[#2a3f52]"
                            >
                              {addingFor === mainTask.id ? (
                                <form
                                  onSubmit={e => handleAdd(e, mainTask.id)}
                                  className="flex items-center gap-2 flex-wrap bg-[#111b24] rounded-md px-3 py-2"
                                >
                                  <input
                                    type="text"
                                    value={addName}
                                    autoFocus
                                    onChange={e => setAddName(e.target.value)}
                                    placeholder="Subtask name…"
                                    className="flex-1 min-w-[160px] bg-[#1e2d3d] border border-[#3f9cfb] rounded-md text-white text-[13px] px-2.5 py-1.5 outline-none placeholder:text-white/30 focus:border-[#3f9cfb]"
                                  />

                                  {/* Priority select */}
                                  <div className="relative">
                                    <select
                                      value={addPriority}
                                      onChange={e => setAddPriority(e.target.value as TaskPriority)}
                                      className="bg-[#1e2d3d] border border-[#2a3f52] rounded-md text-[12px] font-medium py-1.5 pl-2.5 pr-7 outline-none cursor-pointer appearance-none"
                                      style={{ color: PRIORITY_CONFIG[addPriority].color }}
                                    >
                                      {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map(p => (
                                        <option key={p} value={p} className="bg-[#1e2d3d] text-white">
                                          {PRIORITY_CONFIG[p].label}
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronRight
                                      size={10}
                                      className="absolute right-2 top-1/2 -translate-y-1/2 rotate-90 text-white/40 pointer-events-none"
                                    />
                                  </div>

                                  <button
                                    type="submit"
                                    disabled={addLoading || !addName.trim()}
                                    className="bg-[#3f9cfb] text-white text-[12px] font-medium px-3.5 py-1.5 rounded-md cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#3f9cfb]/90 transition-colors duration-150"
                                  >
                                    {addLoading ? 'Adding…' : 'Add'}
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => { setAddingFor(null); setAddName(''); setAddPriority('medium') }}
                                    className="inline-flex items-center gap-1 text-white/50 text-[12px] px-3 py-1.5 rounded-md border border-[#2a3f52] cursor-pointer hover:text-white hover:border-[#3f9cfb] transition-colors duration-150 bg-transparent"
                                  >
                                    <X size={11} />
                                    Cancel
                                  </button>
                                </form>
                              ) : (
                                <button
                                  onClick={() => { setAddingFor(mainTask.id); setAddName(''); setAddPriority('medium') }}
                                  className="inline-flex items-center gap-1.5 text-white/30 text-[12px] cursor-pointer py-1 hover:text-[#3f9cfb] transition-colors duration-150 bg-transparent border-0"
                                >
                                  <Plus size={13} />
                                  Add subtask
                                </button>
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
