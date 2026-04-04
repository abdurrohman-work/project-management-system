'use client'

import { useEffect, useState } from 'react'
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

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:      '#18232d',
  sidebar: '#111b24',
  surface: '#1e2d3d',
  border:  '#2a3f52',
  accent:  '#3f9cfb',
  text:    '#ffffff',
  muted:   'rgba(255,255,255,0.5)',
}

// ─── Badge maps ───────────────────────────────────────────────────────────────

const MT_STATUS_BADGE: Record<MainTaskStatus, { bg: string; color: string; label: string }> = {
  backlog:     { bg: '#374151', color: '#9ca3af', label: 'Backlog'      },
  in_progress: { bg: '#1e3a5f', color: '#3f9cfb', label: 'In Progress'  },
  blocked:     { bg: '#450a0a', color: '#f87171', label: 'Blocked'      },
  stopped:     { bg: '#431407', color: '#fb923c', label: 'Stopped'      },
  done:        { bg: '#052e16', color: '#4ade80', label: 'Done'         },
}

const ST_STATUS_BADGE: Record<SprintTaskStatus, { bg: string; color: string; label: string }> = {
  not_started:      { bg: '#374151', color: '#9ca3af', label: 'Not Started'   },
  in_progress:      { bg: '#1e3a5f', color: '#3f9cfb', label: 'In Progress'   },
  done:             { bg: '#052e16', color: '#4ade80', label: 'Done'          },
  partly_completed: { bg: '#422006', color: '#fbbf24', label: 'Partly Done'   },
  blocked:          { bg: '#450a0a', color: '#f87171', label: 'Blocked'       },
  stopped:          { bg: '#431407', color: '#fb923c', label: 'Stopped'       },
}

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; color: string }> = {
  low:      { bg: '#374151', color: '#9ca3af' },
  medium:   { bg: '#1e3a5f', color: '#60a5fa' },
  high:     { bg: '#431407', color: '#fb923c' },
  critical: { bg: '#450a0a', color: '#f87171' },
}

const ALL_STATUSES: SprintTaskStatus[] = [
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
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const res = await fetch('/api/sprints/active')
      const json = await res.json()
      if (json.success) {
        setSprint(json.data.sprint)
        setGroups(json.data.groups)
      }
      setLoading(false)
    }
    load()
  }, [])

  // ── Toggle group collapse ─────────────────────────────────────────────────
  function toggleGroup(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Toggle row workload expand ────────────────────────────────────────────
  function toggleRow(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Status change ─────────────────────────────────────────────────────────
  async function handleStatusChange(taskId: string, newStatus: SprintTaskStatus) {
    // Optimistic update
    setGroups(prev => prev.map(g => ({
      ...g,
      sprintTasks: g.sprintTasks.map(t =>
        t.id === taskId ? { ...t, status: newStatus } : t
      ),
    })))

    await fetch(`/api/sprint-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
  }

  // ── Add subtask ───────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent, mainTaskId: string) {
    e.preventDefault()
    if (!sprint || !addName.trim()) return
    setAddLoading(true)

    const res = await fetch('/api/sprint-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        main_task_id: mainTaskId,
        sprint_id: sprint.id,
        name: addName.trim(),
        priority: addPriority,
      }),
    })
    const json = await res.json()

    if (json.success) {
      const newTask: SprintTaskWithEntry = { ...json.data, workload_entries: [] }
      setGroups(prev => prev.map(g =>
        g.mainTask.id === mainTaskId
          ? { ...g, sprintTasks: [...g.sprintTasks, newTask] }
          : g
      ))
    }

    setAddName('')
    setAddPriority('medium')
    setAddingFor(null)
    setAddLoading(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px 32px', backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        {loading ? (
          <div style={{ height: 28, width: 240, borderRadius: 4, backgroundColor: C.surface }} />
        ) : sprint ? (
          <>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
              {sprint.name}
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: C.muted }}>
              {formatRange(sprint.start_date, sprint.end_date)}
            </p>
          </>
        ) : (
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
            No Active Sprint
          </h1>
        )}
      </div>

      {/* Empty state */}
      {!loading && groups.length === 0 && (
        <div style={{
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          backgroundColor: C.surface,
          padding: '48px 24px',
          textAlign: 'center',
        }}>
          <p style={{ color: C.muted, fontSize: 14, margin: 0 }}>No sprint tasks yet.</p>
          <p style={{ color: C.muted, fontSize: 12, margin: '4px 0 0' }}>
            Add sprint tasks from the Dashboard.
          </p>
        </div>
      )}

      {/* Groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {groups.map(({ mainTask, sprintTasks }) => {
          const isCollapsed = collapsed.has(mainTask.id)
          const mt = MT_STATUS_BADGE[mainTask.status]
          const pct = Math.min(100, Math.max(0, mainTask.progress))

          return (
            <div
              key={mainTask.id}
              style={{
                border: `1px solid ${C.border}`,
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {/* Group header — clickable to collapse */}
              <div
                onClick={() => toggleGroup(mainTask.id)}
                style={{
                  backgroundColor: C.sidebar,
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                {/* Chevron */}
                <svg
                  width="12" height="12" viewBox="0 0 24 24"
                  fill="none" stroke={C.muted} strokeWidth={2.5}
                  strokeLinecap="round" strokeLinejoin="round"
                  style={{
                    flexShrink: 0,
                    transform: isCollapsed ? 'rotate(0deg)' : 'rotate(90deg)',
                    transition: 'transform 0.15s',
                  }}
                >
                  <path d="M9 5l7 7-7 7" />
                </svg>

                {/* MT display_id */}
                <span style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  color: C.accent,
                  flexShrink: 0,
                }}>
                  {mainTask.display_id ?? '—'}
                </span>

                {/* Task name */}
                <span style={{ fontSize: 14, fontWeight: 600, color: C.text, flex: 1 }}>
                  {mainTask.name}
                </span>

                {/* Status badge */}
                <span style={{
                  backgroundColor: mt.bg,
                  color: mt.color,
                  fontSize: 11,
                  fontWeight: 500,
                  padding: '2px 8px',
                  borderRadius: 99,
                  flexShrink: 0,
                }}>
                  {mt.label}
                </span>

                {/* Mini progress bar */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  <div style={{
                    width: 72,
                    height: 4,
                    backgroundColor: C.border,
                    borderRadius: 99,
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`,
                      height: '100%',
                      backgroundColor: '#4ade80',
                      borderRadius: 99,
                    }} />
                  </div>
                  <span style={{ fontSize: 11, color: C.muted, minWidth: 28 }}>
                    {pct.toFixed(0)}%
                  </span>
                </div>
              </div>

              {/* Sprint task rows */}
              {!isCollapsed && (
                <>
                  {sprintTasks.map((task) => {
                    const entry = task.workload_entries[0] ?? null
                    const isExpanded = expanded.has(task.id)
                    const isHovered = hoveredRow === task.id
                    const st = ST_STATUS_BADGE[task.status]
                    const pr = PRIORITY_BADGE[task.priority]

                    return (
                      <div
                        key={task.id}
                        style={{ borderTop: `1px solid ${C.border}` }}
                      >
                        {/* Task row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 16px',
                            backgroundColor: isHovered ? C.surface : C.bg,
                            transition: 'background-color 0.1s',
                          }}
                          onMouseEnter={() => setHoveredRow(task.id)}
                          onMouseLeave={() => setHoveredRow(null)}
                        >
                          {/* Expand toggle */}
                          <button
                            onClick={() => toggleRow(task.id)}
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: 0,
                              flexShrink: 0,
                              color: C.muted,
                              lineHeight: 1,
                            }}
                            aria-label={isExpanded ? 'Collapse' : 'Expand'}
                          >
                            <svg
                              width="12" height="12" viewBox="0 0 24 24"
                              fill="none" stroke="currentColor" strokeWidth={2.5}
                              strokeLinecap="round" strokeLinejoin="round"
                              style={{
                                transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                                transition: 'transform 0.15s',
                              }}
                            >
                              <path d="M9 5l7 7-7 7" />
                            </svg>
                          </button>

                          {/* ST display_id */}
                          <span style={{
                            fontFamily: 'monospace',
                            fontSize: 12,
                            color: C.accent,
                            flexShrink: 0,
                            minWidth: 52,
                          }}>
                            {task.display_id ?? '—'}
                          </span>

                          {/* Task name */}
                          <span style={{ fontSize: 13, color: C.text, flex: 1 }}>
                            {task.name}
                          </span>

                          {/* Status dropdown */}
                          <select
                            value={task.status}
                            onChange={(e) =>
                              handleStatusChange(task.id, e.target.value as SprintTaskStatus)
                            }
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              backgroundColor: st.bg,
                              color: st.color,
                              border: 'none',
                              borderRadius: 99,
                              fontSize: 11,
                              fontWeight: 500,
                              padding: '3px 10px',
                              cursor: 'pointer',
                              flexShrink: 0,
                              outline: 'none',
                              appearance: 'none',
                            }}
                          >
                            {ALL_STATUSES.map(s => (
                              <option key={s} value={s} style={{ backgroundColor: '#1e2d3d', color: '#fff' }}>
                                {ST_STATUS_BADGE[s].label}
                              </option>
                            ))}
                          </select>

                          {/* Priority badge */}
                          <span style={{
                            backgroundColor: pr.bg,
                            color: pr.color,
                            fontSize: 11,
                            fontWeight: 500,
                            padding: '2px 8px',
                            borderRadius: 99,
                            flexShrink: 0,
                            textTransform: 'capitalize',
                          }}>
                            {task.priority}
                          </span>
                        </div>

                        {/* Workload entry panel */}
                        {isExpanded && (
                          <div style={{
                            borderTop: `1px solid ${C.border}`,
                            backgroundColor: C.surface,
                            padding: '12px 40px',
                          }}>
                            {entry ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px 24px' }}>
                                <div>
                                  <p style={{ margin: '0 0 4px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>SP (h)</p>
                                  <p style={{ margin: 0, fontSize: 13, color: C.text }}>{displayTime(entry.planned_time)}</p>
                                </div>
                                <div>
                                  <p style={{ margin: '0 0 4px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>AP (h)</p>
                                  <p style={{ margin: 0, fontSize: 13, color: C.text }}>{displayTime(entry.actual_time)}</p>
                                </div>
                                <div>
                                  <p style={{ margin: '0 0 4px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Start</p>
                                  <p style={{ margin: 0, fontSize: 13, color: entry.start_date ? C.text : C.muted }}>
                                    {entry.start_date ?? '—'}
                                  </p>
                                </div>
                                <div>
                                  <p style={{ margin: '0 0 4px', fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due</p>
                                  <p style={{ margin: 0, fontSize: 13, color: entry.due_date ? C.text : C.muted }}>
                                    {entry.due_date ?? '—'}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                                No workload entry. Set status to{' '}
                                <span style={{ color: C.text }}>In Progress</span> to auto-create one.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Add subtask row */}
                  <div style={{
                    borderTop: `1px solid ${C.border}`,
                    padding: '8px 16px',
                    backgroundColor: C.bg,
                  }}>
                    {addingFor === mainTask.id ? (
                      <form
                        onSubmit={(e) => handleAdd(e, mainTask.id)}
                        style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}
                      >
                        <input
                          type="text"
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          placeholder="Subtask name"
                          autoFocus
                          style={{
                            flex: 1,
                            minWidth: 160,
                            backgroundColor: C.bg,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            color: C.text,
                            fontSize: 13,
                            padding: '5px 10px',
                            outline: 'none',
                          }}
                        />
                        <select
                          value={addPriority}
                          onChange={(e) => setAddPriority(e.target.value as TaskPriority)}
                          style={{
                            backgroundColor: C.surface,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            color: C.text,
                            fontSize: 12,
                            padding: '5px 8px',
                            outline: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="critical">Critical</option>
                        </select>
                        <button
                          type="submit"
                          disabled={addLoading || !addName.trim()}
                          style={{
                            backgroundColor: C.accent,
                            color: '#fff',
                            border: 'none',
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 500,
                            padding: '5px 14px',
                            cursor: addLoading || !addName.trim() ? 'not-allowed' : 'pointer',
                            opacity: addLoading || !addName.trim() ? 0.5 : 1,
                          }}
                        >
                          {addLoading ? 'Adding…' : 'Add'}
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAddingFor(null); setAddName(''); setAddPriority('medium') }}
                          style={{
                            backgroundColor: 'transparent',
                            color: C.muted,
                            border: `1px solid ${C.border}`,
                            borderRadius: 6,
                            fontSize: 12,
                            padding: '5px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </form>
                    ) : (
                      <button
                        onClick={() => { setAddingFor(mainTask.id); setAddName(''); setAddPriority('medium') }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: C.accent,
                          fontSize: 12,
                          cursor: 'pointer',
                          padding: '2px 0',
                        }}
                      >
                        + Add subtask
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
