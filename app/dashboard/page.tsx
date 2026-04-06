'use client'

import { useEffect, useState } from 'react'
import { minutesToHours } from '@/lib/time'
import type { MainTask, MainTaskStatus, TaskPriority } from '@/types/database'

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

function formatDate(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

/** Convert ISO string → datetime-local input value (YYYY-MM-DDTHH:mm) */
function toInputDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().slice(0, 16)
}

/** Convert datetime-local input value → ISO string or null */
function fromInputDate(val: string): string | null {
  return val ? new Date(val).toISOString() : null
}

function formatTime(minutes: number): string {
  return minutes === 0 ? '—' : minutesToHours(minutes)
}

// ─── Static sub-components ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MainTaskStatus }) {
  const s = STATUS_BADGE[status]
  return (
    <span style={{ backgroundColor: s.bg, color: s.color, padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, whiteSpace: 'nowrap' }}>
      {s.label}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_BADGE[priority]
  return (
    <span style={{ backgroundColor: p.bg, color: p.color, padding: '2px 8px', borderRadius: 9999, fontSize: 11, fontWeight: 500, textTransform: 'capitalize', whiteSpace: 'nowrap' }}>
      {priority}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
      <p style={{ color: C.muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{label}</p>
      <p style={{ color, fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</p>
    </div>
  )
}

// ─── Modal label helper ───────────────────────────────────────────────────────

function ModalLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', color: C.muted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
      {children} {required && <span style={{ color: '#f87171' }}>*</span>}
    </label>
  )
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks,      setTasks]      = useState<MainTask[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Inline edit state: which cell is active + its current draft value
  const [editCell,  setEditCell]  = useState<{ taskId: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

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

  // ── Inline editing ─────────────────────────────────────────────────────────
  function startEdit(taskId: string, field: string, value: string) {
    setEditCell({ taskId, field })
    setEditValue(value)
  }

  function cancelEdit() {
    setEditCell(null)
  }

  async function saveEdit(taskId: string, field: string, rawValue: string) {
    setEditCell(null)

    // Build patch body (date fields need special handling)
    const body: Record<string, unknown> = {}
    if (field === 'taken_at' || field === 'deadline') {
      body[field] = fromInputDate(rawValue)
    } else if (field === 'priority') {
      body[field] = rawValue as TaskPriority
    } else {
      // Text fields: empty string → null
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

  // ── Shared styles ──────────────────────────────────────────────────────────
  const cellInputStyle: React.CSSProperties = {
    backgroundColor: C.surface,
    border:          `1px solid ${C.accent}`,
    borderRadius:    4,
    color:           C.text,
    padding:         '3px 8px',
    fontSize:        13,
    outline:         'none',
    width:           '100%',
  }

  const modalInputStyle: React.CSSProperties = {
    backgroundColor: C.bg,
    border:          `1px solid ${C.border}`,
    borderRadius:    6,
    color:           C.text,
    padding:         '8px 12px',
    fontSize:        13,
    outline:         'none',
    width:           '100%',
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', padding: '24px' }}>

      {/* ── Top bar ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ color: C.text, fontSize: 20, fontWeight: 600, margin: 0 }}>Dashboard</h1>
        <button
          onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(null) }}
          style={{ backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
        >
          + New Task
        </button>
      </div>

      {/* ── Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, padding: 16, height: 80 }} />
            ))
          : <>
              <MetricCard label="Total Tasks"  value={total}      color={C.text}   />
              <MetricCard label="In Progress"  value={inProgress} color={C.accent} />
              <MetricCard label="Blocked"      value={blocked}    color="#f87171"  />
              <MetricCard label="Done"         value={done}       color="#4ade80"  />
            </>
        }
      </div>

      {/* ── Modal ── */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowModal(false)}
        >
          <form
            onSubmit={handleCreate}
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: C.surface,
              border:          `1px solid ${C.border}`,
              borderRadius:    12,
              padding:         28,
              width:           580,
              maxWidth:        '95vw',
              maxHeight:       '90vh',
              overflowY:       'auto',
              zIndex:          51,
            }}
          >
            {/* Modal header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: C.text, fontSize: 16, fontWeight: 600, margin: 0 }}>New Task</h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4 }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Task name */}
              <div>
                <ModalLabel required>Task</ModalLabel>
                <input
                  type="text"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Task name"
                  autoFocus
                  style={modalInputStyle}
                />
              </div>

              {/* Category + Priority */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <ModalLabel>Category</ModalLabel>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    style={{ ...modalInputStyle, cursor: 'pointer' }}
                  >
                    <option value="">— Select —</option>
                    {CATEGORIES.map(c => (
                      <option key={c} value={c} style={{ backgroundColor: C.surface }}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <ModalLabel>Priority</ModalLabel>
                  <select
                    value={form.priority}
                    onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                    style={{ ...modalInputStyle, cursor: 'pointer' }}
                  >
                    {PRIORITIES.map(p => (
                      <option key={p} value={p} style={{ backgroundColor: C.surface, textTransform: 'capitalize' }}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Taken At + Deadline */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <ModalLabel>Taken At</ModalLabel>
                  <input
                    type="datetime-local"
                    value={form.taken_at}
                    onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))}
                    style={{ ...modalInputStyle, colorScheme: 'dark' }}
                  />
                </div>
                <div>
                  <ModalLabel>Deadline</ModalLabel>
                  <input
                    type="datetime-local"
                    value={form.deadline}
                    onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                    style={{ ...modalInputStyle, colorScheme: 'dark' }}
                  />
                </div>
              </div>

              {/* Task Owner */}
              <div>
                <ModalLabel>Task Owner</ModalLabel>
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
                <ModalLabel>Note</ModalLabel>
                <textarea
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Optional notes…"
                  rows={3}
                  style={{ ...modalInputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                />
              </div>
            </div>

            {formError && (
              <p style={{ color: '#f87171', fontSize: 12, marginTop: 12 }}>{formError}</p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 6, color: C.muted, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{ backgroundColor: C.accent, color: '#fff', border: 'none', borderRadius: 6, padding: '8px 18px', fontSize: 13, fontWeight: 500, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.6 : 1 }}
              >
                {submitting ? 'Creating…' : 'Create Task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Table ── */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 1400, borderCollapse: 'collapse' }}>

            <thead>
              <tr style={{ backgroundColor: C.sidebar }}>
                {[
                  { label: 'ID',         w: 80        },
                  { label: 'Task',       w: undefined },
                  { label: 'Category',   w: 160       },
                  { label: 'Status',     w: 110       },
                  { label: 'Priority',   w: 90        },
                  { label: 'Taken At',   w: 132       },
                  { label: 'Deadline',   w: 132       },
                  { label: 'Task Owner', w: 140       },
                  { label: 'Progress',   w: 150       },
                  { label: 'Time Spent', w: 95        },
                  { label: 'Blocked By', w: 130       },
                  { label: 'Note',       w: 160       },
                  { label: '',           w: 48        },
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
                      width: col.w,
                    }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[80, 200, 130, 90, 80, 110, 110, 130, 140, 80, 120, 150, 30].map((w, j) => (
                      <td key={j} style={{ padding: '12px 16px', borderBottom: `1px solid ${C.border}` }}>
                        <div style={{ height: 14, width: w, borderRadius: 4, backgroundColor: C.surface }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={13} style={{ padding: '60px 24px', textAlign: 'center', color: C.muted, backgroundColor: C.bg }}>
                    <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>No tasks yet</p>
                    <p style={{ fontSize: 12 }}>Click &ldquo;+ New Task&rdquo; to create your first epic.</p>
                  </td>
                </tr>
              ) : (
                tasks.map(task => {
                  const isEditing = (field: string) =>
                    editCell?.taskId === task.id && editCell.field === field

                  // Shared key handlers for inputs
                  const onKeyDown = (field: string) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
                    if (e.key === 'Enter')  saveEdit(task.id, field, editValue)
                    if (e.key === 'Escape') cancelEdit()
                  }

                  return (
                    <tr
                      key={task.id}
                      style={{ backgroundColor: C.bg, borderBottom: `1px solid ${C.border}` }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surface)}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.bg)}
                    >

                      {/* ID — read-only */}
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <span style={{ color: C.accent, fontFamily: 'monospace', fontSize: 12 }}>{task.display_id}</span>
                      </td>

                      {/* Task — text edit */}
                      <td style={{ padding: '10px 16px', maxWidth: 260 }}>
                        {isEditing('name') ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'name', editValue)}
                            onKeyDown={onKeyDown('name')}
                            style={cellInputStyle}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'name', task.name)}
                            title="Click to edit"
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text, fontWeight: 500, fontSize: 13, cursor: 'text' }}
                          >
                            {task.name}
                          </span>
                        )}
                      </td>

                      {/* Category — select edit */}
                      <td style={{ padding: '10px 16px', maxWidth: 160 }}>
                        {isEditing('category') ? (
                          <select
                            autoFocus
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'category', e.target.value) }}
                            onBlur={() => cancelEdit()}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                            style={{ ...cellInputStyle, cursor: 'pointer' }}
                          >
                            <option value="">— None —</option>
                            {CATEGORIES.map(c => (
                              <option key={c} value={c} style={{ backgroundColor: C.surface }}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'category', task.category ?? '')}
                            title="Click to edit"
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.category ? C.text : C.muted, fontSize: 13, cursor: 'pointer' }}
                          >
                            {task.category ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Status — read-only */}
                      <td style={{ padding: '10px 16px' }}>
                        <StatusBadge status={task.status} />
                      </td>

                      {/* Priority — select edit */}
                      <td style={{ padding: '10px 16px' }}>
                        {isEditing('priority') ? (
                          <select
                            autoFocus
                            value={editValue}
                            onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'priority', e.target.value) }}
                            onBlur={() => cancelEdit()}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                            style={{ ...cellInputStyle, cursor: 'pointer', width: 'auto' }}
                          >
                            {PRIORITIES.map(p => (
                              <option key={p} value={p} style={{ backgroundColor: C.surface, textTransform: 'capitalize' }}>{p}</option>
                            ))}
                          </select>
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'priority', task.priority)}
                            title="Click to edit"
                            style={{ cursor: 'pointer', display: 'inline-block' }}
                          >
                            <PriorityBadge priority={task.priority} />
                          </span>
                        )}
                      </td>

                      {/* Taken At — datetime edit */}
                      <td style={{ padding: '10px 16px', fontSize: 12 }}>
                        {isEditing('taken_at') ? (
                          <input
                            type="datetime-local"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'taken_at', editValue)}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                            style={{ ...cellInputStyle, colorScheme: 'dark', fontSize: 12 }}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'taken_at', toInputDate(task.taken_at))}
                            title="Click to edit"
                            style={{ display: 'block', whiteSpace: 'nowrap', color: task.taken_at ? C.text : C.muted, cursor: 'text' }}
                          >
                            {formatDate(task.taken_at)}
                          </span>
                        )}
                      </td>

                      {/* Deadline — datetime edit */}
                      <td style={{ padding: '10px 16px', fontSize: 12 }}>
                        {isEditing('deadline') ? (
                          <input
                            type="datetime-local"
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'deadline', editValue)}
                            onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                            style={{ ...cellInputStyle, colorScheme: 'dark', fontSize: 12 }}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'deadline', toInputDate(task.deadline))}
                            title="Click to edit"
                            style={{ display: 'block', whiteSpace: 'nowrap', color: task.deadline ? C.text : C.muted, cursor: 'text' }}
                          >
                            {formatDate(task.deadline)}
                          </span>
                        )}
                      </td>

                      {/* Task Owner — text edit */}
                      <td style={{ padding: '10px 16px', maxWidth: 140 }}>
                        {isEditing('task_owner') ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'task_owner', editValue)}
                            onKeyDown={onKeyDown('task_owner')}
                            style={cellInputStyle}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'task_owner', task.task_owner ?? '')}
                            title="Click to edit"
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.task_owner ? C.text : C.muted, fontSize: 12, cursor: 'text' }}
                          >
                            {task.task_owner ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Progress — read-only */}
                      <td style={{ padding: '10px 16px', minWidth: 140 }}>
                        <ProgressBar value={task.progress} />
                      </td>

                      {/* Time Spent — read-only */}
                      <td style={{ padding: '10px 16px', fontSize: 12, color: task.time_spent ? C.text : C.muted, whiteSpace: 'nowrap' }}>
                        {formatTime(task.time_spent)}
                      </td>

                      {/* Blocked By — text edit */}
                      <td style={{ padding: '10px 16px', maxWidth: 130 }}>
                        {isEditing('blocked_by') ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'blocked_by', editValue)}
                            onKeyDown={onKeyDown('blocked_by')}
                            style={cellInputStyle}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'blocked_by', task.blocked_by ?? '')}
                            title="Click to edit"
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.blocked_by ? C.text : C.muted, fontSize: 12, cursor: 'text' }}
                          >
                            {task.blocked_by ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Note — text edit */}
                      <td style={{ padding: '10px 16px', maxWidth: 160 }}>
                        {isEditing('note') ? (
                          <input
                            autoFocus
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onBlur={() => saveEdit(task.id, 'note', editValue)}
                            onKeyDown={onKeyDown('note')}
                            style={cellInputStyle}
                          />
                        ) : (
                          <span
                            onClick={() => startEdit(task.id, 'note', task.note ?? '')}
                            title="Click to edit"
                            style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.note ? C.text : C.muted, fontSize: 12, cursor: 'text' }}
                          >
                            {task.note ?? '—'}
                          </span>
                        )}
                      </td>

                      {/* Delete */}
                      <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleDelete(task.id, task.name)}
                          disabled={deletingId === task.id}
                          title="Delete task"
                          style={{
                            background: 'none', border: 'none',
                            cursor:  deletingId === task.id ? 'not-allowed' : 'pointer',
                            padding: 4, borderRadius: 4,
                            color:   '#f87171',
                            opacity: deletingId === task.id ? 0.4 : 0.6,
                            lineHeight: 1, transition: 'opacity 0.15s',
                          }}
                          onMouseEnter={e => { if (deletingId !== task.id) (e.currentTarget as HTMLButtonElement).style.opacity = '1' }}
                          onMouseLeave={e => { if (deletingId !== task.id) (e.currentTarget as HTMLButtonElement).style.opacity = '0.6' }}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                            <path d="M10 11v6M14 11v6" />
                            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                          </svg>
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
  )
}
