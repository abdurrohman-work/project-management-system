'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { minutesToHours } from '@/lib/time'
import type { MainTask, MainTaskStatus, TaskPriority, InsertMainTask } from '@/types/database'

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:       '#18232d',
  sidebar:  '#111b24',
  surface:  '#1e2d3d',
  border:   '#2a3f52',
  accent:   '#3f9cfb',
  text:     '#ffffff',
  muted:    'rgba(255,255,255,0.5)',
}

// ─── Badge styles ─────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<MainTaskStatus, { bg: string; color: string; label: string }> = {
  backlog:     { bg: '#374151', color: '#9ca3af', label: 'Backlog'     },
  in_progress: { bg: '#1e3a5f', color: '#3f9cfb', label: 'In Progress' },
  blocked:     { bg: '#450a0a', color: '#f87171', label: 'Blocked'     },
  stopped:     { bg: '#431407', color: '#fb923c', label: 'Stopped'     },
  done:        { bg: '#052e16', color: '#4ade80', label: 'Done'        },
}

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; color: string }> = {
  low:      { bg: '#374151', color: '#9ca3af' },
  medium:   { bg: '#1e3a5f', color: '#60a5fa' },
  high:     { bg: '#431407', color: '#fb923c' },
  critical: { bg: '#450a0a', color: '#f87171' },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDeadline(dt: string | null): { text: string; muted: boolean } {
  if (!dt) return { text: '—', muted: true }
  const d = new Date(dt)
  const text = d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
  return { text, muted: false }
}

function formatTime(minutes: number): string {
  if (minutes === 0) return '—'
  return minutesToHours(minutes)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MainTaskStatus }) {
  const s = STATUS_BADGE[status]
  return (
    <span style={{
      backgroundColor: s.bg, color: s.color,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap',
    }}>
      {s.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_BADGE[priority]
  return (
    <span style={{
      backgroundColor: p.bg, color: p.color,
      padding: '2px 8px', borderRadius: 9999,
      fontSize: 11, fontWeight: 500,
      textTransform: 'capitalize', whiteSpace: 'nowrap',
    }}>
      {priority}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div style={{ flex: 1, height: 6, backgroundColor: C.border, borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: 6, width: `${pct}%`, backgroundColor: '#4ade80', borderRadius: 9999 }} />
      </div>
      <span style={{ color: C.muted, fontSize: 12, minWidth: 32, textAlign: 'right' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function MetricCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16 }}>
      <p style={{ color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
        {label}
      </p>
      <p style={{ color, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[80, 200, 100, 90, 80, 110, 130, 120, 80].map((w, i) => (
        <td key={i} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{
            height: 14, width: w, borderRadius: 4,
            backgroundColor: C.surface,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks, setTasks]           = useState<MainTask[]>([])
  const [loading, setLoading]       = useState(true)
  const [showForm, setShowForm]     = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formName, setFormName]     = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium')
  const [formError, setFormError]   = useState<string | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from('main_tasks')
        .select('*')
        .order('created_at', { ascending: false })
      if (!error && data) setTasks(data)
      setLoading(false)
    }
    fetchTasks()
  }, [])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const total      = tasks.length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const blocked    = tasks.filter(t => t.status === 'blocked').length
  const done       = tasks.filter(t => t.status === 'done').length

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)
    const name = formName.trim()
    if (!name) { setFormError('Name is required.'); return }
    setSubmitting(true)

    const payload: InsertMainTask = {
      name,
      status: 'backlog',
      priority: formPriority,
      category: formCategory.trim() || null,
    }

    const { data, error } = await supabase
      .from('main_tasks')
      .insert(payload)
      .select()
      .single()

    setSubmitting(false)
    if (error) { setFormError(error.message); return }
    if (data) setTasks(prev => [data, ...prev])
    setFormName(''); setFormCategory(''); setFormPriority('medium'); setShowForm(false)
  }

  // ── Input styles ───────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    backgroundColor: C.bg,
    border: `1px solid ${C.border}`,
    borderRadius: 6,
    color: C.text,
    padding: '6px 10px',
    fontSize: 13,
    outline: 'none',
    width: '100%',
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '24px 24px' }}>

      {/* ── Top bar ── */}
      <div className="flex items-center justify-between mb-6">
        <h1 style={{ color: C.text, fontSize: 20, fontWeight: 600 }}>Dashboard</h1>
        <button
          onClick={() => { setShowForm(v => !v); setFormError(null) }}
          style={{
            backgroundColor: C.accent, color: '#fff',
            border: 'none', borderRadius: 6,
            padding: '8px 16px', fontSize: 13, fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + New Task
        </button>
      </div>

      {/* ── Metric cards ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, height: 80 }} />
          ))
        ) : (
          <>
            <MetricCard label="Total Tasks"  value={total}      color={C.text}    />
            <MetricCard label="In Progress"  value={inProgress} color={C.accent}  />
            <MetricCard label="Blocked"      value={blocked}    color="#f87171"   />
            <MetricCard label="Done"         value={done}       color="#4ade80"   />
          </>
        )}
      </div>

      {/* ── Create form ── */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          style={{
            backgroundColor: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8, padding: 16, marginBottom: 16,
          }}
        >
          <p style={{ color: C.text, fontSize: 13, fontWeight: 600, marginBottom: 12 }}>New Task</p>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, marginBottom: 4 }}>
                Name <span style={{ color: '#f87171' }}>*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="Task name"
                autoFocus
                style={inputStyle}
              />
            </div>
            <div style={{ width: 140 }}>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, marginBottom: 4 }}>Category</label>
              <input
                type="text"
                value={formCategory}
                onChange={e => setFormCategory(e.target.value)}
                placeholder="e.g. Frontend"
                style={inputStyle}
              />
            </div>
            <div style={{ width: 130 }}>
              <label style={{ display: 'block', color: C.muted, fontSize: 11, marginBottom: 4 }}>Priority</label>
              <select
                value={formPriority}
                onChange={e => setFormPriority(e.target.value as TaskPriority)}
                style={inputStyle}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                style={{
                  backgroundColor: C.accent, color: '#fff',
                  border: 'none', borderRadius: 6,
                  padding: '7px 16px', fontSize: 13, fontWeight: 500,
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                }}
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(null) }}
                style={{
                  backgroundColor: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: 6, color: C.muted,
                  padding: '7px 16px', fontSize: 13, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
          {formError && (
            <p style={{ color: '#f87171', fontSize: 12, marginTop: 8 }}>{formError}</p>
          )}
        </form>
      )}

      {/* ── Table ── */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse' }}>

            {/* Header */}
            <thead>
              <tr style={{ backgroundColor: C.sidebar }}>
                {[
                  { label: 'ID',         width: 80  },
                  { label: 'Task',       width: 'auto' },
                  { label: 'Category',   width: 120 },
                  { label: 'Status',     width: 110 },
                  { label: 'Priority',   width: 90  },
                  { label: 'Deadline',   width: 150 },
                  { label: 'Task Owner', width: 160 },
                  { label: 'Progress',   width: 160 },
                  { label: 'Time Spent', width: 100 },
                ].map(col => (
                  <th
                    key={col.label}
                    style={{
                      padding: '10px 16px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 600,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      color: C.muted,
                      whiteSpace: 'nowrap',
                      width: col.width === 'auto' ? undefined : col.width,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : tasks.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: '60px 24px',
                      textAlign: 'center',
                      color: C.muted,
                      backgroundColor: C.bg,
                    }}
                  >
                    <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No tasks yet</p>
                    <p style={{ fontSize: 12 }}>Click &ldquo;+ New Task&rdquo; to create your first epic.</p>
                  </td>
                </tr>
              ) : (
                tasks.map(task => {
                  const deadline = formatDeadline(task.deadline)
                  return (
                    <tr
                      key={task.id}
                      style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}`, cursor: 'default' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surface)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.bg)}
                    >
                      {/* ID */}
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.accent, fontFamily: 'monospace', fontSize: 12 }}>
                          {task.display_id}
                        </span>
                      </td>
                      {/* Task */}
                      <td style={{ padding: '12px 16px', color: C.text, fontSize: 13, fontWeight: 500, maxWidth: 280 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.name}
                        </span>
                      </td>
                      {/* Category */}
                      <td style={{ padding: '12px 16px', fontSize: 13, color: task.category ? C.text : C.muted, whiteSpace: 'nowrap' }}>
                        {task.category ?? '—'}
                      </td>
                      {/* Status */}
                      <td style={{ padding: '12px 16px' }}>
                        <StatusBadge status={task.status} />
                      </td>
                      {/* Priority */}
                      <td style={{ padding: '12px 16px' }}>
                        <PriorityBadge priority={task.priority} />
                      </td>
                      {/* Deadline */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: deadline.muted ? C.muted : C.text, whiteSpace: 'nowrap' }}>
                        {deadline.text}
                      </td>
                      {/* Task Owner */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: task.task_owner ? C.text : C.muted, whiteSpace: 'nowrap', maxWidth: 160 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {task.task_owner ?? '—'}
                        </span>
                      </td>
                      {/* Progress */}
                      <td style={{ padding: '12px 16px', minWidth: 140 }}>
                        <ProgressBar value={task.progress} />
                      </td>
                      {/* Time Spent */}
                      <td style={{ padding: '12px 16px', fontSize: 12, color: task.time_spent ? C.text : C.muted, whiteSpace: 'nowrap' }}>
                        {formatTime(task.time_spent)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  )
}
