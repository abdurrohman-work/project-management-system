'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, ChevronDown, Flag, Pencil, X, Search, AlertCircle } from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type { TaskPriority, WorkloadStatus } from '@/types/database'

// ─── Types ─────────────────────────────────────────────────────────────────────

type WorkloadRow = {
  id:           string
  status:       WorkloadStatus
  planned_time: number
  actual_time:  number
  start_date:   string | null
  due_date:     string | null
  st_id:        string
  st_name:      string
  priority:     TaskPriority
  main_task_id: string
  mt_id:        string
}

// ─── Status config ──────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkloadStatus, { dot: string; badgeBg: string; badgeText: string; label: string }> = {
  not_started: { dot: '#9ca3af', badgeBg: '#374151', badgeText: '#9ca3af', label: 'Not Started' },
  in_progress: { dot: '#3f9cfb', badgeBg: '#1e3a5f', badgeText: '#3f9cfb', label: 'In Progress' },
  done:        { dot: '#4ade80', badgeBg: '#052e16', badgeText: '#4ade80', label: 'Done'        },
  halted:      { dot: '#fbbf24', badgeBg: '#3b2f04', badgeText: '#fbbf24', label: 'Halted'      },
}

const PRIORITY_CONFIG: Record<TaskPriority, { textClass: string; label: string; hex: string }> = {
  low:      { textClass: 'text-[#9ca3af]', label: 'Low',      hex: '#9ca3af' },
  medium:   { textClass: 'text-[#60a5fa]', label: 'Medium',   hex: '#60a5fa' },
  high:     { textClass: 'text-[#fb923c]', label: 'High',     hex: '#fb923c' },
  critical: { textClass: 'text-[#f87171]', label: 'Critical', hex: '#f87171' },
}

const ALL_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'halted']

// ─── Helpers ────────────────────────────────────────────────────────────────────

function displayTime(minutes: number): string {
  return minutes === 0 ? '—' : minutesToHours(minutes)
}

function buildParams(status: string, startAfter: string, startBefore: string): string {
  const p = new URLSearchParams()
  if (status)      p.set('status', status)
  if (startAfter)  p.set('start_after', startAfter)
  if (startBefore) p.set('start_before', startBefore)
  const s = p.toString()
  return s ? `?${s}` : ''
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  // Display as-is (YYYY-MM-DD) or reformat slightly
  const parts = dateStr.split('-')
  if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`
  return dateStr
}

// ─── Toast ──────────────────────────────────────────────────────────────────────

type Toast = { id: number; message: string; type: 'error' | 'success' }

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div
          key={t.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-lg border px-4 py-2.5 text-sm shadow-lg"
          style={{
            backgroundColor: '#111b24',
            borderColor: t.type === 'error' ? '#f87171' : '#4ade80',
            color: t.type === 'error' ? '#f87171' : '#4ade80',
          }}
        >
          <AlertCircle size={14} />
          <span>{t.message}</span>
          <button
            onClick={() => onDismiss(t.id)}
            className="ml-2 opacity-60 hover:opacity-100 cursor-pointer"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  )
}

// ─── Spinner ────────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg
      className="animate-spin"
      style={{ width: 12, height: 12, color: '#3f9cfb', flexShrink: 0 }}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  )
}

// ─── TimeCell ───────────────────────────────────────────────────────────────────

function TimeCell({
  value,
  onSave,
  onError,
}: {
  value:   number
  onSave:  (minutes: number) => Promise<void>
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)
  const originalRef           = useRef(value)

  function startEdit() {
    originalRef.current = value
    setDraft(String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commit() {
    const minutes = Math.max(0, Math.round(Number(draft) || 0))
    setSaving(true)
    try {
      await onSave(minutes)
      setEditing(false)
    } catch {
      onError('Failed to save — value reverted')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-sm text-white/60">{displayTime(value)}</span>
        <Spinner />
      </span>
    )
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        placeholder="mins"
        className="w-20 rounded px-2 py-1 text-sm text-white outline-none"
        style={{
          backgroundColor: '#111b24',
          border: '1.5px solid #3f9cfb',
        }}
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit (enter minutes)"
      className="group inline-flex items-center gap-1 cursor-text"
    >
      <span className={`text-sm ${value === 0 ? 'text-white/40' : 'text-white'}`}>
        {displayTime(value)}
      </span>
      <Pencil
        size={10}
        className="opacity-0 group-hover:opacity-60 transition-opacity duration-100 text-white/60"
      />
    </span>
  )
}

// ─── DateCell ───────────────────────────────────────────────────────────────────

function DateCell({
  value,
  field,
  rowId,
  onSave,
  onError,
}: {
  value:   string | null
  field:   'start_date' | 'due_date'
  rowId:   string
  onSave:  (rowId: string, field: 'start_date' | 'due_date', val: string | null) => Promise<void>
  onError: (msg: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState(value ?? '')
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(value ?? '')
    setEditing(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  async function commit() {
    const newVal = draft || null
    setSaving(true)
    try {
      await onSave(rowId, field, newVal)
      setEditing(false)
    } catch {
      onError('Failed to save date — value reverted')
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (saving) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs text-white/60">{formatDate(value)}</span>
        <Spinner />
      </span>
    )
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        className="rounded px-2 py-1 text-sm text-white outline-none"
        style={{
          backgroundColor: '#111b24',
          border: '1.5px solid #3f9cfb',
          colorScheme: 'dark',
        }}
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit date"
      className="group inline-flex items-center gap-1 cursor-text"
    >
      <span className={`text-xs whitespace-nowrap ${value ? 'text-white/70' : 'text-white/30'}`}>
        {formatDate(value)}
      </span>
      <Pencil
        size={9}
        className="opacity-0 group-hover:opacity-50 transition-opacity duration-100 text-white/50"
      />
    </span>
  )
}

// ─── StatusBadge + Dropdown ─────────────────────────────────────────────────────

function StatusCell({
  status,
  rowId,
  onSave,
  onError,
}: {
  status:  WorkloadStatus
  rowId:   string
  onSave:  (rowId: string, status: WorkloadStatus) => Promise<void>
  onError: (msg: string) => void
}) {
  const [open,   setOpen]   = useState(false)
  const [saving, setSaving] = useState(false)
  const cfg                 = STATUS_CONFIG[status]
  const containerRef        = useRef<HTMLDivElement>(null)

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function select(s: WorkloadStatus) {
    setOpen(false)
    if (s === status) return
    setSaving(true)
    try {
      await onSave(rowId, s)
    } catch {
      onError('Failed to update status')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        onClick={() => setOpen(v => !v)}
        disabled={saving}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium cursor-pointer transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ backgroundColor: cfg.badgeBg, color: cfg.badgeText }}
      >
        {saving ? (
          <Spinner />
        ) : (
          <span
            className="rounded-full flex-shrink-0"
            style={{ width: 6, height: 6, backgroundColor: cfg.dot }}
          />
        )}
        <span>{cfg.label}</span>
        <ChevronDown size={10} className="opacity-60" />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full mt-1 z-20 rounded-md shadow-lg border"
          style={{
            backgroundColor: '#111b24',
            borderColor: '#2a3f52',
            minWidth: 140,
          }}
        >
          {ALL_STATUSES.map(s => {
            const c = STATUS_CONFIG[s]
            return (
              <button
                key={s}
                onClick={() => select(s)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors cursor-pointer"
                style={{
                  color: s === status ? c.badgeText : 'rgba(255,255,255,0.75)',
                  backgroundColor: s === status ? c.badgeBg : 'transparent',
                }}
                onMouseEnter={e => {
                  if (s !== status) (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e2d3d'
                }}
                onMouseLeave={e => {
                  if (s !== status) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'
                }}
              >
                <span
                  className="rounded-full flex-shrink-0"
                  style={{ width: 6, height: 6, backgroundColor: c.dot }}
                />
                {c.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Skeleton rows ──────────────────────────────────────────────────────────────

function SkeletonRows({ cols }: { cols: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={i} className="border-b border-[#2a3f52]">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="py-2.5 px-3">
              <div
                className="animate-pulse rounded"
                style={{
                  height: 12,
                  width: j === 2 ? 140 : j === 0 || j === 8 ? 56 : 72,
                  backgroundColor: '#1e2d3d',
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────────────

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <tr>
      <td colSpan={9} className="py-16 text-center">
        <div className="flex flex-col items-center gap-3">
          {/* SVG illustration — no emoji */}
          <svg
            width="40"
            height="40"
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="opacity-30"
          >
            <rect x="4" y="8" width="32" height="24" rx="3" stroke="#3f9cfb" strokeWidth="1.5" />
            <line x1="4" y1="15" x2="36" y2="15" stroke="#3f9cfb" strokeWidth="1.5" />
            <line x1="12" y1="21" x2="28" y2="21" stroke="#3f9cfb" strokeWidth="1.5" />
            <line x1="12" y1="26" x2="22" y2="26" stroke="#3f9cfb" strokeWidth="1.5" />
          </svg>
          <p className="text-sm font-medium" style={{ color: 'rgba(255,255,255,0.6)' }}>
            No workload entries found
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>
            {hasFilters
              ? 'Try adjusting or clearing your filters.'
              : 'Workload entries are created automatically when a subtask is set to In Progress.'}
          </p>
          {hasFilters && (
            <button
              onClick={onClear}
              className="mt-1 flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
              style={{
                borderColor: '#2a3f52',
                color: 'rgba(255,255,255,0.6)',
                backgroundColor: 'transparent',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f9cfb'
                ;(e.currentTarget as HTMLButtonElement).style.color = '#3f9cfb'
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a3f52'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.6)'
              }}
            >
              <X size={11} />
              Reset filters
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ─── Column definitions ─────────────────────────────────────────────────────────

const COLS = [
  { label: 'MT ID',       key: 'mt_id'        },
  { label: 'ST ID',       key: 'st_id'        },
  { label: 'Task Name',   key: 'st_name'      },
  { label: 'Status',      key: 'status'       },
  { label: 'Priority',    key: 'priority'     },
  { label: 'SP',          key: 'planned_time' },
  { label: 'AP',          key: 'actual_time'  },
  { label: 'Start Date',  key: 'start_date'   },
  { label: 'Due Date',    key: 'due_date'     },
] as const

// ─── Page ────────────────────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const [rows,    setRows]    = useState<WorkloadRow[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts,  setToasts]  = useState<Toast[]>([])
  let   toastId               = useRef(0)

  const [filterStatus,      setFilterStatus]      = useState('')
  const [filterStartAfter,  setFilterStartAfter]  = useState('')
  const [filterStartBefore, setFilterStartBefore] = useState('')

  // ── Toast helpers ─────────────────────────────────────────────────────────
  function pushToast(message: string, type: Toast['type'] = 'error') {
    const id = ++toastId.current
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000)
  }

  function dismissToast(id: number) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const load = useCallback(async (status: string, startAfter: string, startBefore: string) => {
    setLoading(true)
    const qs  = buildParams(status, startAfter, startBefore)
    const res = await fetch(`/api/workload-entries/list${qs}`)
    const json = await res.json()
    if (json.success) setRows(json.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load('', '', '')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilters() { load(filterStatus, filterStartAfter, filterStartBefore) }

  function clearFilters() {
    setFilterStatus('')
    setFilterStartAfter('')
    setFilterStartBefore('')
    load('', '', '')
  }

  const hasFilters = !!(filterStatus || filterStartAfter || filterStartBefore)

  // ── Save time ─────────────────────────────────────────────────────────────
  async function saveTime(id: string, field: 'planned_time' | 'actual_time', minutes: number) {
    const res  = await fetch(`/api/workload-entries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: minutes }),
    })
    const json = await res.json()
    if (json.success) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: minutes } : r))
    } else {
      throw new Error(json.error || 'Save failed')
    }
  }

  // ── Save date ─────────────────────────────────────────────────────────────
  async function saveDate(id: string, field: 'start_date' | 'due_date', val: string | null) {
    const res  = await fetch(`/api/workload-entries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: val }),
    })
    const json = await res.json()
    if (json.success) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: val } : r))
    } else {
      throw new Error(json.error || 'Save failed')
    }
  }

  // ── Save status ───────────────────────────────────────────────────────────
  async function saveStatus(id: string, status: WorkloadStatus) {
    const res  = await fetch(`/api/workload-entries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    const json = await res.json()
    if (json.success) {
      setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r))
    } else {
      throw new Error(json.error || 'Save failed')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#18232d' }}>

      {/* ── Sticky header ── */}
      <div
        className="sticky top-0 z-30 flex h-14 items-center justify-between border-b px-7"
        style={{ backgroundColor: '#18232d', borderColor: '#2a3f52' }}
      >
        <div className="flex items-center gap-2.5">
          <Clock size={15} style={{ color: '#3f9cfb' }} />
          <h1 className="text-sm font-semibold text-white">Workload</h1>
          {!loading && (
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: 'rgba(63,156,251,0.12)', color: '#3f9cfb' }}
            >
              {rows.length}
            </span>
          )}
        </div>
      </div>

      <div className="px-7 py-6">

        {/* ── Filter bar ── */}
        <div
          className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border p-4"
          style={{ backgroundColor: '#1e2d3d', borderColor: '#2a3f52' }}
        >
          {/* Status filter */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Status
            </label>
            <div className="relative">
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="cursor-pointer appearance-none rounded-md border pr-7 pl-2.5 py-1.5 text-xs font-medium outline-none transition-colors"
                style={{
                  backgroundColor: filterStatus ? 'rgba(63,156,251,0.1)' : '#111b24',
                  borderColor:     filterStatus ? '#3f9cfb' : '#2a3f52',
                  color:           filterStatus ? '#3f9cfb' : 'rgba(255,255,255,0.55)',
                  minWidth: 150,
                }}
              >
                <option value="" style={{ backgroundColor: '#1e2d3d', color: '#fff' }}>All statuses</option>
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s} style={{ backgroundColor: '#1e2d3d', color: '#fff' }}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={11}
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                style={{ color: filterStatus ? '#3f9cfb' : 'rgba(255,255,255,0.35)' }}
              />
            </div>
          </div>

          {/* Start after */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Start after
            </label>
            <input
              type="date"
              value={filterStartAfter}
              onChange={e => setFilterStartAfter(e.target.value)}
              className="rounded-md border px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-[#3f9cfb]"
              style={{
                backgroundColor: '#111b24',
                borderColor: '#2a3f52',
                color: filterStartAfter ? '#fff' : 'rgba(255,255,255,0.4)',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Start before */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-white/40">
              Start before
            </label>
            <input
              type="date"
              value={filterStartBefore}
              onChange={e => setFilterStartBefore(e.target.value)}
              className="rounded-md border px-2.5 py-1.5 text-xs outline-none transition-colors focus:border-[#3f9cfb]"
              style={{
                backgroundColor: '#111b24',
                borderColor: '#2a3f52',
                color: filterStartBefore ? '#fff' : 'rgba(255,255,255,0.4)',
                colorScheme: 'dark',
              }}
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-end gap-2">
            <button
              onClick={applyFilters}
              className="rounded-md px-4 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-85 cursor-pointer"
              style={{ backgroundColor: '#3f9cfb' }}
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer"
                style={{
                  backgroundColor: 'transparent',
                  borderColor: '#2a3f52',
                  color: 'rgba(255,255,255,0.5)',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#3f9cfb'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#3f9cfb'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#2a3f52'
                  ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)'
                }}
              >
                <X size={10} />
                Clear
              </button>
            )}
          </div>

          {!loading && (
            <span className="ml-auto self-center text-xs text-white/30">
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {/* ── Table ── */}
        <div
          className="overflow-hidden rounded-xl border"
          style={{ borderColor: '#2a3f52', backgroundColor: '#18232d' }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm" style={{ minWidth: 960 }}>

              {/* Header */}
              <thead>
                <tr className="sticky top-0" style={{ backgroundColor: '#111b24' }}>
                  {COLS.map(col => (
                    <th
                      key={col.key}
                      className="border-b px-3 py-2.5 text-left text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap"
                      style={{ borderColor: '#2a3f52', color: 'rgba(255,255,255,0.5)' }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              {/* Body */}
              <tbody>
                {loading ? (
                  <SkeletonRows cols={COLS.length} />
                ) : rows.length === 0 ? (
                  <EmptyState hasFilters={hasFilters} onClear={clearFilters} />
                ) : (
                  rows.map(row => {
                    const pr = PRIORITY_CONFIG[row.priority]

                    return (
                      <tr
                        key={row.id}
                        className="border-b transition-colors duration-150"
                        style={{ backgroundColor: '#18232d', borderColor: '#2a3f52' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#1e2d3d')}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#18232d')}
                      >
                        {/* MT ID */}
                        <td className="py-2.5 px-3">
                          <span
                            className="font-mono text-[11px] whitespace-nowrap rounded px-1.5 py-0.5"
                            style={{ color: '#3f9cfb', backgroundColor: 'rgba(63,156,251,0.1)' }}
                          >
                            {row.mt_id}
                          </span>
                        </td>

                        {/* ST ID */}
                        <td className="py-2.5 px-3">
                          <span
                            className="font-mono text-[11px] whitespace-nowrap rounded px-1.5 py-0.5"
                            style={{ color: '#3f9cfb', backgroundColor: 'rgba(63,156,251,0.1)' }}
                          >
                            {row.st_id}
                          </span>
                        </td>

                        {/* Task Name */}
                        <td className="py-2.5 px-3 text-white font-medium text-sm max-w-xs">
                          <span className="line-clamp-1">{row.st_name}</span>
                        </td>

                        {/* Status */}
                        <td className="py-2.5 px-3">
                          <StatusCell
                            status={row.status}
                            rowId={row.id}
                            onSave={saveStatus}
                            onError={pushToast}
                          />
                        </td>

                        {/* Priority */}
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-medium ${pr.textClass}`}
                          >
                            <Flag size={12} fill={pr.hex} className="flex-shrink-0" />
                            {pr.label}
                          </span>
                        </td>

                        {/* SP — planned time, inline editable */}
                        <td className="py-2.5 px-3">
                          <TimeCell
                            value={row.planned_time}
                            onSave={m => saveTime(row.id, 'planned_time', m)}
                            onError={pushToast}
                          />
                        </td>

                        {/* AP — actual time, inline editable */}
                        <td className="py-2.5 px-3">
                          <TimeCell
                            value={row.actual_time}
                            onSave={m => saveTime(row.id, 'actual_time', m)}
                            onError={pushToast}
                          />
                        </td>

                        {/* Start Date — inline editable */}
                        <td className="py-2.5 px-3">
                          <DateCell
                            value={row.start_date}
                            field="start_date"
                            rowId={row.id}
                            onSave={saveDate}
                            onError={pushToast}
                          />
                        </td>

                        {/* Due Date — inline editable */}
                        <td className="py-2.5 px-3">
                          <DateCell
                            value={row.due_date}
                            field="due_date"
                            rowId={row.id}
                            onSave={saveDate}
                            onError={pushToast}
                          />
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          {!loading && rows.length > 0 && (
            <div
              className="border-t px-4 py-2 text-xs"
              style={{
                backgroundColor: '#111b24',
                borderColor: '#2a3f52',
                color: 'rgba(255,255,255,0.35)',
              }}
            >
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </div>
          )}
        </div>
      </div>

      {/* Toast container */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}
