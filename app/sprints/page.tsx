'use client'

import { Fragment, useEffect, useState } from 'react'
import { Plus, X, Trash2, ChevronRight, Flag, Zap } from 'lucide-react'
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           '#1A1D23',
  sidebar:      '#1E2028',
  surface:      '#2A2D35',
  surfaceHover: '#2E323A',
  elevated:     '#31353F',
  border:       '#363940',
  borderHover:  '#4A4F5A',
  primary:      '#7B68EE',
  primaryHover: '#6C5CE7',
  text:         '#E2E4E9',
  secondary:    '#9BA0AB',
  muted:        '#6B7280',
  danger:       '#EF4444',
}

// ─── Status configs ───────────────────────────────────────────────────────────

const MT_STATUS: Record<MainTaskStatus, { dot: string; text: string; bg: string; label: string; accent: string }> = {
  backlog:     { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Backlog',     accent: '#9BA0AB' },
  in_progress: { dot: '#60A5FA', text: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  label: 'In Progress', accent: '#60A5FA' },
  blocked:     { dot: '#F87171', text: '#F87171', bg: 'rgba(239,68,68,0.12)',   label: 'Blocked',     accent: '#F87171' },
  stopped:     { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Stopped',     accent: '#FBBF24' },
  done:        { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Done',        accent: '#4ADE80' },
}

const ST_STATUS: Record<SprintTaskStatus, { dot: string; text: string; bg: string; label: string }> = {
  not_started:      { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Not Started'  },
  in_progress:      { dot: '#60A5FA', text: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  label: 'In Progress'  },
  done:             { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Done'          },
  partly_completed: { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Partly Done'   },
  blocked:          { dot: '#F87171', text: '#F87171', bg: 'rgba(239,68,68,0.12)',   label: 'Blocked'       },
  stopped:          { dot: '#FB923C', text: '#FB923C', bg: 'rgba(251,146,60,0.12)',  label: 'Stopped'       },
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Critical' },
  high:     { color: '#F59E0B', label: 'High'     },
  medium:   { color: '#3B82F6', label: 'Medium'   },
  low:      { color: '#6B7280', label: 'Low'      },
}

const ALL_ST_STATUSES: SprintTaskStatus[] = [
  'not_started', 'in_progress', 'done', 'partly_completed', 'blocked', 'stopped',
]

// ─── Column definitions ───────────────────────────────────────────────────────

const ST_COLS = [
  { label: '',           width: 36       },
  { label: 'ST ID',      width: 72       },
  { label: 'Task',       width: undefined },
  { label: 'Status',     width: 138      },
  { label: 'Priority',   width: 100      },
  { label: 'Blocked By', width: 120      },
  { label: 'Link',       width: 120      },
  { label: 'Note',       width: 180      },
  { label: '',           width: 44       },
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
        if (j.success) {
          setSprint(j.data.sprint)
          setGroups(j.data.groups)
          // Collapse groups whose parent task is 100% complete by default
          const autoCollapsed = new Set<string>(
            (j.data.groups as MainTaskGroup[])
              .filter(g => g.mainTask.progress >= 100)
              .map(g => g.mainTask.id)
          )
          setCollapsed(autoCollapsed)
        }
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
      // revert
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

  // ── Shared cell styles ────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    padding: '0 12px', height: 32, textAlign: 'left',
    fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '0.06em', color: C.muted, whiteSpace: 'nowrap',
    borderBottom: `1px solid ${C.border}`, backgroundColor: C.sidebar,
  }

  const tdBase: React.CSSProperties = {
    padding: '0 12px', height: 38, fontSize: 13, verticalAlign: 'middle',
    borderBottom: `1px solid ${C.border}`,
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh' }}>

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
      <div
        style={{
          height: 56, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', padding: '0 28px',
          gap: 12, backgroundColor: C.bg,
          position: 'sticky', top: 0, zIndex: 30,
        }}
      >
        <Zap size={16} style={{ color: C.primary }} />
        {loading ? (
          <div className="skeleton" style={{ height: 14, width: 200, borderRadius: 4 }} />
        ) : sprint ? (
          <>
            <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>{sprint.name}</h1>
            <span style={{ fontSize: 12, color: C.muted, padding: '2px 10px', borderRadius: 9999, border: `1px solid ${C.border}` }}>
              {formatRange(sprint.start_date, sprint.end_date)}
            </span>
            <span style={{ backgroundColor: 'rgba(74,222,128,0.12)', color: '#4ADE80', fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999 }}>
              Active
            </span>
          </>
        ) : (
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>No Active Sprint</h1>
        )}
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* Empty state */}
        {!loading && groups.length === 0 && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, backgroundColor: C.surface, padding: '64px 24px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>No tasks yet</p>
            <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Create a task in the Dashboard first, then add subtasks here.</p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
                <div className="skeleton" style={{ height: 44 }} />
              </div>
            ))}
          </div>
        )}

        {/* Groups */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {groups.map(({ mainTask, sprintTasks }) => {
              const isCollapsed = collapsed.has(mainTask.id)
              const mt      = MT_STATUS[mainTask.status]
              const pct     = Math.min(100, Math.max(0, mainTask.progress))
              const pctColor = pct >= 100 ? '#4ADE80' : pct >= 50 ? '#60A5FA' : '#F59E0B'
              const NCOLS   = ST_COLS.length
              const doneCt  = sprintTasks.filter(t => t.status === 'done').length

              return (
                <div
                  key={mainTask.id}
                  style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface }}
                >
                  {/* ── Group header ── */}
                  <div
                    onClick={() => toggleGroup(mainTask.id)}
                    style={{
                      backgroundColor: C.sidebar,
                      padding: '0 16px', height: 44,
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer', userSelect: 'none',
                      borderLeft: `3px solid ${mt.accent}`,
                      transition: 'background-color 0.1s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surfaceHover)}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.sidebar)}
                  >
                    <ChevronRight
                      size={13}
                      style={{
                        flexShrink: 0, color: C.secondary,
                        transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                        transition: 'transform 0.15s',
                      }}
                    />

                    <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.primary, backgroundColor: 'rgba(123,104,238,0.1)', padding: '2px 6px', borderRadius: 4, flexShrink: 0 }}>
                      {mainTask.display_id ?? '—'}
                    </span>

                    <span style={{ fontSize: 13, fontWeight: 600, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {mainTask.name}
                    </span>

                    {/* Done count */}
                    {sprintTasks.length > 0 && (
                      <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>
                        {doneCt}/{sprintTasks.length}
                      </span>
                    )}

                    {/* Task count badge */}
                    <span style={{ backgroundColor: C.elevated, color: C.secondary, fontSize: 11, fontWeight: 500, padding: '2px 7px', borderRadius: 9999, flexShrink: 0 }}>
                      {sprintTasks.length} {sprintTasks.length === 1 ? 'task' : 'tasks'}
                    </span>

                    {/* Status badge */}
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        backgroundColor: mt.bg, color: mt.text,
                        fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 9999, flexShrink: 0,
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: mt.dot, flexShrink: 0 }} />
                      {mt.label}
                    </span>

                    {/* Mini progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <div style={{ width: 64, height: 3, backgroundColor: C.border, borderRadius: 9999, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', backgroundColor: pctColor, borderRadius: 9999 }} />
                      </div>
                      <span style={{ fontSize: 11, color: C.muted, minWidth: 26, fontVariantNumeric: 'tabular-nums' }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* ── Sprint task table ── */}
                  {!isCollapsed && (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <colgroup>
                        {ST_COLS.map((col, i) => <col key={i} style={{ width: col.width === undefined ? undefined : col.width }} />)}
                      </colgroup>

                      <thead>
                        <tr>
                          {ST_COLS.map((col, i) => <th key={i} style={thStyle}>{col.label}</th>)}
                        </tr>
                      </thead>

                      <tbody>
                        {sprintTasks.length === 0 && (
                          <tr>
                            <td colSpan={NCOLS} style={{ padding: '20px 24px', textAlign: 'center', borderBottom: `1px solid ${C.border}` }}>
                              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>No subtasks yet. Add one below.</p>
                            </td>
                          </tr>
                        )}

                        {sprintTasks.map(task => {
                          const entry      = task.workload_entries[0] ?? null
                          const isExpanded = expanded.has(task.id)
                          const st         = ST_STATUS[task.status]
                          const pr         = PRIORITY_CONFIG[task.priority]

                          return (
                            <Fragment key={task.id}>
                              <tr
                                style={{
                                  backgroundColor: C.surface,
                                  transition: 'background-color 0.08s',
                                  opacity: deletingStId === task.id ? 0.4 : 1,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surfaceHover)}
                                onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.surface)}
                              >
                                {/* Expand toggle */}
                                <td style={{ ...tdBase, padding: '0 0 0 12px', width: 36 }}>
                                  <button
                                    onClick={() => toggleRow(task.id)}
                                    title={isExpanded ? 'Collapse workload' : 'Expand workload'}
                                    style={{
                                      background: 'none', border: 'none', cursor: 'pointer',
                                      padding: 4, borderRadius: 4, color: C.muted,
                                      display: 'flex', alignItems: 'center',
                                      transition: 'color 0.1s, background-color 0.1s',
                                    }}
                                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.elevated }}
                                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
                                  >
                                    <ChevronRight size={12} style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }} />
                                  </button>
                                </td>

                                {/* ST ID */}
                                <td style={tdBase}>
                                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.primary, backgroundColor: 'rgba(123,104,238,0.1)', padding: '2px 6px', borderRadius: 4 }}>
                                    {task.display_id ?? '—'}
                                  </span>
                                </td>

                                {/* Task name */}
                                <td style={{ ...tdBase, maxWidth: 280 }}>
                                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text, fontWeight: 500, fontSize: 13 }}>
                                    {task.name}
                                  </span>
                                </td>

                                {/* Status dropdown */}
                                <td style={tdBase}>
                                  <div style={{ position: 'relative', display: 'inline-block' }}>
                                    <select
                                      value={task.status}
                                      onChange={e => handleStatusChange(task.id, e.target.value as SprintTaskStatus)}
                                      style={{
                                        backgroundColor: st.bg, color: st.text,
                                        border: `1px solid ${st.dot}33`, borderRadius: 9999,
                                        fontSize: 11, fontWeight: 500,
                                        padding: '4px 28px 4px 10px',
                                        cursor: 'pointer', outline: 'none',
                                        appearance: 'none', fontFamily: 'inherit',
                                        transition: 'background-color 0.15s, border-color 0.15s',
                                        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                      }}
                                    >
                                      {ALL_ST_STATUSES.map(s => (
                                        <option key={s} value={s} style={{ backgroundColor: C.elevated, color: C.text }}>
                                          {ST_STATUS[s].label}
                                        </option>
                                      ))}
                                    </select>
                                    <ChevronRight size={10} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: st.text, pointerEvents: 'none' }} />
                                  </div>
                                </td>

                                {/* Priority */}
                                <td style={tdBase}>
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: pr.color }}>
                                    <Flag size={12} fill={pr.color} style={{ flexShrink: 0 }} />
                                    <span style={{ fontSize: 12, fontWeight: 500 }}>{pr.label}</span>
                                  </span>
                                </td>

                                {/* Blocked By */}
                                <td style={{ ...tdBase, fontSize: 12, maxWidth: 120 }}>
                                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.blocked_by ? '#F87171' : C.muted }}>
                                    {task.blocked_by ?? '—'}
                                  </span>
                                </td>

                                {/* Link */}
                                <td style={{ ...tdBase, fontSize: 12, maxWidth: 120 }}>
                                  {task.link ? (
                                    <a
                                      href={task.link} target="_blank" rel="noopener noreferrer"
                                      style={{ color: C.primary, textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                                      onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'underline')}
                                      onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = 'none')}
                                    >
                                      {task.link.replace(/^https?:\/\//, '')}
                                    </a>
                                  ) : (
                                    <span style={{ color: C.muted }}>—</span>
                                  )}
                                </td>

                                {/* Note */}
                                <td style={{ ...tdBase, fontSize: 12, maxWidth: 180 }}>
                                  <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.note ? C.secondary : C.muted }}>
                                    {task.note ?? '—'}
                                  </span>
                                </td>

                                {/* Delete */}
                                <td style={{ ...tdBase, padding: '0 8px', textAlign: 'center' }}>
                                  <button
                                    onClick={() => askDeleteSprintTask(task.id, task.name, mainTask.id)}
                                    disabled={deletingStId === task.id}
                                    title="Delete subtask"
                                    style={{
                                      background: 'none', border: 'none',
                                      cursor: deletingStId === task.id ? 'not-allowed' : 'pointer',
                                      padding: 5, borderRadius: 5, color: C.muted,
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      transition: 'color 0.12s, background-color 0.12s',
                                    }}
                                    onMouseEnter={e => {
                                      if (deletingStId !== task.id) {
                                        (e.currentTarget as HTMLButtonElement).style.color = C.danger
                                        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)'
                                      }
                                    }}
                                    onMouseLeave={e => {
                                      if (deletingStId !== task.id) {
                                        (e.currentTarget as HTMLButtonElement).style.color = C.muted
                                        ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                                      }
                                    }}
                                  >
                                    <Trash2 size={12} />
                                  </button>
                                </td>
                              </tr>

                              {/* Workload expand panel */}
                              {isExpanded && (
                                <tr>
                                  <td
                                    colSpan={NCOLS}
                                    style={{
                                      backgroundColor: C.elevated,
                                      padding: '14px 48px',
                                      borderBottom: `1px solid ${C.border}`,
                                      borderLeft: `3px solid ${C.primary}`,
                                    }}
                                  >
                                    {entry ? (
                                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 24px' }}>
                                        {[
                                          { label: 'Planned',    value: displayTime(entry.planned_time) },
                                          { label: 'Actual',     value: displayTime(entry.actual_time)  },
                                          { label: 'Start Date', value: entry.start_date ?? '—'         },
                                          { label: 'Due Date',   value: entry.due_date   ?? '—'         },
                                        ].map(({ label, value }) => (
                                          <div key={label}>
                                            <p style={{ margin: '0 0 4px', fontSize: 10, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
                                            <p style={{ margin: 0, fontSize: 13, color: value === '—' ? C.muted : C.text }}>{value}</p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                                        No workload entry.{' '}
                                        <span style={{ color: C.secondary }}>Set status to In Progress</span>{' '}
                                        to auto-create one.
                                      </p>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          )
                        })}

                        {/* Add subtask row */}
                        <tr>
                          <td colSpan={NCOLS} style={{ padding: '8px 16px', backgroundColor: C.bg, borderTop: `1px solid ${C.border}` }}>
                            {addingFor === mainTask.id ? (
                              <form
                                onSubmit={e => handleAdd(e, mainTask.id)}
                                style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                              >
                                <input
                                  type="text" value={addName} autoFocus
                                  onChange={e => setAddName(e.target.value)}
                                  placeholder="Subtask name…"
                                  style={{
                                    flex: 1, minWidth: 160,
                                    backgroundColor: C.surface, border: `1.5px solid ${C.primary}`,
                                    borderRadius: 6, color: C.text, fontSize: 13,
                                    padding: '6px 10px', outline: 'none', fontFamily: 'inherit',
                                  }}
                                />
                                <div style={{ position: 'relative' }}>
                                  <select
                                    value={addPriority}
                                    onChange={e => setAddPriority(e.target.value as TaskPriority)}
                                    style={{
                                      backgroundColor: C.elevated, border: `1px solid ${C.borderHover}`,
                                      borderRadius: 8, color: PRIORITY_CONFIG[addPriority].color,
                                      fontSize: 12, fontWeight: 500, padding: '6px 28px 6px 10px',
                                      outline: 'none', cursor: 'pointer', fontFamily: 'inherit', appearance: 'none',
                                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                                    }}
                                  >
                                    {(['low', 'medium', 'high', 'critical'] as TaskPriority[]).map(p => (
                                      <option key={p} value={p} style={{ backgroundColor: C.elevated, color: C.text }}>
                                        {PRIORITY_CONFIG[p].label}
                                      </option>
                                    ))}
                                  </select>
                                  <ChevronRight size={10} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%) rotate(90deg)', color: C.muted, pointerEvents: 'none' }} />
                                </div>
                                <button
                                  type="submit" disabled={addLoading || !addName.trim()}
                                  style={{ backgroundColor: addLoading || !addName.trim() ? C.primaryHover : C.primary, color: '#fff', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 500, padding: '6px 14px', cursor: addLoading || !addName.trim() ? 'not-allowed' : 'pointer', opacity: addLoading || !addName.trim() ? 0.5 : 1, fontFamily: 'inherit' }}
                                >
                                  {addLoading ? 'Adding…' : 'Add'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => { setAddingFor(null); setAddName(''); setAddPriority('medium') }}
                                  style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, color: C.secondary, fontSize: 12, padding: '6px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}
                                >
                                  <X size={12} />
                                  Cancel
                                </button>
                              </form>
                            ) : (
                              <button
                                onClick={() => { setAddingFor(mainTask.id); setAddName(''); setAddPriority('medium') }}
                                style={{ background: 'none', border: 'none', color: C.muted, fontSize: 12, cursor: 'pointer', padding: '3px 0', display: 'inline-flex', alignItems: 'center', gap: 5, transition: 'color 0.12s', fontFamily: 'inherit' }}
                                onMouseEnter={e => (e.currentTarget.style.color = C.primary)}
                                onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                              >
                                <Plus size={13} />
                                Add subtask
                              </button>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
