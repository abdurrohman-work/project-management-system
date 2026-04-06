'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Clock, Search, X, ChevronDown, Flag, Pencil } from 'lucide-react'
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
  halted:      { dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(245,158,11,0.12)', label: 'Halted'      },
}

const PRIORITY_CONFIG: Record<TaskPriority, { color: string; label: string }> = {
  critical: { color: '#EF4444', label: 'Critical' },
  high:     { color: '#F59E0B', label: 'High'     },
  medium:   { color: '#3B82F6', label: 'Medium'   },
  low:      { color: '#6B7280', label: 'Low'      },
}

const ALL_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'halted']

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

  function applyFilters() { load(filterStatus, filterStartAfter, filterStartBefore) }

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
                  backgroundColor: filterStatus ? 'rgba(123,104,238,0.12)' : C.bg,
                  border: `1px solid ${filterStatus ? C.primary : C.border}`,
                  borderRadius: 7, color: filterStatus ? C.primary : C.secondary,
                  fontSize: 12, fontWeight: 500, padding: '7px 28px 7px 10px',
                  cursor: 'pointer', outline: 'none', fontFamily: 'inherit', appearance: 'none', minWidth: 140,
                }}
              >
                <option value="">All statuses</option>
                {ALL_STATUSES.map(s => (
                  <option key={s} value={s} style={{ backgroundColor: C.surface, color: C.text }}>
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
            <input
              type="date"
              value={filterStartAfter}
              onChange={e => setFilterStartAfter(e.target.value)}
              style={{
                backgroundColor: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 7, color: filterStartAfter ? C.text : C.muted,
                fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
              }}
            />
          </div>

          {/* Start before */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Start before
            </label>
            <input
              type="date"
              value={filterStartBefore}
              onChange={e => setFilterStartBefore(e.target.value)}
              style={{
                backgroundColor: C.bg, border: `1px solid ${C.border}`,
                borderRadius: 7, color: filterStartBefore ? C.text : C.muted,
                fontSize: 12, padding: '7px 10px', outline: 'none', fontFamily: 'inherit',
              }}
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
