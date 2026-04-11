'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronLeft, ChevronRight, Clock, Flag, Pencil, Search, X, ChevronDown } from 'lucide-react'
import { minutesToHours } from '@/lib/time'
import type { TaskPriority, WorkloadStatus } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

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

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<WorkloadStatus, { dot: string; text: string; bg: string; label: string }> = {
  not_started: { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Not Started' },
  in_progress: { dot: '#60A5FA', text: '#60A5FA', bg: 'rgba(59,130,246,0.12)',  label: 'In Progress' },
  done:        { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)', label: 'Done'        },
  stopped:     { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Stopped'     },
  blocked:     { dot: '#F87171', text: '#F87171', bg: 'rgba(239,68,68,0.12)',  label: 'Blocked'     },
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Critical' },
  high:     { color: '#F59E0B', label: 'High'     },
  medium:   { color: '#3B82F6', label: 'Medium'   },
  low:      { color: '#6B7280', label: 'Low'      },
}

const ALL_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'stopped', 'blocked']

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── DateTimePicker helpers ───────────────────────────────────────────────────

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
]
const WEEK_DAYS = ['Su','Mo','Tu','We','Th','Fr','Sa']

function buildCalendarCells(year: number, month: number): (number | null)[] {
  const firstDow = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = Array(firstDow).fill(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

/** Parse a "YYYY-MM-DDTHH:mm" string into parts. */
function parseDTString(val: string): {
  year: number; month: number; day: number; h24: number; min: number
} | null {
  if (!val) return null
  const [datePart = '', timePart = '00:00'] = val.split('T')
  const [y, mo, d] = datePart.split('-').map(Number)
  const [h, m]     = timePart.split(':').map(Number)
  if (!y || !mo || !d) return null
  return { year: y, month: mo - 1, day: d, h24: h ?? 0, min: m ?? 0 }
}

/** Serialise back to "YYYY-MM-DDTHH:mm". */
function toDTString(year: number, month: number, day: number, h24: number, min: number): string {
  const pad = (n: number, w = 2) => String(n).padStart(w, '0')
  return `${pad(year, 4)}-${pad(month + 1)}-${pad(day)}T${pad(h24)}:${pad(min)}`
}

function formatDTDisplay(val: string): string {
  const dt = parseDTString(val)
  if (!dt) return ''
  const d = new Date(dt.year, dt.month, dt.day, dt.h24, dt.min)
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

// ─── Shared micro-styles ──────────────────────────────────────────────────────

const dtNavBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: C.secondary, padding: '3px 6px', borderRadius: 5,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  transition: 'background-color 0.12s, color 0.12s',
}
const dtTimeBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
  padding: '3px 8px', borderRadius: 4, lineHeight: 1, fontFamily: 'inherit',
  fontSize: 11, transition: 'color 0.12s, background-color 0.12s',
}
const dtFooterLinkStyle: React.CSSProperties = {
  background: 'none', border: 'none', cursor: 'pointer', color: C.muted,
  fontSize: 12, padding: '4px 8px', borderRadius: 5, fontFamily: 'inherit',
  transition: 'color 0.12s',
}

// ─── DateTimePicker component ─────────────────────────────────────────────────

function DateTimePicker({
  value,
  onChange,
  placeholder = 'Pick date & time',
}: {
  value:        string
  onChange:     (val: string) => void
  placeholder?: string
}) {
  const today = new Date()
  const init  = parseDTString(value)

  const [open,      setOpen]      = useState(false)
  const [viewYear,  setViewYear]  = useState(init?.year  ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(init?.month ?? today.getMonth())
  const [selYear,   setSelYear]   = useState(init?.year  ?? today.getFullYear())
  const [selMonth,  setSelMonth]  = useState(init?.month ?? today.getMonth())
  const [selDay,    setSelDay]    = useState(init?.day   ?? today.getDate())
  const [hour12,    setHour12]    = useState(() => {
    const h = init?.h24 ?? 0
    return h === 0 ? 12 : h > 12 ? h - 12 : h
  })
  const [minute, setMinute] = useState(init?.min ?? 0)
  const [ampm,   setAmpm]   = useState<'AM' | 'PM'>((init?.h24 ?? 0) >= 12 ? 'PM' : 'AM')
  const [pos,    setPos]    = useState({ top: 0, left: 0 })
  const [mounted, setMounted] = useState(false)

  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  // Sync local state if value changes from outside
  useEffect(() => {
    const dt = parseDTString(value)
    if (!dt) return
    setViewYear(dt.year); setViewMonth(dt.month)
    setSelYear(dt.year);  setSelMonth(dt.month); setSelDay(dt.day)
    const h = dt.h24
    setHour12(h === 0 ? 12 : h > 12 ? h - 12 : h)
    setMinute(dt.min)
    setAmpm(h >= 12 ? 'PM' : 'AM')
  }, [value])

  function openPicker() {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    // Clamp to viewport so panel never overflows the right edge
    const left = Math.min(rect.left, window.innerWidth - 284 - 8)
    setPos({ top: rect.bottom + 6, left: Math.max(8, left) })
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function commit() {
    const h24 = ampm === 'AM'
      ? (hour12 === 12 ? 0 : hour12)
      : (hour12 === 12 ? 12 : hour12 + 12)
    onChange(toDTString(selYear, selMonth, selDay, h24, minute))
    setOpen(false)
  }

  function clear()    { onChange(''); setOpen(false) }
  function gotoToday() {
    setViewYear(today.getFullYear()); setViewMonth(today.getMonth())
    setSelYear(today.getFullYear());  setSelMonth(today.getMonth()); setSelDay(today.getDate())
  }

  function prevMonth() {
    setViewMonth(m => { if (m === 0) { setViewYear(y => y - 1); return 11 } return m - 1 })
  }
  function nextMonth() {
    setViewMonth(m => { if (m === 11) { setViewYear(y => y + 1); return 0 } return m + 1 })
  }

  const cells = buildCalendarCells(viewYear, viewMonth)

  const panel = mounted && open && createPortal(
    <div
      ref={panelRef}
      style={{
        position:        'fixed',
        top:             pos.top,
        left:            pos.left,
        width:           284,
        zIndex:          9999,
        backgroundColor: C.elevated,
        border:          `1px solid ${C.borderHover}`,
        borderRadius:    12,
        boxShadow:       '0 16px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)',
        overflow:        'hidden',
        fontFamily:      'Inter, -apple-system, sans-serif',
        animation:       'fadeInScale 0.14s ease-out',
      }}
    >
      {/* ── Month navigation ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px 8px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <button
          onClick={prevMonth}
          style={dtNavBtnStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surface; (e.currentTarget as HTMLButtonElement).style.color = C.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.secondary }}
        >
          <ChevronLeft size={14} />
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button
          onClick={nextMonth}
          style={dtNavBtnStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surface; (e.currentTarget as HTMLButtonElement).style.color = C.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; (e.currentTarget as HTMLButtonElement).style.color = C.secondary }}
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {/* ── Day-of-week headers ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 10px 2px' }}>
        {WEEK_DAYS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>
            {d}
          </div>
        ))}
      </div>

      {/* ── Day cells ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '2px 10px 8px', gap: 2 }}>
        {cells.map((day, i) => {
          if (!day) return <div key={`e-${i}`} />
          const isSelected = day === selDay && viewMonth === selMonth && viewYear === selYear
          const isToday    = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear()
          return (
            <button
              key={`d-${i}`}
              onClick={() => { setSelDay(day); setSelMonth(viewMonth); setSelYear(viewYear) }}
              style={{
                textAlign:       'center',
                fontSize:        12,
                fontWeight:      isSelected ? 700 : isToday ? 600 : 400,
                padding:         '5px 2px',
                border:          isToday && !isSelected ? `1.5px solid ${C.primary}` : 'none',
                cursor:          'pointer',
                borderRadius:    6,
                fontFamily:      'inherit',
                backgroundColor: isSelected ? C.primary : 'transparent',
                color:           isSelected ? '#fff' : isToday ? C.primary : C.text,
                transition:      'background-color 0.1s',
              }}
              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.surface }}
              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
            >
              {day}
            </button>
          )
        })}
      </div>

      {/* ── Time selector ── */}
      <div style={{
        margin:          '0 10px 8px',
        padding:         '10px 12px',
        backgroundColor: C.surface,
        border:          `1px solid ${C.border}`,
        borderRadius:    8,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        gap:             10,
      }}>
        {/* Hours */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setHour12(h => h === 12 ? 1 : h + 1)}
            style={dtTimeBtnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.elevated }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >▲</button>
          <span style={{ fontSize: 20, fontWeight: 600, color: C.text, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {String(hour12).padStart(2, '0')}
          </span>
          <button
            onClick={() => setHour12(h => h === 1 ? 12 : h - 1)}
            style={dtTimeBtnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.elevated }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >▼</button>
        </div>

        <span style={{ fontSize: 20, fontWeight: 600, color: C.muted, userSelect: 'none', marginBottom: 2 }}>:</span>

        {/* Minutes */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => setMinute(m => (m + 1) % 60)}
            style={dtTimeBtnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.elevated }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >▲</button>
          <span style={{ fontSize: 20, fontWeight: 600, color: C.text, minWidth: 28, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>
            {String(minute).padStart(2, '0')}
          </span>
          <button
            onClick={() => setMinute(m => (m - 1 + 60) % 60)}
            style={dtTimeBtnStyle}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text; (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.elevated }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent' }}
          >▼</button>
        </div>

        {/* AM / PM */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginLeft: 4 }}>
          {(['AM', 'PM'] as const).map(p => (
            <button
              key={p}
              onClick={() => setAmpm(p)}
              style={{
                fontSize:        11,
                fontWeight:      600,
                padding:         '5px 9px',
                borderRadius:    6,
                border:          'none',
                cursor:          'pointer',
                fontFamily:      'inherit',
                backgroundColor: ampm === p ? C.primary : C.elevated,
                color:           ampm === p ? '#fff' : C.muted,
                transition:      'background-color 0.12s, color 0.12s',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* ── Footer ── */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        padding:        '6px 14px 12px',
      }}>
        <button
          onClick={clear}
          style={dtFooterLinkStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
        >
          Clear
        </button>
        <button
          onClick={gotoToday}
          style={dtFooterLinkStyle}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = C.text }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = C.muted }}
        >
          Today
        </button>
        <button
          onClick={commit}
          style={{
            backgroundColor: C.primary,
            color:           '#fff',
            border:          'none',
            borderRadius:    7,
            fontSize:        12,
            fontWeight:      600,
            padding:         '6px 16px',
            cursor:          'pointer',
            fontFamily:      'inherit',
            transition:      'background-color 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primaryHover }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = C.primary }}
        >
          Apply
        </button>
      </div>
    </div>,
    document.body
  )

  return (
    <>
      <button
        ref={triggerRef}
        onClick={openPicker}
        style={{
          display:         'inline-flex',
          alignItems:      'center',
          gap:             6,
          backgroundColor: value ? 'rgba(123,104,238,0.10)' : C.elevated,
          border:          `1px solid ${open ? C.primary : value ? C.primary : C.borderHover}`,
          borderRadius:    8,
          color:           value ? C.text : C.muted,
          fontSize:        12,
          fontWeight:      500,
          padding:         '8px 12px',
          cursor:          'pointer',
          fontFamily:      'inherit',
          boxShadow:       '0 1px 3px rgba(0,0,0,0.2)',
          transition:      'border-color 0.15s, background-color 0.15s',
          whiteSpace:      'nowrap',
          minWidth:        168,
        }}
      >
        <Calendar size={12} style={{ color: value ? C.primary : C.muted, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>
          {value ? formatDTDisplay(value) : placeholder}
        </span>
      </button>
      {panel}
    </>
  )
}

// ─── Inline editable time cell ────────────────────────────────────────────────

function TimeCell({ value, onSave }: { value: number; onSave: (minutes: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [draft,   setDraft]   = useState('')
  const [saving,  setSaving]  = useState(false)
  const inputRef              = useRef<HTMLInputElement>(null)

  function startEdit() {
    setDraft(String(value))
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  async function commit() {
    const minutes = Math.max(0, Math.round(Number(draft) || 0))
    setSaving(true)
    await onSave(minutes)
    setSaving(false)
    setEditing(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  commit()
    if (e.key === 'Escape') setEditing(false)
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
        disabled={saving}
        placeholder="mins"
        style={{
          width: 80, backgroundColor: C.bg, border: `1.5px solid ${C.primary}`,
          borderRadius: 5, color: C.text, fontSize: 12, padding: '3px 8px',
          outline: 'none', fontFamily: 'inherit',
        }}
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit (enter minutes)"
      className="editable-cell"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        color: value === 0 ? C.muted : C.text,
        fontSize: 13, cursor: 'text',
      }}
    >
      <span>{displayTime(value)}</span>
      <Pencil size={10} className="edit-hint" style={{ color: C.muted }} />
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const [rows,    setRows]    = useState<WorkloadRow[]>([])
  const [loading, setLoading] = useState(true)

  const [filterStatus,      setFilterStatus]      = useState('')
  const [filterStartAfter,  setFilterStartAfter]  = useState('')
  const [filterStartBefore, setFilterStartBefore] = useState('')

  // ── Fetch ────────────────────────────────────────────────────────────────
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

  // Extract date-only part for the API (start_date is a date column)
  function applyFilters() {
    load(
      filterStatus,
      filterStartAfter.split('T')[0]  ?? '',
      filterStartBefore.split('T')[0] ?? '',
    )
  }

  function clearFilters() {
    setFilterStatus('')
    setFilterStartAfter('')
    setFilterStartBefore('')
    load('', '', '')
  }

  const hasFilters = !!(filterStatus || filterStartAfter || filterStartBefore)

  // ── Save time ────────────────────────────────────────────────────────────
  async function saveTime(id: string, field: 'planned_time' | 'actual_time', minutes: number) {
    const res  = await fetch(`/api/workload-entries/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: minutes }),
    })
    const json = await res.json()
    if (json.success) setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: minutes } : r))
  }

  // ── Column headers ────────────────────────────────────────────────────────
  const COLS = [
    { label: 'ST ID',      width: 80        },
    { label: 'Task Name',  width: undefined  },
    { label: 'Status',     width: 128        },
    { label: 'Priority',   width: 100        },
    { label: 'Start Date', width: 110        },
    { label: 'Due Date',   width: 110        },
    { label: 'SP (min)',   width: 100        },
    { label: 'AP (min)',   width: 100        },
    { label: 'MT ID',      width: 80         },
  ]

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* Sticky header bar */}
      <div
        style={{
          height: 56, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 28px', backgroundColor: C.bg,
          position: 'sticky', top: 0, zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Clock size={16} style={{ color: C.primary }} />
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>Workload</h1>
          {!loading && (
            <span style={{ backgroundColor: 'rgba(123,104,238,0.12)', color: C.primary, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999 }}>
              {rows.length}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* Filter bar */}
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12,
            backgroundColor: C.surface, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '14px 18px', marginBottom: 16,
          }}
        >
          {/* Status */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Status
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                style={{
                  backgroundColor: filterStatus ? 'rgba(123,104,238,0.14)' : C.elevated,
                  border: `1px solid ${filterStatus ? C.primary : C.borderHover}`,
                  borderRadius: 8, color: filterStatus ? C.primary : C.secondary,
                  fontSize: 12, fontWeight: 500, padding: '8px 32px 8px 12px',
                  cursor: 'pointer', outline: 'none', fontFamily: 'inherit', appearance: 'none', minWidth: 148,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
              >
                <option value="" style={{ backgroundColor: C.elevated, color: C.text }}>All statuses</option>
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s} style={{ backgroundColor: C.elevated, color: C.text }}>
                    {STATUS_CONFIG[s].label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', color: filterStatus ? C.primary : C.muted, pointerEvents: 'none' }} />
            </div>
          </div>

          {/* Start after */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Start after
            </label>
            <DateTimePicker
              value={filterStartAfter}
              onChange={setFilterStartAfter}
              placeholder="Start after…"
            />
          </div>

          {/* Start before */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Start before
            </label>
            <DateTimePicker
              value={filterStartBefore}
              onChange={setFilterStartBefore}
              placeholder="Start before…"
            />
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <button
              onClick={applyFilters}
              style={{
                backgroundColor: C.primary, color: '#fff', border: 'none',
                borderRadius: 7, fontSize: 12, fontWeight: 500,
                padding: '7px 16px', cursor: 'pointer', fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.primaryHover)}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.primary)}
            >
              Apply
            </button>
            {hasFilters && (
              <button
                onClick={clearFilters}
                style={{
                  backgroundColor: 'transparent', border: `1px solid ${C.border}`,
                  borderRadius: 7, color: C.secondary, fontSize: 12,
                  padding: '7px 12px', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.borderHover; (e.currentTarget as HTMLButtonElement).style.color = C.text }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = C.border; (e.currentTarget as HTMLButtonElement).style.color = C.secondary }}
              >
                <X size={11} />
                Clear
              </button>
            )}
          </div>

          {!loading && (
            <span style={{ fontSize: 12, color: C.muted, marginLeft: 'auto', alignSelf: 'center' }}>
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {/* Table */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 13 }}>

              <colgroup>
                {COLS.map((col, i) => <col key={i} style={{ width: col.width ?? undefined }} />)}
              </colgroup>

              <thead>
                <tr style={{ backgroundColor: C.sidebar }}>
                  {COLS.map(col => (
                    <th
                      key={col.label}
                      style={{
                        padding: '0 14px', height: 34, textAlign: 'left',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: C.muted, whiteSpace: 'nowrap',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {COLS.map((_, j) => (
                        <td key={j} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
                          <div className="skeleton" style={{ height: 12, width: j === 1 ? 160 : 64, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ padding: '56px 24px', textAlign: 'center' }}>
                      <Search size={28} style={{ color: C.muted, margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>
                        No workload entries found
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                        {hasFilters ? 'Try adjusting the filters.' : 'Workload entries are created automatically when a subtask is set to In Progress.'}
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map(row => {
                    const st = STATUS_CONFIG[row.status]
                    const pr = PRIORITY_CONFIG[row.priority]

                    return (
                      <tr
                        key={row.id}
                        style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`, transition: 'background-color 0.08s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surfaceHover)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.surface)}
                      >
                        {/* ST ID */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.primary, backgroundColor: 'rgba(123,104,238,0.1)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {row.st_id}
                          </span>
                        </td>

                        {/* Task Name */}
                        <td style={{ padding: '0 14px', height: 40, color: C.text, fontWeight: 500, fontSize: 13 }}>
                          {row.st_name}
                        </td>

                        {/* Status badge */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: st.bg, color: st.text, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: st.dot, flexShrink: 0 }} />
                            {st.label}
                          </span>
                        </td>

                        {/* Priority flag */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: pr.color }}>
                            <Flag size={13} fill={pr.color} style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: 12, fontWeight: 500 }}>{pr.label}</span>
                          </span>
                        </td>

                        {/* Start Date */}
                        <td style={{ padding: '0 14px', height: 40, fontSize: 12, color: row.start_date ? C.secondary : C.muted, whiteSpace: 'nowrap' }}>
                          {row.start_date ?? '—'}
                        </td>

                        {/* Due Date */}
                        <td style={{ padding: '0 14px', height: 40, fontSize: 12, color: row.due_date ? C.secondary : C.muted, whiteSpace: 'nowrap' }}>
                          {row.due_date ?? '—'}
                        </td>

                        {/* SP — editable */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <TimeCell value={row.planned_time} onSave={m => saveTime(row.id, 'planned_time', m)} />
                        </td>

                        {/* AP — editable */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <TimeCell value={row.actual_time} onSave={m => saveTime(row.id, 'actual_time', m)} />
                        </td>

                        {/* MT ID */}
                        <td style={{ padding: '0 14px', height: 40 }}>
                          <span style={{ fontFamily: 'monospace', fontSize: 11, color: C.primary, backgroundColor: 'rgba(123,104,238,0.1)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {row.mt_id}
                          </span>
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
            <div style={{ borderTop: `1px solid ${C.border}`, padding: '8px 16px', backgroundColor: C.sidebar, color: C.muted, fontSize: 12 }}>
              {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
