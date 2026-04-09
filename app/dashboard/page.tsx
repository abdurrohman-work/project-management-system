'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Plus, X, Flag, Trash2, ChevronDown, ChevronUp, Search,
  LayoutDashboard, Pencil, SlidersHorizontal, ClipboardList,
} from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type { MainTask, MainTaskStatus, TaskPriority } from '@/types/database'
import { ToastContainer, useToast } from '@/app/components/Toast'
import { ConfirmDialog }           from '@/app/components/ConfirmDialog'

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Platform Management', 'Course Management', 'IT Operations',
  'Administrative / Office', 'Finance & Billing', 'Technical Support',
  'Data & Analytics', 'Telephony/CRM', 'Others',
]

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

const ALL_STATUSES: MainTaskStatus[] = ['backlog', 'in_progress', 'blocked', 'stopped', 'done']

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MainTaskStatus, { dot: string; badgeBg: string; badgeText: string; label: string }> = {
  backlog:     { dot: '#9ca3af', badgeBg: '#374151', badgeText: '#9ca3af', label: 'Backlog'     },
  in_progress: { dot: '#3f9cfb', badgeBg: '#1e3a5f', badgeText: '#3f9cfb', label: 'In Progress' },
  blocked:     { dot: '#f87171', badgeBg: '#450a0a', badgeText: '#f87171', label: 'Blocked'     },
  stopped:     { dot: '#fb923c', badgeBg: '#431407', badgeText: '#fb923c', label: 'Stopped'     },
  done:        { dot: '#4ade80', badgeBg: '#052e16', badgeText: '#4ade80', label: 'Done'        },
}

// ─── Priority config ──────────────────────────────────────────────────────────

const PRIORITY_CONFIG: Record<TaskPriority, { flagColor: string; badgeBg: string; badgeText: string; label: string }> = {
  low:      { flagColor: '#9ca3af', badgeBg: '#374151', badgeText: '#9ca3af', label: 'Low'      },
  medium:   { flagColor: '#60a5fa', badgeBg: '#1e3a5f', badgeText: '#60a5fa', label: 'Medium'   },
  high:     { flagColor: '#fb923c', badgeBg: '#431407', badgeText: '#fb923c', label: 'High'     },
  critical: { flagColor: '#f87171', badgeBg: '#450a0a', badgeText: '#f87171', label: 'Critical' },
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

function StatusBadge({
  status,
  interactive = false,
}: {
  status:       MainTaskStatus
  interactive?: boolean
}) {
  const s = STATUS_CONFIG[status]
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap select-none"
      style={{ backgroundColor: s.badgeBg, color: s.badgeText, cursor: interactive ? 'pointer' : 'default' }}
    >
      <span
        className="shrink-0 rounded-full"
        style={{ width: 6, height: 6, backgroundColor: s.dot }}
      />
      {s.label}
      {interactive && <ChevronDown size={10} className="ml-[1px]" />}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_CONFIG[priority]
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap select-none"
      style={{ backgroundColor: p.badgeBg, color: p.badgeText }}
    >
      <Flag size={10} fill={p.flagColor} style={{ color: p.flagColor, flexShrink: 0 }} />
      {p.label}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-[#2a3f52] overflow-hidden">
        <div
          className="h-1.5 rounded-full bg-[#4ade80] transition-[width] duration-300 ease-in-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-white/60 text-[11px] min-w-[30px] text-right tabular-nums">
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function OwnerAvatar({ value }: { value: string | null }) {
  if (!value) return <span className="text-white/40 text-xs">—</span>
  const parts    = value.split('@')[0].replace(/[._-]/g, ' ').split(' ')
  const initials = parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  const hue      = [...value].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="shrink-0 rounded-full inline-flex items-center justify-center text-[10px] font-semibold text-white"
        style={{ width: 26, height: 26, backgroundColor: `hsl(${hue},45%,35%)` }}
      >
        {initials}
      </span>
      <span
        className="text-[12px] text-white/60 overflow-hidden text-ellipsis whitespace-nowrap"
        style={{ maxWidth: 80 }}
        title={value}
      >
        {value.split('@')[0]}
      </span>
    </span>
  )
}

function MetricCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="bg-[#1e2d3d] border border-[#2a3f52] rounded-md p-4">
      <p className="m-0 mb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-white/40">{label}</p>
      <p className="m-0 text-[28px] font-bold leading-none tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="m-0 mt-1.5 text-[11px] text-white/40">{sub}</p>}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[12px] font-medium text-white/60 mb-1.5">
      {children}{required && <span className="text-[#f87171] ml-0.5">*</span>}
    </label>
  )
}

// ─── Empty form ───────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '', category: '', priority: 'medium' as TaskPriority,
  taken_at: '', deadline: '', task_owner: '', note: '',
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'display_id', label: 'ID',         width: 72,        editable: false },
  { key: 'name',       label: 'Task',       width: undefined, editable: true  },
  { key: 'category',   label: 'Category',   width: 150,       editable: true  },
  { key: 'status',     label: 'Status',     width: 128,       editable: true  },
  { key: 'priority',   label: 'Priority',   width: 100,       editable: true  },
  { key: 'taken_at',   label: 'Taken At',   width: 116,       editable: true  },
  { key: 'deadline',   label: 'Deadline',   width: 116,       editable: true  },
  { key: 'task_owner', label: 'Owner',      width: 120,       editable: true  },
  { key: 'progress',   label: 'Progress',   width: 148,       editable: false },
  { key: 'time_spent', label: 'Time Spent', width: 88,        editable: false },
  { key: 'blocked_by', label: 'Blocked By', width: 110,       editable: true  },
  { key: 'note',       label: 'Note',       width: 150,       editable: true  },
  { key: '_delete',    label: '',           width: 44,        editable: false },
]

// ─── Shared input class helpers ───────────────────────────────────────────────

const modalInputClass =
  'w-full bg-[#111b24] border border-[#2a3f52] text-white rounded-md px-3 py-2 text-sm outline-none placeholder:text-white/30 focus:border-[#3f9cfb] font-[inherit] box-border'

const cellInputClass =
  'w-full bg-[#111b24] border-[1.5px] border-[#3f9cfb] text-white rounded-md px-2 py-1 text-[13px] outline-none font-[inherit]'

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks,      setTasks]      = useState<MainTask[]>([])
  const [loading,    setLoading]    = useState(true)
  const [showModal,  setShowModal]  = useState(false)
  const [form,       setForm]       = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [formError,  setFormError]  = useState<string | null>(null)
  const [newTaskId,  setNewTaskId]  = useState<string | null>(null)

  // ── Inline edit ──────────────────────────────────────────────────────────
  const [editCell,  setEditCell]  = useState<{ taskId: string; field: string } | null>(null)
  const [editValue, setEditValue] = useState('')

  // ── Delete confirm ───────────────────────────────────────────────────────
  const [confirmOpen,    setConfirmOpen]    = useState(false)
  const [pendingDelete,  setPendingDelete]  = useState<{ id: string; name: string } | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filterText,     setFilterText]     = useState('')
  const [filterStatus,   setFilterStatus]   = useState<MainTaskStatus | ''>('')
  const [filterPriority, setFilterPriority] = useState<TaskPriority | ''>('')

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  // ── Column visibility ─────────────────────────────────────────────────────
  const [visibleCols, setVisibleCols] = useState<Set<string>>(
    () => new Set(COLUMNS.map(c => c.key)),
  )
  const [showColMenu, setShowColMenu] = useState(false)
  const colMenuRef = useRef<HTMLDivElement>(null)

  // ── Toast ────────────────────────────────────────────────────────────────
  const { toasts, toast, dismiss } = useToast()

  // ── Fetch ────────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/main-tasks')
      .then(r => r.json())
      .then(j => { if (j.success) setTasks(j.data) })
      .finally(() => setLoading(false))
  }, [])

  // ── Close col menu on outside click ──────────────────────────────────────
  useEffect(() => {
    if (!showColMenu) return
    function handler(e: MouseEvent) {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setShowColMenu(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showColMenu])

  // ── Derived: filtered tasks ───────────────────────────────────────────────
  const filteredTasks = tasks.filter(t => {
    if (filterText   && !t.name.toLowerCase().includes(filterText.toLowerCase())) return false
    if (filterStatus   && t.status   !== filterStatus)   return false
    if (filterPriority && t.priority !== filterPriority) return false
    return true
  })

  const sortedTasks = sortKey
    ? [...filteredTasks].sort((a, b) => {
        const av = (a as Record<string, unknown>)[sortKey] ?? ''
        const bv = (b as Record<string, unknown>)[sortKey] ?? ''
        const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true })
        return sortDir === 'asc' ? cmp : -cmp
      })
    : filteredTasks

  const hasFilters = !!(filterText || filterStatus || filterPriority)

  // ── Metrics ───────────────────────────────────────────────────────────────
  const total      = tasks.length
  const inProgress = tasks.filter(t => t.status === 'in_progress').length
  const blocked    = tasks.filter(t => t.status === 'blocked').length
  const done       = tasks.filter(t => t.status === 'done').length

  // ── Delete ────────────────────────────────────────────────────────────────
  function askDelete(id: string, name: string) {
    setPendingDelete({ id, name })
    setConfirmOpen(true)
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setConfirmOpen(false)
    const { id, name } = pendingDelete
    setPendingDelete(null)
    setDeletingId(id)
    const res  = await fetch(`/api/main-tasks/${id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeletingId(null)
    if (json.success) {
      setTasks(prev => prev.filter(t => t.id !== id))
      toast(`"${name}" deleted`)
    } else {
      toast('Failed to delete task', 'error')
    }
  }

  // ── Create ────────────────────────────────────────────────────────────────
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
    setNewTaskId(json.data.id)
    setTimeout(() => setNewTaskId(null), 1400)
    setForm(EMPTY_FORM)
    setShowModal(false)
    toast(`"${json.data.name}" created`)
  }

  // ── Inline edit ───────────────────────────────────────────────────────────
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
    } else if (field === 'status') {
      body[field] = rawValue as MainTaskStatus
    } else {
      body[field] = rawValue.trim() || null
    }

    const res  = await fetch(`/api/main-tasks/${taskId}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    const json = await res.json()
    if (json.success) {
      setTasks(prev => prev.map(t => t.id === taskId ? { ...t, ...json.data } : t))
      toast('Saved')
    } else {
      toast('Failed to save changes', 'error')
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="bg-[#18232d] min-h-screen">

      {/* Toast */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />

      {/* Delete confirm */}
      <ConfirmDialog
        open={confirmOpen}
        title="Delete Task"
        message={`Delete "${pendingDelete?.name}"? All subtasks and workload entries will also be removed. This cannot be undone.`}
        confirmLabel="Delete Task"
        onConfirm={confirmDelete}
        onCancel={() => { setConfirmOpen(false); setPendingDelete(null) }}
      />

      {/* ── Sticky page header ── */}
      <div className="h-14 border-b border-[#2a3f52] flex items-center justify-between px-7 bg-[#18232d] sticky top-0 z-30">
        <div className="flex items-center gap-2.5">
          <LayoutDashboard size={16} className="text-[#3f9cfb]" />
          <h1 className="m-0 text-sm font-semibold text-white">Dashboard</h1>
          <span className="bg-[#1e3a5f] text-[#3f9cfb] text-[11px] font-medium px-2 py-0.5 rounded-full">
            {loading ? '…' : total}
          </span>
        </div>

        <button
          onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(null) }}
          className="inline-flex items-center gap-1.5 bg-[#3f9cfb] hover:bg-[#2d8ae8] text-white text-sm px-3 py-1.5 rounded-md font-medium cursor-pointer border-none transition-colors duration-150"
        >
          <Plus size={14} />
          New Task
        </button>
      </div>

      <div className="px-7 py-6">

        {/* ── Metric cards ── */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton h-[88px] rounded-md" />
              ))
            : <>
                <MetricCard label="Total Tasks"  value={total}      color="#ffffff"   sub="all epics"         />
                <MetricCard label="In Progress"  value={inProgress} color="#3f9cfb"   sub="currently active"  />
                <MetricCard label="Blocked"      value={blocked}    color="#f87171"   sub="need attention"    />
                <MetricCard label="Done"         value={done}       color="#4ade80"   sub="completed"         />
              </>
          }
        </div>

        {/* ── Filter bar ── */}
        <div className="flex items-center gap-2 mb-3.5 flex-wrap">

          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-[280px]">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
            />
            <input
              type="text"
              placeholder="Search tasks…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              className="w-full box-border bg-[#111b24] border border-[#2a3f52] rounded-md text-white text-sm pl-8 pr-8 py-1.5 outline-none placeholder:text-white/30 focus:border-[#3f9cfb] font-[inherit]"
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-white/40 p-0 flex items-center hover:text-white/70"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div className="relative">
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as MainTaskStatus | '')}
              className="bg-[#111b24] border border-[#2a3f52] rounded-md text-white text-sm pl-2.5 pr-7 py-1.5 cursor-pointer outline-none font-[inherit] focus:border-[#3f9cfb]"
              style={{
                backgroundColor: filterStatus ? '#1e3a5f' : '#111b24',
                borderColor:     filterStatus ? '#3f9cfb' : '#2a3f52',
                color:           filterStatus ? '#3f9cfb' : 'rgba(255,255,255,0.6)',
              }}
            >
              <option value="">All Statuses</option>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s} style={{ backgroundColor: '#1e2d3d', color: '#ffffff' }}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: filterStatus ? '#3f9cfb' : 'rgba(255,255,255,0.4)' }}
            />
          </div>

          {/* Priority filter */}
          <div className="relative">
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value as TaskPriority | '')}
              className="bg-[#111b24] border border-[#2a3f52] rounded-md text-white text-sm pl-2.5 pr-7 py-1.5 cursor-pointer outline-none font-[inherit] focus:border-[#3f9cfb]"
              style={{
                backgroundColor: filterPriority ? '#1e3a5f' : '#111b24',
                borderColor:     filterPriority ? '#3f9cfb' : '#2a3f52',
                color:           filterPriority ? '#3f9cfb' : 'rgba(255,255,255,0.6)',
              }}
            >
              <option value="">All Priorities</option>
              {PRIORITIES.map(p => (
                <option key={p} value={p} style={{ backgroundColor: '#1e2d3d', color: '#ffffff' }}>
                  {PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={12}
              className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: filterPriority ? '#3f9cfb' : 'rgba(255,255,255,0.4)' }}
            />
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setFilterText(''); setFilterStatus(''); setFilterPriority('') }}
              className="inline-flex items-center gap-1 bg-transparent border border-[#2a3f52] hover:border-[#3a5168] rounded-md text-white/60 hover:text-white text-[12px] px-3 py-1.5 cursor-pointer font-[inherit] transition-colors duration-150"
            >
              <X size={11} />
              Clear filters
            </button>
          )}

          {/* Show / hide columns */}
          <div ref={colMenuRef} className="relative">
            <button
              onClick={() => setShowColMenu(v => !v)}
              className="inline-flex items-center gap-1.5 border rounded-md text-[12px] font-medium px-3 py-1.5 cursor-pointer font-[inherit] transition-colors duration-150"
              style={{
                backgroundColor: showColMenu ? '#1e3a5f' : '#111b24',
                borderColor:     showColMenu ? '#3f9cfb' : '#2a3f52',
                color:           showColMenu ? '#3f9cfb' : 'rgba(255,255,255,0.6)',
              }}
            >
              <SlidersHorizontal size={12} />
              Columns
            </button>
            {showColMenu && (
              <div className="absolute top-[calc(100%+6px)] right-0 z-40 bg-[#1e2d3d] border border-[#2a3f52] rounded-lg py-1.5 min-w-[160px] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                {COLUMNS.filter(c => c.key !== '_delete' && c.label).map(col => (
                  <label
                    key={col.key}
                    className="flex items-center gap-2 px-3.5 py-1.5 cursor-pointer text-[13px] text-white hover:bg-[#243445] transition-colors duration-100"
                  >
                    <input
                      type="checkbox"
                      checked={visibleCols.has(col.key)}
                      onChange={() => setVisibleCols(prev => {
                        const next = new Set(prev)
                        if (next.has(col.key)) next.delete(col.key)
                        else next.add(col.key)
                        return next
                      })}
                      className="cursor-pointer accent-[#3f9cfb]"
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Result count */}
          {!loading && (
            <span className="text-[12px] text-white/40 ml-auto">
              {hasFilters
                ? `${filteredTasks.length} of ${total} tasks`
                : `${total} task${total !== 1 ? 's' : ''}`
              }
            </span>
          )}
        </div>

        {/* ── Create modal ── */}
        {showModal && (
          <div
            className="fixed inset-0 bg-black/65 backdrop-blur-[4px] z-50 flex items-center justify-center"
            onClick={() => setShowModal(false)}
          >
            <form
              onSubmit={handleCreate}
              onClick={e => e.stopPropagation()}
              className="modal-enter bg-[#1e2d3d] border border-[#2a3f52] rounded-xl w-[540px] max-w-[95vw] max-h-[90vh] overflow-y-auto z-[51] shadow-[0_24px_48px_rgba(0,0,0,0.45)]"
            >
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-[18px] border-b border-[#2a3f52]">
                <h2 className="m-0 text-[15px] font-semibold text-white">Create New Task</h2>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-transparent border-none text-white/40 hover:text-white cursor-pointer p-1 rounded-md flex items-center transition-colors duration-150"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Modal body */}
              <div className="px-6 py-5 flex flex-col gap-4">

                <div>
                  <FieldLabel required>Task Name</FieldLabel>
                  <input
                    type="text"
                    value={form.name}
                    autoFocus
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter task name…"
                    className={modalInputClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <div className="relative">
                      <select
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                        className={`${modalInputClass} pr-8 cursor-pointer`}
                      >
                        <option value="">— Select —</option>
                        {CATEGORIES.map(c => (
                          <option key={c} value={c} style={{ backgroundColor: '#1e2d3d' }}>{c}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Priority</FieldLabel>
                    <div className="relative">
                      <select
                        value={form.priority}
                        onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))}
                        className={`${modalInputClass} pr-8 cursor-pointer`}
                      >
                        {PRIORITIES.map(p => (
                          <option key={p} value={p} style={{ backgroundColor: '#1e2d3d' }}>{PRIORITY_CONFIG[p].label}</option>
                        ))}
                      </select>
                      <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Taken At</FieldLabel>
                    <input
                      type="datetime-local"
                      value={form.taken_at}
                      onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))}
                      className={modalInputClass}
                    />
                  </div>
                  <div>
                    <FieldLabel>Deadline</FieldLabel>
                    <input
                      type="datetime-local"
                      value={form.deadline}
                      onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))}
                      className={modalInputClass}
                    />
                  </div>
                </div>

                <div>
                  <FieldLabel>Task Owner</FieldLabel>
                  <input
                    type="text"
                    value={form.task_owner}
                    onChange={e => setForm(f => ({ ...f, task_owner: e.target.value }))}
                    placeholder="e.g. john@example.com"
                    className={modalInputClass}
                  />
                </div>

                <div>
                  <FieldLabel>Note</FieldLabel>
                  <textarea
                    value={form.note}
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                    placeholder="Optional notes…"
                    rows={3}
                    className={`${modalInputClass} resize-y min-h-[72px]`}
                  />
                </div>

                {formError && (
                  <p className="m-0 text-[12px] text-[#f87171]">{formError}</p>
                )}
              </div>

              {/* Modal footer */}
              <div className="flex justify-end gap-2 px-6 py-3.5 border-t border-[#2a3f52]">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="bg-transparent border border-[#2a3f52] hover:bg-[#1e2d3d] text-white text-sm px-4 py-1.5 rounded-md font-medium cursor-pointer font-[inherit] transition-colors duration-150"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-[#3f9cfb] hover:bg-[#2d8ae8] text-white text-sm px-5 py-1.5 rounded-md font-medium border-none font-[inherit] transition-colors duration-150"
                  style={{ cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1 }}
                >
                  {submitting ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Table ── */}
        <div className="border border-[#2a3f52] rounded-lg overflow-hidden bg-[#1e2d3d]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1380 }}>

              <colgroup>
                {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => (
                  <col key={col.key} style={{ width: col.width ?? undefined }} />
                ))}
              </colgroup>

              {/* Sticky header */}
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#111b24]">
                  {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => {
                    const isSorted = sortKey === col.key
                    const canSort  = col.key !== '_delete'
                    return (
                      <th
                        key={col.key}
                        onClick={canSort ? () => {
                          if (sortKey === col.key) {
                            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
                          } else {
                            setSortKey(col.key)
                            setSortDir('asc')
                          }
                        } : undefined}
                        className="px-3 h-9 text-left text-xs uppercase tracking-wider border-b border-[#2a3f52] bg-[#111b24] whitespace-nowrap select-none"
                        style={{
                          color:  isSorted ? '#3f9cfb' : col.editable ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.35)',
                          cursor: canSort ? 'pointer' : 'default',
                          fontWeight: 600,
                        }}
                      >
                        <span className="inline-flex items-center gap-1">
                          {col.label}
                          {isSorted
                            ? (sortDir === 'asc'
                                ? <ChevronUp size={10} className="text-[#3f9cfb]" />
                                : <ChevronDown size={10} className="text-[#3f9cfb]" />)
                            : col.editable && col.label
                              ? <Pencil size={9} className="text-white/30" />
                              : null
                          }
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {/* Loading skeleton */}
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#2a3f52]">
                      {COLUMNS.filter(c => visibleCols.has(c.key)).map((col, j) => (
                        <td key={j} className="py-2.5 px-3">
                          <div
                            className="skeleton rounded"
                            style={{ height: 12, width: j === 1 ? 180 : j === 0 ? 40 : 80 }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))

                /* Empty state */
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.filter(c => visibleCols.has(c.key)).length}
                      className="py-16 px-6 text-center"
                    >
                      {hasFilters ? (
                        <div className="flex flex-col items-center gap-3">
                          <SlidersHorizontal size={28} className="text-white/40" />
                          <p className="m-0 text-sm font-medium text-white/60">
                            No tasks match your filters
                          </p>
                          <p className="m-0 text-xs text-white/40">
                            Try adjusting or clearing the filters.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-3">
                          <ClipboardList size={32} className="text-white/30" />
                          <p className="m-0 text-sm font-medium text-white/60">
                            No tasks yet. Create your first task.
                          </p>
                          <button
                            onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(null) }}
                            className="inline-flex items-center gap-1.5 bg-[#3f9cfb] hover:bg-[#2d8ae8] text-white text-sm px-3 py-1.5 rounded-md font-medium cursor-pointer border-none transition-colors duration-150 mt-1"
                          >
                            <Plus size={14} />
                            New Task
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>

                /* Data rows */
                ) : (
                  sortedTasks.map(task => {
                    const isEditing = (field: string) =>
                      editCell?.taskId === task.id && editCell.field === field

                    const onKeyDown = (field: string) =>
                      (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
                        if (e.key === 'Enter')  saveEdit(task.id, field, editValue)
                        if (e.key === 'Escape') cancelEdit()
                      }

                    const isNew = newTaskId === task.id

                    return (
                      <tr
                        key={task.id}
                        className={`bg-[#18232d] hover:bg-[#1e2d3d] border-b border-[#2a3f52] transition-colors duration-150${isNew ? ' row-flash' : ''}`}
                        style={{ opacity: deletingId === task.id ? 0.4 : 1 }}
                      >

                        {/* ID */}
                        {visibleCols.has('display_id') && (
                          <td className="py-2.5 px-3">
                            <span className="font-mono text-[11px] text-[#3f9cfb] bg-[#1e3a5f]/50 px-1.5 py-0.5 rounded whitespace-nowrap">
                              {task.display_id}
                            </span>
                          </td>
                        )}

                        {/* Task name — editable */}
                        {visibleCols.has('name') && (
                          <td className="py-2.5 px-3 max-w-[260px]">
                            {isEditing('name') ? (
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'name', editValue)}
                                onKeyDown={onKeyDown('name')}
                                className={cellInputClass}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'name', task.name)}
                                title={task.name}
                                className="editable-cell flex items-center gap-1 overflow-hidden text-ellipsis whitespace-nowrap text-white font-medium text-[13px]"
                              >
                                <span className="overflow-hidden text-ellipsis flex-1">{task.name}</span>
                                <Pencil size={11} className="edit-hint text-white/40 shrink-0" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Category — editable */}
                        {visibleCols.has('category') && (
                          <td className="py-2.5 px-3 max-w-[150px]">
                            {isEditing('category') ? (
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'category', e.target.value) }}
                                onBlur={() => cancelEdit()}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                className={`${cellInputClass} cursor-pointer`}
                              >
                                <option value="">— None —</option>
                                {CATEGORIES.map(c => (
                                  <option key={c} value={c} style={{ backgroundColor: '#1e2d3d' }}>{c}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'category', task.category ?? '')}
                                className="editable-cell flex items-center gap-1 overflow-hidden"
                              >
                                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] flex-1"
                                  style={{ color: task.category ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                                  {task.category ?? '—'}
                                </span>
                                <Pencil size={10} className="edit-hint text-white/40 shrink-0" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Status — editable */}
                        {visibleCols.has('status') && (
                          <td className="py-2.5 px-3">
                            {isEditing('status') ? (
                              <div className="relative inline-block">
                                <select
                                  autoFocus
                                  value={editValue}
                                  onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'status', e.target.value) }}
                                  onBlur={() => cancelEdit()}
                                  onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                  className="border-[1.5px] border-[#3f9cfb] rounded-full text-[11px] font-medium pl-2.5 pr-6 py-0.5 cursor-pointer outline-none font-[inherit]"
                                  style={{
                                    backgroundColor: STATUS_CONFIG[editValue as MainTaskStatus]?.badgeBg ?? '#1e2d3d',
                                    color:           STATUS_CONFIG[editValue as MainTaskStatus]?.badgeText ?? '#ffffff',
                                  }}
                                >
                                  {ALL_STATUSES.map(s => (
                                    <option key={s} value={s} style={{ backgroundColor: '#1e2d3d', color: '#ffffff' }}>
                                      {STATUS_CONFIG[s].label}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  size={10}
                                  className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                                  style={{ color: STATUS_CONFIG[editValue as MainTaskStatus]?.badgeText ?? 'rgba(255,255,255,0.4)' }}
                                />
                              </div>
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'status', task.status)}
                                title="Click to change status"
                                className="cursor-pointer"
                              >
                                <StatusBadge status={task.status} interactive />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Priority — editable */}
                        {visibleCols.has('priority') && (
                          <td className="py-2.5 px-3">
                            {isEditing('priority') ? (
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'priority', e.target.value) }}
                                onBlur={() => cancelEdit()}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                className={`${cellInputClass} cursor-pointer w-auto`}
                              >
                                {PRIORITIES.map(p => (
                                  <option key={p} value={p} style={{ backgroundColor: '#1e2d3d' }}>{PRIORITY_CONFIG[p].label}</option>
                                ))}
                              </select>
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'priority', task.priority)}
                                title="Click to edit"
                                className="cursor-pointer"
                              >
                                <PriorityBadge priority={task.priority} />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Taken At — editable */}
                        {visibleCols.has('taken_at') && (
                          <td className="py-2.5 px-3">
                            {isEditing('taken_at') ? (
                              <input
                                type="datetime-local"
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'taken_at', editValue)}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                className={`${cellInputClass} text-[12px]`}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'taken_at', toInputDate(task.taken_at))}
                                className="editable-cell flex items-center gap-1"
                              >
                                <span className="whitespace-nowrap text-[12px]"
                                  style={{ color: task.taken_at ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                                  {formatDate(task.taken_at)}
                                </span>
                                <Pencil size={10} className="edit-hint text-white/40" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Deadline — editable */}
                        {visibleCols.has('deadline') && (
                          <td className="py-2.5 px-3">
                            {isEditing('deadline') ? (
                              <input
                                type="datetime-local"
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'deadline', editValue)}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                className={`${cellInputClass} text-[12px]`}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'deadline', toInputDate(task.deadline))}
                                className="editable-cell flex items-center gap-1"
                              >
                                <span className="whitespace-nowrap text-[12px]"
                                  style={{ color: task.deadline ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                                  {formatDate(task.deadline)}
                                </span>
                                <Pencil size={10} className="edit-hint text-white/40" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Owner — editable */}
                        {visibleCols.has('task_owner') && (
                          <td className="py-2.5 px-3 max-w-[120px]">
                            {isEditing('task_owner') ? (
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'task_owner', editValue)}
                                onKeyDown={onKeyDown('task_owner')}
                                className={cellInputClass}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'task_owner', task.task_owner ?? '')}
                                className="cursor-pointer"
                              >
                                <OwnerAvatar value={task.task_owner} />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Progress — read-only */}
                        {visibleCols.has('progress') && (
                          <td className="py-2.5 px-3 min-w-[140px]">
                            <ProgressBar value={task.progress} />
                          </td>
                        )}

                        {/* Time Spent — read-only */}
                        {visibleCols.has('time_spent') && (
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span
                              className="text-[12px] tabular-nums"
                              style={{ color: task.time_spent ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}
                            >
                              {formatTime(task.time_spent)}
                            </span>
                          </td>
                        )}

                        {/* Blocked By — editable */}
                        {visibleCols.has('blocked_by') && (
                          <td className="py-2.5 px-3 max-w-[110px]">
                            {isEditing('blocked_by') ? (
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'blocked_by', editValue)}
                                onKeyDown={onKeyDown('blocked_by')}
                                className={cellInputClass}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'blocked_by', task.blocked_by ?? '')}
                                className="editable-cell flex items-center gap-1 overflow-hidden"
                              >
                                <span
                                  className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] flex-1"
                                  style={{ color: task.blocked_by ? '#f87171' : 'rgba(255,255,255,0.3)' }}
                                >
                                  {task.blocked_by ?? '—'}
                                </span>
                                <Pencil size={10} className="edit-hint text-white/40 shrink-0" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Note — editable */}
                        {visibleCols.has('note') && (
                          <td className="py-2.5 px-3 max-w-[150px]">
                            {isEditing('note') ? (
                              <input
                                autoFocus
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                onBlur={() => saveEdit(task.id, 'note', editValue)}
                                onKeyDown={onKeyDown('note')}
                                className={cellInputClass}
                              />
                            ) : (
                              <span
                                onClick={() => startEdit(task.id, 'note', task.note ?? '')}
                                className="editable-cell flex items-center gap-1 overflow-hidden"
                              >
                                <span className="overflow-hidden text-ellipsis whitespace-nowrap text-[12px] flex-1"
                                  style={{ color: task.note ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)' }}>
                                  {task.note ?? '—'}
                                </span>
                                <Pencil size={10} className="edit-hint text-white/40 shrink-0" />
                              </span>
                            )}
                          </td>
                        )}

                        {/* Delete */}
                        {visibleCols.has('_delete') && (
                          <td className="py-2.5 px-2 text-center">
                            <button
                              onClick={() => askDelete(task.id, task.name)}
                              disabled={deletingId === task.id}
                              title="Delete task"
                              className="bg-transparent border-none text-white/40 hover:text-[#f87171] hover:bg-[#450a0a]/40 p-1 rounded flex items-center justify-center transition-colors duration-150"
                              style={{ cursor: deletingId === task.id ? 'not-allowed' : 'pointer' }}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        )}

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
