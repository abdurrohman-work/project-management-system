'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Plus, X, Flag, Trash2, ChevronDown, ChevronUp, Search,
  LayoutDashboard, Pencil, SlidersHorizontal,
  Sparkles, Mic, MicOff, CheckCircle2, XCircle, Loader2, ChevronRight,
} from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type { MainTask, MainTaskStatus, TaskPriority } from '@/types/database'
import { ToastContainer, useToast } from '@/app/components/Toast'
import { ConfirmDialog }           from '@/app/components/ConfirmDialog'

// ─── AI Sidebar types ─────────────────────────────────────────────────────────

type ParsedTask = {
  name:       string
  category:   string | null
  priority:   TaskPriority
  task_owner: string | null
  deadline:   string | null
  note:       string | null
}

type VoiceLang = 'en-US' | 'ru-RU' | 'uz-UZ'

const VOICE_LANGS: { code: VoiceLang; label: string; flag: string }[] = [
  { code: 'en-US', label: 'EN', flag: '🇺🇸' },
  { code: 'ru-RU', label: 'RU', flag: '🇷🇺' },
  { code: 'uz-UZ', label: 'UZ', flag: '🇺🇿' },
]

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

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Platform Management', 'Course Management', 'IT Operations',
  'Administrative / Office', 'Finance & Billing', 'Technical Support',
  'Data & Analytics', 'Telephony/CRM', 'Others',
]

const PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']

const ALL_STATUSES: MainTaskStatus[] = ['backlog', 'in_progress', 'blocked', 'stopped', 'done']

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<MainTaskStatus, {
  dot: string; text: string; bg: string; label: string
}> = {
  backlog:     { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Backlog'     },
  in_progress: { dot: '#60A5FA', text: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  label: 'In Progress' },
  blocked:     { dot: '#F87171', text: '#F87171', bg: 'rgba(239,68,68,0.12)',   label: 'Blocked'     },
  stopped:     { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Stopped'     },
  done:        { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Done'        },
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
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        gap:             5,
        backgroundColor: s.bg,
        color:           s.text,
        padding:         '3px 8px',
        borderRadius:    9999,
        fontSize:        11,
        fontWeight:      500,
        whiteSpace:      'nowrap',
        cursor:          interactive ? 'pointer' : 'default',
        userSelect:      'none',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: s.dot, flexShrink: 0 }} />
      {s.label}
      {interactive && <ChevronDown size={10} style={{ marginLeft: 1 }} />}
    </span>
  )
}

function PriorityFlag({ priority }: { priority: TaskPriority }) {
  const p = PRIORITY_CONFIG[priority]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: p.color }}>
      <Flag size={13} fill={p.color} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</span>
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, backgroundColor: '#2a3f52', borderRadius: 9999, overflow: 'hidden' }}>
        <div style={{ height: 6, width: `${pct}%`, backgroundColor: '#4ADE80', borderRadius: 9999, transition: 'width 0.4s ease' }} />
      </div>
      <span style={{ color: C.secondary, fontSize: 11, minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function OwnerAvatar({ value }: { value: string | null }) {
  if (!value) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>
  const parts    = value.split('@')[0].replace(/[._-]/g, ' ').split(' ')
  const initials = parts.slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
  const hue      = [...value].reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % 360
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        backgroundColor: `hsl(${hue},45%,35%)`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, color: '#fff',
      }}>
        {initials}
      </span>
      <span
        style={{ fontSize: 12, color: C.secondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}
        title={value}
      >
        {value.split('@')[0]}
      </span>
    </span>
  )
}

function MetricCard({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div style={{ backgroundColor: C.surface, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 20px' }}>
      <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</p>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</p>
      {sub && <p style={{ margin: '6px 0 0', fontSize: 11, color: C.muted }}>{sub}</p>}
    </div>
  )
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: C.secondary, marginBottom: 6 }}>
      {children}{required && <span style={{ color: C.danger, marginLeft: 2 }}>*</span>}
    </label>
  )
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const modalInput: React.CSSProperties = {
  width: '100%', backgroundColor: C.elevated, border: `1px solid ${C.borderHover}`,
  borderRadius: 8, color: C.text, padding: '9px 12px',
  fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
  transition: 'border-color 0.15s',
}

const cellInput: React.CSSProperties = {
  backgroundColor: C.bg, border: `1.5px solid ${C.primary}`, borderRadius: 6,
  color: C.text, padding: '4px 8px', fontSize: 13, outline: 'none',
  width: '100%', fontFamily: 'inherit',
  boxShadow: '0 0 0 3px rgba(123,104,238,0.15)',
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

  // ── AI Sidebar ────────────────────────────────────────────────────────────
  const [aiOpen,      setAiOpen]      = useState(false)
  const [aiInput,     setAiInput]     = useState('')
  const [aiParsing,   setAiParsing]   = useState(false)
  const [aiPreview,   setAiPreview]   = useState<ParsedTask | null>(null)
  const [aiApproving, setAiApproving] = useState(false)
  const [aiError,     setAiError]     = useState<string | null>(null)
  const [voiceLang,   setVoiceLang]   = useState<VoiceLang>('en-US')
  const [listening,   setListening]   = useState(false)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)

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

  // ── AI: parse text → structured preview ──────────────────────────────────
  async function aiParse() {
    if (!aiInput.trim()) return
    setAiParsing(true)
    setAiError(null)
    setAiPreview(null)
    try {
      const res  = await fetch('/api/ai/parse-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: aiInput }),
      })
      const json = await res.json()
      if (json.success) setAiPreview(json.data)
      else setAiError(json.error ?? 'Failed to parse task.')
    } catch {
      setAiError('Network error. Please try again.')
    }
    setAiParsing(false)
  }

  // ── AI: approve preview → create task ────────────────────────────────────
  async function aiApprove() {
    if (!aiPreview) return
    setAiApproving(true)
    const res  = await fetch('/api/main-tasks', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:       aiPreview.name,
        category:   aiPreview.category,
        priority:   aiPreview.priority,
        task_owner: aiPreview.task_owner,
        deadline:   aiPreview.deadline,
        note:       aiPreview.note,
      }),
    })
    const json = await res.json()
    setAiApproving(false)
    if (json.success) {
      setTasks(prev => [json.data, ...prev])
      setNewTaskId(json.data.id)
      setTimeout(() => setNewTaskId(null), 1400)
      toast(`"${json.data.name}" created via AI`)
      setAiPreview(null)
      setAiInput('')
    } else {
      setAiError(json.error ?? 'Failed to create task.')
    }
  }

  // ── AI: voice input ───────────────────────────────────────────────────────
  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { toast('Speech recognition is not supported in this browser.', 'error'); return }
    const rec = new SR()
    rec.lang              = voiceLang
    rec.interimResults    = false
    rec.maxAlternatives   = 1
    rec.onresult          = (e: { results: { [0]: { [0]: { transcript: string } } }[] }) => {
      setAiInput(prev => (prev ? prev + ' ' : '') + e.results[0][0].transcript)
      setListening(false)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh', display: 'flex', flexDirection: 'row' }}>

      {/* ── Main column ── */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>

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
      <div
        style={{
          height:       56,
          borderBottom: `1px solid ${C.border}`,
          display:      'flex',
          alignItems:   'center',
          justifyContent: 'space-between',
          padding:      '0 28px',
          backgroundColor: C.bg,
          position:     'sticky',
          top:          0,
          zIndex:       30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <LayoutDashboard size={16} style={{ color: C.primary }} />
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>Dashboard</h1>
          <span
            style={{
              backgroundColor: 'rgba(123,104,238,0.12)',
              color: C.primary, fontSize: 11, fontWeight: 500,
              padding: '2px 8px', borderRadius: 9999,
            }}
          >
            {loading ? '…' : total}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* AI assistant toggle */}
          <button
            onClick={() => setAiOpen(v => !v)}
            title="AI Task Assistant"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              backgroundColor: aiOpen ? 'rgba(123,104,238,0.18)' : 'transparent',
              border: `1px solid ${aiOpen ? C.primary : C.border}`,
              borderRadius: 7, padding: '6px 12px', fontSize: 12, fontWeight: 500,
              color: aiOpen ? C.primary : C.secondary,
              cursor: 'pointer', transition: 'all 0.15s',
            }}
            onMouseEnter={e => { if (!aiOpen) { (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHover; (e.currentTarget as HTMLButtonElement).style.color = C.text } }}
            onMouseLeave={e => { if (!aiOpen) { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;     (e.currentTarget as HTMLButtonElement).style.color = C.secondary } }}
          >
            <Sparkles size={13} />
            AI Assistant
            <ChevronRight size={12} style={{ transform: aiOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
          </button>

          <button
            onClick={() => { setShowModal(true); setForm(EMPTY_FORM); setFormError(null) }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              backgroundColor: C.primary, color: '#fff', border: 'none',
              borderRadius: 7, padding: '7px 14px', fontSize: 13, fontWeight: 500,
              cursor: 'pointer', transition: 'background-color 0.12s',
            }}
            onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.primaryHover)}
            onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.primary)}
          >
            <Plus size={14} />
            New Task
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* ── Metric cards ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
          {loading
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="skeleton" style={{ height: 88, borderRadius: 10 }} />
              ))
            : <>
                <MetricCard label="Total Tasks"  value={total}      color={C.text}    sub="all epics"         />
                <MetricCard label="In Progress"  value={inProgress} color={C.primary} sub="currently active"  />
                <MetricCard label="Blocked"      value={blocked}    color="#F87171"   sub="need attention"    />
                <MetricCard label="Done"         value={done}       color="#4ADE80"   sub="completed"         />
              </>
          }
        </div>

        {/* ── Filter bar ── */}
        <div
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          8,
            marginBottom: 14,
            flexWrap:     'wrap',
          }}
        >
          {/* Search */}
          <div style={{ position: 'relative', flex: 1, minWidth: 180, maxWidth: 280 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Search tasks…"
              value={filterText}
              onChange={e => setFilterText(e.target.value)}
              style={{
                width: '100%', boxSizing: 'border-box',
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 7, color: C.text, fontSize: 13,
                padding: '7px 12px 7px 32px', outline: 'none', fontFamily: 'inherit',
              }}
            />
            {filterText && (
              <button
                onClick={() => setFilterText('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 0, display: 'flex' }}
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as MainTaskStatus | '')}
              style={{
                backgroundColor: filterStatus ? 'rgba(123,104,238,0.14)' : C.elevated,
                border: `1px solid ${filterStatus ? C.primary : C.borderHover}`,
                borderRadius: 8, color: filterStatus ? C.primary : C.secondary,
                fontSize: 12, fontWeight: 500, padding: '8px 32px 8px 12px',
                cursor: 'pointer', outline: 'none', fontFamily: 'inherit', appearance: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <option value="" style={{ backgroundColor: C.elevated, color: C.text }}>All Statuses</option>
              {ALL_STATUSES.map(s => (
                <option key={s} value={s} style={{ backgroundColor: C.elevated, color: C.text }}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: filterStatus ? C.primary : C.muted, pointerEvents: 'none' }} />
          </div>

          {/* Priority filter */}
          <div style={{ position: 'relative' }}>
            <select
              value={filterPriority}
              onChange={e => setFilterPriority(e.target.value as TaskPriority | '')}
              style={{
                backgroundColor: filterPriority ? 'rgba(123,104,238,0.14)' : C.elevated,
                border: `1px solid ${filterPriority ? C.primary : C.borderHover}`,
                borderRadius: 8, color: filterPriority ? C.primary : C.secondary,
                fontSize: 12, fontWeight: 500, padding: '8px 32px 8px 12px',
                cursor: 'pointer', outline: 'none', fontFamily: 'inherit', appearance: 'none',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'border-color 0.15s, background-color 0.15s',
              }}
            >
              <option value="" style={{ backgroundColor: C.elevated, color: C.text }}>All Priorities</option>
              {PRIORITIES.map(p => (
                <option key={p} value={p} style={{ backgroundColor: C.elevated, color: C.text }}>
                  {PRIORITY_CONFIG[p].label}
                </option>
              ))}
            </select>
            <ChevronDown size={12} style={{ position: 'absolute', right: 9, top: '50%', transform: 'translateY(-50%)', color: filterPriority ? C.primary : C.muted, pointerEvents: 'none' }} />
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={() => { setFilterText(''); setFilterStatus(''); setFilterPriority('') }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                backgroundColor: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 7, color: C.secondary, fontSize: 12,
                padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHover; (e.currentTarget as HTMLButtonElement).style.color = C.text }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.secondary }}
            >
              <X size={11} />
              Clear filters
            </button>
          )}

          {/* Show / hide columns */}
          <div ref={colMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowColMenu(v => !v)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                backgroundColor: showColMenu ? 'rgba(123,104,238,0.12)' : C.surface,
                border: `1px solid ${showColMenu ? C.primary : C.border}`,
                borderRadius: 7, color: showColMenu ? C.primary : C.secondary,
                fontSize: 12, fontWeight: 500, padding: '7px 12px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <SlidersHorizontal size={12} />
              Columns
            </button>
            {showColMenu && (
              <div
                className="dropdown-panel"
                style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 40,
                  minWidth: 172,
                }}
              >
                {COLUMNS.filter(c => c.key !== '_delete' && c.label).map(col => (
                  <label
                    key={col.key}
                    className="dropdown-item"
                    style={{ fontWeight: visibleCols.has(col.key) ? 500 : 400 }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(123,104,238,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
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
                      style={{ accentColor: C.primary, cursor: 'pointer', flexShrink: 0 }}
                    />
                    {col.label}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Result count */}
          {!loading && (
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 'auto' }}>
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
            style={{
              position: 'fixed', inset: 0,
              backgroundColor: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)', zIndex: 50,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onClick={() => setShowModal(false)}
          >
            <form
              onSubmit={handleCreate}
              onClick={e => e.stopPropagation()}
              className="modal-enter"
              style={{
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 12, width: 540, maxWidth: '95vw',
                maxHeight: '90vh', overflowY: 'auto', zIndex: 51,
                boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: `1px solid ${C.border}` }}>
                <h2 style={{ margin: 0, fontSize: 15, fontWeight: 600, color: C.text }}>Create New Task</h2>
                <button
                  type="button" onClick={() => setShowModal(false)}
                  style={{ background: 'none', border: 'none', color: C.muted, cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}
                  onMouseEnter={e => (e.currentTarget.style.color = C.text)}
                  onMouseLeave={e => (e.currentTarget.style.color = C.muted)}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

                <div>
                  <FieldLabel required>Task Name</FieldLabel>
                  <input
                    type="text" value={form.name} autoFocus
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Enter task name…" style={modalInput}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel>Category</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ ...modalInput, paddingRight: 32, cursor: 'pointer' }}>
                        <option value="" style={{ backgroundColor: C.elevated, color: C.text }}>— Select —</option>
                        {CATEGORIES.map(c => <option key={c} value={c} style={{ backgroundColor: C.elevated, color: C.text }}>{c}</option>)}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Priority</FieldLabel>
                    <div style={{ position: 'relative' }}>
                      <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as TaskPriority }))} style={{ ...modalInput, paddingRight: 32, cursor: 'pointer' }}>
                        {PRIORITIES.map(p => <option key={p} value={p} style={{ backgroundColor: C.elevated, color: C.text }}>{PRIORITY_CONFIG[p].label}</option>)}
                      </select>
                      <ChevronDown size={14} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <FieldLabel>Taken At</FieldLabel>
                    <input type="datetime-local" value={form.taken_at} onChange={e => setForm(f => ({ ...f, taken_at: e.target.value }))} style={modalInput} />
                  </div>
                  <div>
                    <FieldLabel>Deadline</FieldLabel>
                    <input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} style={modalInput} />
                  </div>
                </div>

                <div>
                  <FieldLabel>Task Owner</FieldLabel>
                  <input type="text" value={form.task_owner} onChange={e => setForm(f => ({ ...f, task_owner: e.target.value }))} placeholder="e.g. john@example.com" style={modalInput} />
                </div>

                <div>
                  <FieldLabel>Note</FieldLabel>
                  <textarea value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional notes…" rows={3} style={{ ...modalInput, resize: 'vertical', minHeight: 72 }} />
                </div>

                {formError && <p style={{ margin: 0, fontSize: 12, color: C.danger }}>{formError}</p>}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 24px', borderTop: `1px solid ${C.border}` }}>
                <button
                  type="button" onClick={() => setShowModal(false)}
                  style={{ backgroundColor: 'transparent', border: `1px solid ${C.border}`, borderRadius: 7, color: C.secondary, padding: '7px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Cancel
                </button>
                <button
                  type="submit" disabled={submitting}
                  style={{ backgroundColor: C.primary, color: '#fff', border: 'none', borderRadius: 7, padding: '7px 20px', fontSize: 13, fontWeight: 500, cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1, fontFamily: 'inherit' }}
                >
                  {submitting ? 'Creating…' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Table ── */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1380, borderCollapse: 'collapse' }}>

              <colgroup>
                {COLUMNS.filter(c => visibleCols.has(c.key)).map(col => <col key={col.key} style={{ width: col.width ?? undefined }} />)}
              </colgroup>

              {/* Sticky header */}
              <thead style={{ position: 'sticky', top: 0, zIndex: 20 }}>
                <tr style={{ backgroundColor: C.sidebar }}>
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
                        style={{
                          padding: '0 14px', height: 36, textAlign: 'left',
                          fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: isSorted ? C.primary : col.editable ? C.secondary : C.muted,
                          whiteSpace: 'nowrap', borderBottom: `1px solid ${C.border}`,
                          backgroundColor: C.sidebar,
                          cursor: canSort ? 'pointer' : 'default',
                          userSelect: 'none',
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {col.label}
                          {isSorted
                            ? (sortDir === 'asc'
                                ? <ChevronUp size={10} style={{ color: C.primary }} />
                                : <ChevronDown size={10} style={{ color: C.primary }} />)
                            : col.editable && col.label
                              ? <Pencil size={9} style={{ color: C.muted, opacity: 0.5 }} />
                              : null
                          }
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {COLUMNS.filter(c => visibleCols.has(c.key)).map((col, j) => (
                        <td key={j} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                          <div className="skeleton" style={{ height: 12, width: j === 1 ? 180 : j === 0 ? 40 : 80, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : filteredTasks.length === 0 ? (
                  <tr>
                    <td
                      colSpan={COLUMNS.filter(c => visibleCols.has(c.key)).length}
                      style={{ padding: '64px 24px', textAlign: 'center' }}
                    >
                      {hasFilters ? (
                        <>
                          <SlidersHorizontal size={28} style={{ color: C.muted, margin: '0 auto 12px' }} />
                          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>
                            No tasks match your filters
                          </p>
                          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                            Try adjusting or clearing the filters.
                          </p>
                        </>
                      ) : (
                        <>
                          <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>No tasks yet</p>
                          <p style={{ margin: 0, fontSize: 12, color: C.muted }}>Click &ldquo;New Task&rdquo; to create your first epic.</p>
                        </>
                      )}
                    </td>
                  </tr>
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
                        className={isNew ? 'row-flash' : undefined}
                        style={{
                          backgroundColor: C.surface,
                          borderBottom:    `1px solid ${C.border}`,
                          transition:      'background-color 0.1s',
                          opacity:         deletingId === task.id ? 0.4 : 1,
                        }}
                        onMouseEnter={e => { if (!isNew) e.currentTarget.style.backgroundColor = C.surfaceHover }}
                        onMouseLeave={e => { if (!isNew) e.currentTarget.style.backgroundColor = C.surface }}
                      >

                        {/* ID */}
                        {visibleCols.has('display_id') && (
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.primary, backgroundColor: 'rgba(123,104,238,0.1)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {task.display_id}
                          </span>
                        </td>
                        )}

                        {/* Task name — editable */}
                        {visibleCols.has('name') && (
                        <td style={{ padding: '10px 14px', maxWidth: 260 }}>
                          {isEditing('name') ? (
                            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'name', editValue)} onKeyDown={onKeyDown('name')} style={cellInput} />
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'name', task.name)}
                              title={task.name}
                              className="editable-cell"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: C.text, fontWeight: 500, fontSize: 13 }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{task.name}</span>
                              <Pencil size={11} className="edit-hint" style={{ color: C.muted, flexShrink: 0 }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Category — editable */}
                        {visibleCols.has('category') && (
                        <td style={{ padding: '10px 14px', maxWidth: 150 }}>
                          {isEditing('category') ? (
                            <select autoFocus value={editValue} onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'category', e.target.value) }} onBlur={() => cancelEdit()} onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }} style={{ ...cellInput, cursor: 'pointer' }}>
                              <option value="">— None —</option>
                              {CATEGORIES.map(c => <option key={c} value={c} style={{ backgroundColor: C.surface }}>{c}</option>)}
                            </select>
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'category', task.category ?? '')}
                              className="editable-cell"
                              style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}
                            >
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.category ? C.secondary : C.muted, fontSize: 12, flex: 1 }}>
                                {task.category ?? '—'}
                              </span>
                              <Pencil size={10} className="edit-hint" style={{ color: C.muted, flexShrink: 0 }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Status — now editable */}
                        {visibleCols.has('status') && (
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing('status') ? (
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                              <select
                                autoFocus
                                value={editValue}
                                onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'status', e.target.value) }}
                                onBlur={() => cancelEdit()}
                                onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }}
                                style={{
                                  backgroundColor: STATUS_CONFIG[editValue as MainTaskStatus]?.bg ?? C.elevated,
                                  color:           STATUS_CONFIG[editValue as MainTaskStatus]?.text ?? C.text,
                                  border: `1.5px solid ${C.primary}`,
                                  borderRadius: 9999, fontSize: 11, fontWeight: 500,
                                  padding: '4px 28px 4px 10px',
                                  cursor: 'pointer', outline: 'none', appearance: 'none', fontFamily: 'inherit',
                                  boxShadow: '0 0 0 3px rgba(123,104,238,0.15)',
                                }}
                              >
                                {ALL_STATUSES.map(s => (
                                  <option key={s} value={s} style={{ backgroundColor: C.surface, color: C.text }}>
                                    {STATUS_CONFIG[s].label}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown size={10} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: STATUS_CONFIG[editValue as MainTaskStatus]?.text ?? C.muted, pointerEvents: 'none' }} />
                            </div>
                          ) : (
                            <span
                              onClick={() => startEdit(task.id, 'status', task.status)}
                              title="Click to change status"
                              style={{ cursor: 'pointer' }}
                            >
                              <StatusBadge status={task.status} interactive />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Priority — editable */}
                        {visibleCols.has('priority') && (
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing('priority') ? (
                            <select autoFocus value={editValue} onChange={e => { setEditValue(e.target.value); saveEdit(task.id, 'priority', e.target.value) }} onBlur={() => cancelEdit()} onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }} style={{ ...cellInput, cursor: 'pointer', width: 'auto' }}>
                              {PRIORITIES.map(p => <option key={p} value={p} style={{ backgroundColor: C.surface }}>{PRIORITY_CONFIG[p].label}</option>)}
                            </select>
                          ) : (
                            <span onClick={() => startEdit(task.id, 'priority', task.priority)} title="Click to edit" style={{ cursor: 'pointer' }}>
                              <PriorityFlag priority={task.priority} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Taken At — editable */}
                        {visibleCols.has('taken_at') && (
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing('taken_at') ? (
                            <input type="datetime-local" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'taken_at', editValue)} onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }} style={{ ...cellInput, fontSize: 12 }} />
                          ) : (
                            <span onClick={() => startEdit(task.id, 'taken_at', toInputDate(task.taken_at))} className="editable-cell" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ whiteSpace: 'nowrap', color: task.taken_at ? C.secondary : C.muted, fontSize: 12 }}>{formatDate(task.taken_at)}</span>
                              <Pencil size={10} className="edit-hint" style={{ color: C.muted }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Deadline — editable */}
                        {visibleCols.has('deadline') && (
                        <td style={{ padding: '10px 14px' }}>
                          {isEditing('deadline') ? (
                            <input type="datetime-local" autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'deadline', editValue)} onKeyDown={e => { if (e.key === 'Escape') cancelEdit() }} style={{ ...cellInput, fontSize: 12 }} />
                          ) : (
                            <span onClick={() => startEdit(task.id, 'deadline', toInputDate(task.deadline))} className="editable-cell" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <span style={{ whiteSpace: 'nowrap', color: task.deadline ? C.secondary : C.muted, fontSize: 12 }}>{formatDate(task.deadline)}</span>
                              <Pencil size={10} className="edit-hint" style={{ color: C.muted }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Owner — editable */}
                        {visibleCols.has('task_owner') && (
                        <td style={{ padding: '10px 14px', maxWidth: 120 }}>
                          {isEditing('task_owner') ? (
                            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'task_owner', editValue)} onKeyDown={onKeyDown('task_owner')} style={cellInput} />
                          ) : (
                            <span onClick={() => startEdit(task.id, 'task_owner', task.task_owner ?? '')} style={{ cursor: 'pointer' }}>
                              <OwnerAvatar value={task.task_owner} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Progress — read-only */}
                        {visibleCols.has('progress') && (
                        <td style={{ padding: '10px 14px', minWidth: 140 }}>
                          <ProgressBar value={task.progress} />
                        </td>
                        )}

                        {/* Time Spent — read-only */}
                        {visibleCols.has('time_spent') && (
                        <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontSize: 12, color: task.time_spent ? C.secondary : C.muted, fontVariantNumeric: 'tabular-nums' }}>
                            {formatTime(task.time_spent)}
                          </span>
                        </td>
                        )}

                        {/* Blocked By — editable */}
                        {visibleCols.has('blocked_by') && (
                        <td style={{ padding: '10px 14px', maxWidth: 110 }}>
                          {isEditing('blocked_by') ? (
                            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'blocked_by', editValue)} onKeyDown={onKeyDown('blocked_by')} style={cellInput} />
                          ) : (
                            <span onClick={() => startEdit(task.id, 'blocked_by', task.blocked_by ?? '')} className="editable-cell" style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.blocked_by ? '#F87171' : C.muted, fontSize: 12, flex: 1 }}>{task.blocked_by ?? '—'}</span>
                              <Pencil size={10} className="edit-hint" style={{ color: C.muted, flexShrink: 0 }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Note — editable */}
                        {visibleCols.has('note') && (
                        <td style={{ padding: '10px 14px', maxWidth: 150 }}>
                          {isEditing('note') ? (
                            <input autoFocus value={editValue} onChange={e => setEditValue(e.target.value)} onBlur={() => saveEdit(task.id, 'note', editValue)} onKeyDown={onKeyDown('note')} style={cellInput} />
                          ) : (
                            <span onClick={() => startEdit(task.id, 'note', task.note ?? '')} className="editable-cell" style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: task.note ? C.secondary : C.muted, fontSize: 12, flex: 1 }}>{task.note ?? '—'}</span>
                              <Pencil size={10} className="edit-hint" style={{ color: C.muted, flexShrink: 0 }} />
                            </span>
                          )}
                        </td>
                        )}

                        {/* Delete */}
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <button
                            onClick={() => askDelete(task.id, task.name)}
                            disabled={deletingId === task.id}
                            title="Delete task"
                            style={{
                              background: 'none', border: 'none',
                              cursor: deletingId === task.id ? 'not-allowed' : 'pointer',
                              padding: 5, borderRadius: 5, color: C.muted,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
      </div>{/* end main column */}

      {/* ── AI Assistant Sidebar ── */}
      {aiOpen && (
        <div
          style={{
            width:           340,
            flexShrink:      0,
            borderLeft:      `1px solid ${C.border}`,
            backgroundColor: C.sidebar,
            display:         'flex',
            flexDirection:   'column',
            height:          '100vh',
            position:        'sticky',
            top:             0,
            overflowY:       'auto',
          }}
        >
          {/* Sidebar header */}
          <div style={{
            height: 56, borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 16px', flexShrink: 0,
            position: 'sticky', top: 0, backgroundColor: C.sidebar, zIndex: 10,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sparkles size={14} style={{ color: C.primary }} />
              <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>AI Task Assistant</span>
            </div>
            <button
              onClick={() => setAiOpen(false)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: 4, borderRadius: 5, display: 'flex' }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = C.text}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = C.muted}
            >
              <X size={15} />
            </button>
          </div>

          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>

            {/* Instruction hint */}
            <p style={{ margin: 0, fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
              Describe a task in plain language — in English, Russian, or Uzbek. The AI will extract the details for your review before adding it to the table.
            </p>

            {/* Language selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Voice language
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                {VOICE_LANGS.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => setVoiceLang(lang.code)}
                    style={{
                      flex: 1, padding: '6px 4px', borderRadius: 7, cursor: 'pointer',
                      fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
                      backgroundColor: voiceLang === lang.code ? 'rgba(123,104,238,0.2)' : C.elevated,
                      border: `1px solid ${voiceLang === lang.code ? C.primary : C.border}`,
                      color: voiceLang === lang.code ? C.primary : C.secondary,
                      transition: 'all 0.12s',
                    }}
                  >
                    {lang.flag} {lang.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Text input + mic */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Task description
              </span>
              <div style={{ position: 'relative' }}>
                <textarea
                  value={aiInput}
                  onChange={e => setAiInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) aiParse() }}
                  placeholder={'e.g. "Set up CI/CD pipeline for the platform, high priority, assign to devops@company.com, deadline next Friday"'}
                  rows={5}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    backgroundColor: C.elevated, border: `1px solid ${C.border}`,
                    borderRadius: 8, color: C.text, fontSize: 12, lineHeight: 1.5,
                    padding: '10px 12px 10px 12px', paddingBottom: 36,
                    outline: 'none', resize: 'vertical', fontFamily: 'inherit',
                    transition: 'border-color 0.15s',
                  }}
                />
                {/* Mic button inside textarea */}
                <button
                  onClick={toggleVoice}
                  title={listening ? 'Stop recording' : `Record in ${voiceLang}`}
                  style={{
                    position: 'absolute', bottom: 8, right: 8,
                    width: 28, height: 28, borderRadius: 6, border: 'none',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    backgroundColor: listening ? 'rgba(239,68,68,0.15)' : C.surface,
                    color: listening ? '#F87171' : C.muted,
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!listening) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surfaceHover; (e.currentTarget as HTMLButtonElement).style.color = C.text } }}
                  onMouseLeave={e => { if (!listening) { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surface;      (e.currentTarget as HTMLButtonElement).style.color = C.muted } }}
                >
                  {listening ? <MicOff size={13} /> : <Mic size={13} />}
                </button>
                {listening && (
                  <div style={{
                    position: 'absolute', bottom: 8, right: 44,
                    display: 'flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: '#F87171',
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#F87171', animation: 'pulse 1s infinite' }} />
                    Listening…
                  </div>
                )}
              </div>
              <p style={{ margin: 0, fontSize: 11, color: C.muted }}>Tip: Ctrl + Enter to parse</p>
            </div>

            {/* Parse button */}
            <button
              onClick={aiParse}
              disabled={aiParsing || !aiInput.trim()}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                backgroundColor: C.primary, color: '#fff', border: 'none',
                borderRadius: 8, padding: '9px 0', fontSize: 13, fontWeight: 600,
                cursor: aiParsing || !aiInput.trim() ? 'not-allowed' : 'pointer',
                opacity: !aiInput.trim() ? 0.5 : 1,
                fontFamily: 'inherit', transition: 'background-color 0.12s, opacity 0.12s',
              }}
              onMouseEnter={e => { if (!aiParsing && aiInput.trim()) (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primaryHover }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primary }}
            >
              {aiParsing
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Parsing…</>
                : <><Sparkles size={13} /> Parse Task</>
              }
            </button>

            {/* Error */}
            {aiError && (
              <div style={{
                backgroundColor: 'rgba(239,68,68,0.08)', border: `1px solid rgba(239,68,68,0.25)`,
                borderRadius: 8, padding: '10px 12px',
                display: 'flex', alignItems: 'flex-start', gap: 8,
              }}>
                <XCircle size={14} style={{ color: C.danger, flexShrink: 0, marginTop: 1 }} />
                <span style={{ fontSize: 12, color: '#F87171', lineHeight: 1.4 }}>{aiError}</span>
              </div>
            )}

            {/* Task preview */}
            {aiPreview && (
              <div style={{
                backgroundColor: C.surface, border: `1px solid ${C.border}`,
                borderRadius: 10, overflow: 'hidden',
              }}>
                {/* Preview header */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 14px', borderBottom: `1px solid ${C.border}`,
                  backgroundColor: 'rgba(123,104,238,0.06)',
                }}>
                  <CheckCircle2 size={13} style={{ color: '#4ADE80' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.text }}>Parsed Preview</span>
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 'auto' }}>Review before approving</span>
                </div>

                {/* Fields */}
                <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(
                    [
                      { label: 'Name',     value: aiPreview.name,       key: 'name'       },
                      { label: 'Category', value: aiPreview.category,   key: 'category'   },
                      { label: 'Priority', value: aiPreview.priority,   key: 'priority'   },
                      { label: 'Owner',    value: aiPreview.task_owner, key: 'task_owner' },
                      { label: 'Deadline', value: aiPreview.deadline,   key: 'deadline'   },
                      { label: 'Note',     value: aiPreview.note,       key: 'note'       },
                    ] as { label: string; value: string | null; key: keyof ParsedTask }[]
                  ).map(({ label, value, key }) => (
                    <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {label}
                      </span>
                      <input
                        value={value ?? ''}
                        onChange={e => setAiPreview(p => p ? { ...p, [key]: e.target.value || null } : p)}
                        style={{
                          backgroundColor: C.elevated, border: `1px solid ${C.border}`,
                          borderRadius: 6, color: value ? C.text : C.muted,
                          fontSize: 12, padding: '5px 8px', outline: 'none',
                          fontFamily: 'inherit', transition: 'border-color 0.15s', width: '100%', boxSizing: 'border-box',
                        }}
                        onFocus={e  => (e.currentTarget.style.borderColor = C.primary)}
                        onBlur={e   => (e.currentTarget.style.borderColor = C.border)}
                        placeholder="—"
                      />
                    </div>
                  ))}
                </div>

                {/* Action buttons */}
                <div style={{
                  display: 'flex', gap: 8, padding: '10px 14px',
                  borderTop: `1px solid ${C.border}`,
                }}>
                  <button
                    onClick={() => { setAiPreview(null); setAiError(null) }}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      backgroundColor: 'transparent', border: `1px solid ${C.border}`,
                      borderRadius: 7, color: C.secondary, fontSize: 12, fontWeight: 500,
                      padding: '7px 0', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHover; (e.currentTarget as HTMLButtonElement).style.color = C.text }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border;     (e.currentTarget as HTMLButtonElement).style.color = C.secondary }}
                  >
                    <XCircle size={13} />
                    Discard
                  </button>
                  <button
                    onClick={aiApprove}
                    disabled={aiApproving}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                      backgroundColor: '#4ADE80', border: 'none',
                      borderRadius: 7, color: '#0a1a0f', fontSize: 12, fontWeight: 700,
                      padding: '7px 0', cursor: aiApproving ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit', opacity: aiApproving ? 0.7 : 1,
                      transition: 'opacity 0.12s, background-color 0.12s',
                    }}
                    onMouseEnter={e => { if (!aiApproving) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#22c55e' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#4ADE80' }}
                  >
                    {aiApproving
                      ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Adding…</>
                      : <><CheckCircle2 size={13} /> Approve</>
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
