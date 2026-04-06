'use client'

import { useEffect, useState } from 'react'
import {
  Plus, X, Flag, Trash2, ChevronDown,
  LayoutDashboard,
} from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type { MainTask, MainTaskStatus, TaskPriority } from '@/types/database'

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
  success:      '#22C55E',
  warning:      '#F59E0B',
  info:         '#3B82F6',
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Platform Management',
  'Course Management',
  'IT Operations',
  'Administrative / Office',
  'Finance & Billing',
  'Technical Support',
  'Data & Analytics',
  'Telephony/CRM',
  'Others',
]

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MainTaskStatus, { dot: string; text: string; bg: string; label: string }> = {
  backlog:     { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Backlog'      },
  in_progress: { dot: '#60A5FA', text: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  label: 'In Progress'  },
  blocked:     { dot: '#F87171', text: '#F87171', bg: 'rgba(239,68,68,0.12)',   label: 'Blocked'      },
  stopped:     { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Stopped'      },
  done:        { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Done'         },
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Critical' },
  high:     { color: '#F59E0B', label: 'High'     },
  medium:   { color: '#3B82F6', label: 'Medium'   },
  low:      { color: '#6B7280', label: 'Low'      },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function toInputDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

function fromInputDate(val: string): string | null {
  return val ? new Date(val).toISOString() : null
}

function formatTime(minutes: number): string {
  return minutes === 0 ? '—' : minutesToHours(minutes)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MainTaskStatus }) {
  const s = STATUS_CONFIG[status]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        backgroundColor: s.bg,
        color: s.text,
        padding: '3px 8px',
        borderRadius: 9999,
        fontSize: 11,
        fontWeight: 500,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: s.dot,
          flexShrink: 0,
        }}
      />
      {s.label}
    </span>
  )
}

function PriorityFlag({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_CONFIG[priority]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        color: p.color,
      }}
    >
      <Flag size={13} fill={p.color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</span>
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = pct >= 100 ? '#4ADE80' : pct >= 50 ? '#60A5FA' : '#F59E0B'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          backgroundColor: C.border,
          borderRadius: 9999,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: 4,
            width: `${pct}%`,
            backgroundColor: color,
            borderRadius: 9999,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <span
        style={{
          color: C.secondary,
          fontSize: 11,
          minWidth: 30,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  color,
  sub,
}: {
  label: string
  value: number
  color: string
  sub?: string
}) {
  return (
    <div
      style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 10,
        padding: '16px 20px',
      }}
    >
      <p
        style={{
          margin: '0 0 10px',
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: C.muted,
        }}
      >
        {label}
      </p>
      <p
        style={{
          margin: 0,
          fontSize: 28,
          fontWeight: 700,
          color,
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </p>
      {sub && (
        <p style={{ margin: '6px 0 0', fontSize: 11, color: C.muted }}>{sub}</p>
      )}
    </div>
  )
}

// ─── Modal field label ────────────────────────────────────────────────────────

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <label
      style={{
        display: 'block',
        fontSize: 12,
        fontWeight: 500,
        color: C.secondary,
        marginBottom: 6,
      }}
    >
      {children}
      {required && <span style={{ color: C.danger, marginLeft: 2 }}>*</span>}
    </label>
  )
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const modalInputStyle: React.CSSProperties = {
  width: '100%',
  backgroundColor: C.bg,
  border: `1px solid ${C.border}`,
  borderRadius: 6,
  color: C.text,
  padding: '8px 12px',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

// ─── Initial form state ───────────────────────────────────────────────────────

const EMPTY_FORM = {
  name:       '',
  category:   '',
  priority:   'medium' as TaskPriority,
  taken_at:   '',
  deadline:   '',
  task_owner: '',
  note:       '',
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'display_id', label: 'ID',          width: 72  },
  { key: 'name',       label: 'Task',        width: undefined },
  { key: 'category',   label: 'Category',    width: 150 },
  { key: 'status',     label: 'Status',      width: 120 },
  { key: 'priority',   label: 'Priority',    width: 100 },
  { key: 'taken_at',   label: 'Taken At',    width: 120 },
  { key: 'deadline',   label: 'Deadline',    width: 120 },
  { key: 'task_owner', label: 'Owner',       width: 130 },
  { key: 'progress',   label: 'Progress',    width: 150 },
  { key: 'time_spent', label: 'Time Spent',  width: 90  },
  { key: 'blocked_by', label: 'Blocked By',  width: 120 },
  { key: 'note',       label: 'Note',        width: 160 },
  { key: '_delete',    label: '',            width: 44  },
]

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks,      setTasks]      = useState<MainTask[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [editCell,   setEditCell]   = useState<{ taskId: string; field: string } | null>(null)
  const [editValue,  setEditValue]  = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/main-tasks')
      .then(r => r.json())
      .then(j => { if (j.success) setTasks(j.data) })
      .finally(() => setLoading(false))
  }, [])

  // ── Metrics ────────────────────────────────────────────────────────────────
  const total      = tasks.length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const blocked    = tasks.filter(t => t.status === 'blocked').length
  const done       = tasks.filter(t => t.status === 'done').length

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return
    setDeletingId(id)
    const res  = await fetch(`/api/main-tasks/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingId(null)
    if (json.success) setTasks(prev => prev.filter(t => t.id !== id))
  }

  // ── Create ─────────────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) { setFormError('Task name is required.'); return }
    setSubmitting(true)
    setFormError(null)

    const res = await fetch('/api/main-tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:       form.name.trim(),
        category:   form.category   || null,
        priority:   form.priority,
        taken_at:   fromInputDate(form.taken_at),
        deadline:   fromInputDate(form.deadline),
        task_owner: form.task_owner.trim() || null,
        note:       form.note.trim()       || null,
      }),
    })
    const json = await res.json()
    setSubmitting(false)

    if (!json.success) { setFormError(json.error || 'Failed to create task.'); return }
    setTasks(prev => [json.data, ...prev])
    setForm(EMPTY_FORM)
    setShowModal(false)
  }

  // ── Inline edit ────────────────────────────────────────────────────────────
  function startEdit(taskId: string, field: string, value: string) {
    setEditCell({ taskId, field })
    setEditValue(value)
  }

  function cancelEdit() { setEditCell(null) }

  async function saveEdit(taskId: string, field: string, rawValue: string) {
    setEditCell(null)
    const body: Record<string, unknown> = {}
    if (field === 'taken_at' || field === 'deadline') {
      body[field] = fromInputDate(rawValue)
    } else if (field === 'priority') {
      body[field] = rawValue as TaskPriority
    } else {
      body[field] = rawValue.trim() || null
    }
    const res  = await fetch(`/api/main-tasks/${taskId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (json.success) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...json.data } : t))
    }
  }

  // ── Cell edit styles ───────────────────────────────────────────────────────
  const cellInput: React.CSSProperties = {
    backgroundColor: C.bg,
    border:          `1.5px solid ${C.primary}`,
    borderRadius:    5,
    color:           C.text,
    padding:         '3px 8px',
    fontSize:        13,
    outline:         'none',
    width:           '100%',
    fontFamily:      'inherit',
    boxShadow:       `0 0 0 3px rgba(123,104,238,0.15)`,
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* ── Top header bar ── */}
      <div
        style={{
          height: 56,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px',
          backgroundColor: C.bg,
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LayoutDashboard size={16} style={{ color: C.primary }} />
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>
            Dashboard
          </h1>
          <span
            style={{
              backgroundColor: 'rgba(123,104,238,0.12)',
              color: C.primary,
              fontSize: 11,
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: 9999,
            }}
          >
            {loading ? '…' : total}
          </span>
        </div>

        <button
          onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(null) }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            backgroundColor: C.primary,
            color: '#fff',
            border: 'none',
            borderRadius: 7,
            padding: '7px 14px',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'background-color 0.12s',
          }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.primaryHover)}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.primary)}
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ── Metric cards ── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 12,
            marginBottom: 24,
          }}
        >
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    height: 88,
                    backgroundColor: C.surface,
                    border: `1px solid ${C.border}`,
                    borderRadius: 10,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                />
              ))
            : (
              <>
                <MetricCard label="Total Tasks"  value={total}      color={C.text}    sub="all epics"        />
                <MetricCard label="In Progress"  value={inProgress} color={C.primary} sub="currently active" />
                <MetricCard label="Blocked"      value={blocked}    color="#F87171"   sub="need attention"   />
                <MetricCard label="Done"         value={done}       color="#4ADE80"   sub="completed"        />
              </>
            )
          }
        </div>

        {/* ── Modal ── */}
        {showModal && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            onClick={() => setShowModal(false)}
          >
            <form
              onSubmit={handleCreate}
              onClick={e => e.stopPropagation()}
              style={{
                backgroundColor: C.surface,
                border:          `1px solid ${C.border}`,
                borderRadius:    12,
                width:           540,
                maxWidth:        '95vw',
                maxHeight:       '90vh',
                overflowY:       'auto',
                zIndex:          51,
                boxShadow:       '0 24px 48px rgba(0,0,0,0.35)',
              }}
            >
              {/* Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '18px 24px',
                  borderBottom: `1px solid ${C.border}`,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>
                  Create New Task
                </h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: C.muted,
                    cursor: 'pointer',
                    padding: 4,
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Body */}
              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                {/* Task name */}
                <div>
                  <FieldLabel required>Task Name</FieldLabel>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter task name…"
                    autoFocus
                    style={modalInputStyle}
                  />
                </div>

                {/* Category + Priority */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        style={{ ...modalInputStyle, paddingRight: 32, cursor: 'pointer' }}
                      >
                        <option value="">— Select —</option>
                        {CATEGORIES.map(c => (
                          <option key={c} value={c} style={{ backgroundColor: C.surface }}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Priority</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={form.priority}
                        onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                        style={{ ...modalInputStyle, paddingRight: 32, cursor: 'pointer' }}
                      >
                        {PRIORITIES.map(p => (
                          <option key={p} value={p} style={{ backgroundColor: C.surface }}>
                            {PRIORITY_CONFIG[p].label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                {/* Taken At + Deadline */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel>Taken At</FieldLabel>
                    <input
                      type="datetime-local"
                      value={form.taken_at}
                      onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))}
                      style={modalInputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Deadline</FieldLabel>
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                      style={modalInputStyle}
                    />
                  </div>
                </div>

                {/* Task Owner */}
                <div>
                  <FieldLabel>Task Owner</FieldLabel>
                  <input
                    type="text"
                    value={form.task_owner}
                    onChange={e => setForm(f => ({ ...f, task_owner: e.target.value }))}
                    placeholder="e.g. john@example.com"
                    style={modalInputStyle}
                  />
                </div>

                {/* Note */}
                <div>
                  <FieldLabel>Note</FieldLabel>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Optional notes…"
                    rows={3}
                    style={{ ...modalInputStyle, resize: 'vertical', minHeight: 72 }}
                  />
                </div>

                {formError && (
                  <p style={{ margin: 0, fontSize: 12, color: C.danger }}>{formError}</p>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  padding: '14px 24px',
                  borderTop: `1px solid ${C.border}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: 'transparent',
                    border: `1px solid ${C.border}`,
                    borderRadius: 7,
                    color: C.secondary,
                    padding: '7px 16px',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = C.borderHover)}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    backgroundColor: submitting ? C.primaryHover : C.primary,
                    color: '#fff',
                    border: 'none',
                    borderRadius: 7,
                    padding: '7px 20px',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Table ── */}
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: C.surface,
          }}
        >
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1380, borderCollapse: 'collapse' }}>

              {/* Colgroup */}
              <colgroup>
                {COLUMNS.map(col => (
                  <col key={col.key} style={{ width: col.width ?? undefined }} />
                ))}
              </colgroup>

              {/* Head */}
              <thead>
                <tr style={{ backgroundColor: C.sidebar }}>
                  {COLUMNS.map(col => (
                    <th
                      key={col.key}
                      style={{
                        padding: '0 14px',
                        height: 36,
                        textAlign: 'left',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: C.muted,
                        whiteSpace: 'nowrap',
                        borderBottom: `1px solid ${C.border}`,
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
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.map((col, j) => (
                        <td
                          key={j}
                          style={{
                            padding: '10px 14px',
                            borderBottom: `1px solid ${C.border}`,
                          }}
                        >
                          <div
                            style={{
                              height: 12,
                              width: j === 1 ? 180 : j === 0 ? 40 : 80,
                              borderRadius: 4,
                              backgroundColor: C.elevated,
                            }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : tasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.length}
                      style={{
                        padding: '64px 24px',
                        textAlign: 'center',
                        color: C.muted,
                      }}
                    >
                      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>
                        No tasks yet
                      </p>
                      <p style={{ margin: 0, fontSize: 12 }}>
                        Click &ldquo;New Task&rdquo; to create your first epic.
                      </p>
                    </td>
                  </tr>
                ) : (
                  tasks.map(task => {
                    const isEditing = (field: string) =>
                      editCell?.taskId === task.id && editCell.field === field

                    const onKeyDown =
                      (field: string) =>
                      (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
                        if (e.key === 'Enter')  saveEdit(task.id, field, editValue)
                        if (e.key === 'Escape') cancelEdit()
                      }

                    return (
                      <tr
                        key={task.id}
                        style={{
                          backgroundColor: C.surface,
                          borderBottom: `1px solid ${C.border}`,
                          transition: 'background-color 0.08s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surfaceHover)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.surface)}
                      >

                        {/* ID */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: 11,
                              color: C.primary,
                              backgroundColor: 'rgba(123,104,238,0.1)',
                              padding: '2px 6px',
                              borderRadius: 4,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {task.display_id}
                          </span>
                        </td>

                        {/* Task name */}
                        <td style={{ padding: '0 14px', height: 40, maxWidth: 260 }}>
                          {isEditing('name') ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'name', editValue)}
                              onKeyDown={onKeyDown('name')}
                              style={cellInput}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'name', task.name)}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: C.text,
                                fontWeight: 500,
                                fontSize: 13,
                                cursor: 'text',
                              }}
                            >
                              {task.name}
                            </span>
                          )}
                        </td>

                        {/* Category */}
                        <td style={{ padding: '0 14px', height: 40, maxWidth: 150 }}>
                          {isEditing('category') ? (
                            <div style={{ position: 'relative' }}>
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'category', e.target.value) }}
                                onBlur={() => cancelEdit()}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                style={{ ...cellInput, cursor: 'pointer', paddingRight: 28 }}
                              >
                                <option value="">— None —</option>
                                {CATEGORIES.map(c => (
                                  <option key={c} value={c} style={{ backgroundColor: C.surface }}>{c}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'category', task.category ?? '')}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: task.category ? C.secondary : C.muted,
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              {task.category ?? '—'}
                            </span>
                          )}
                        </td>

                        {/* Status — read-only */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <StatusBadge status={task.status} />
                        </td>

                        {/* Priority */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          {isEditing('priority') ? (
                            <div style={{ position: 'relative' }}>
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'priority', e.target.value) }}
                                onBlur={() => cancelEdit()}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                style={{ ...cellInput, cursor: 'pointer', width: 'auto', paddingRight: 24 }}
                              >
                                {PRIORITIES.map(p => (
                                  <option key={p} value={p} style={{ backgroundColor: C.surface }}>
                                    {PRIORITY_CONFIG[p].label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'priority', task.priority)}
                              title="Click to edit"
                              style={{ cursor: 'pointer' }}
                            >
                              <PriorityFlag priority={task.priority} />
                            </span>
                          )}
                        </td>

                        {/* Taken At */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          {isEditing('taken_at') ? (
                            <input
                              type="datetime-local"
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'taken_at', editValue)}
                              onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                              style={{ ...cellInput, fontSize: 12 }}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'taken_at', toInputDate(task.taken_at))}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                whiteSpace: 'nowrap',
                                color: task.taken_at ? C.secondary : C.muted,
                                fontSize: 12,
                                cursor: 'text',
                              }}
                            >
                              {formatDate(task.taken_at)}
                            </span>
                          )}
                        </td>

                        {/* Deadline */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          {isEditing('deadline') ? (
                            <input
                              type="datetime-local"
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'deadline', editValue)}
                              onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                              style={{ ...cellInput, fontSize: 12 }}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'deadline', toInputDate(task.deadline))}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                whiteSpace: 'nowrap',
                                color: task.deadline ? C.secondary : C.muted,
                                fontSize: 12,
                                cursor: 'text',
                              }}
                            >
                              {formatDate(task.deadline)}
                            </span>
                          )}
                        </td>

                        {/* Task Owner */}
                        <td style={{ padding: '0 14px', height: 40, maxWidth: 130 }}>
                          {isEditing('task_owner') ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'task_owner', editValue)}
                              onKeyDown={onKeyDown('task_owner')}
                              style={cellInput}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'task_owner', task.task_owner ?? '')}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: task.task_owner ? C.secondary : C.muted,
                                fontSize: 12,
                                cursor: 'text',
                              }}
                            >
                              {task.task_owner ?? '—'}
                            </span>
                          )}
                        </td>

                        {/* Progress — read-only */}
                        <td style={{ padding: '0 14px', height: 40, minWidth: 140 }}>
                          <ProgressBar value={task.progress} />
                        </td>

                        {/* Time Spent — read-only */}
                        <td style={{ padding: '0 14px', height: 40, whiteSpace: 'nowrap' }}>
                          <span
                            style={{
                              fontSize: 12,
                              color: task.time_spent ? C.secondary : C.muted,
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatTime(task.time_spent)}
                          </span>
                        </td>

                        {/* Blocked By */}
                        <td style={{ padding: '0 14px', height: 40, maxWidth: 120 }}>
                          {isEditing('blocked_by') ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'blocked_by', editValue)}
                              onKeyDown={onKeyDown('blocked_by')}
                              style={cellInput}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'blocked_by', task.blocked_by ?? '')}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: task.blocked_by ? '#F87171' : C.muted,
                                fontSize: 12,
                                cursor: 'text',
                              }}
                            >
                              {task.blocked_by ?? '—'}
                            </span>
                          )}
                        </td>

                        {/* Note */}
                        <td style={{ padding: '0 14px', height: 40, maxWidth: 160 }}>
                          {isEditing('note') ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onBlur={() => saveEdit(task.id, 'note', editValue)}
                              onKeyDown={onKeyDown('note')}
                              style={cellInput}
                            />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'note', task.note ?? '')}
                              title="Click to edit"
                              style={{
                                display: 'block',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                                color: task.note ? C.secondary : C.muted,
                                fontSize: 12,
                                cursor: 'text',
                              }}
                            >
                              {task.note ?? '—'}
                            </span>
                          )}
                        </td>

                        {/* Delete */}
                        <td style={{ padding: '0 8px', height: 40, textAlign: 'center' }}>
                          <button
                            onClick={() => handleDelete(task.id, task.name)}
                            disabled={deletingId === task.id}
                            title="Delete task"
                            style={{
                              background: 'none',
                              border: 'none',
                              cursor: deletingId === task.id ? 'not-allowed' : 'pointer',
                              padding: '5px',
                              borderRadius: 5,
                              color: C.muted,
                              opacity: deletingId === task.id ? 0.3 : 1,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              transition: 'color 0.12s, background-color 0.12s',
                            }}
                            onMouseEnter={e => {
                              if (deletingId !== task.id) {
                                (e.currentTarget as HTMLButtonElement).style.color = C.danger
                                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.1)'
                              }
                            }}
                            onMouseLeave={e => {
                              if (deletingId !== task.id) {
                                (e.currentTarget as HTMLButtonElement).style.color = C.muted
                                ;(e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                              }
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
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
    </div>
  )
}
