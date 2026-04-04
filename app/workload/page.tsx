'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  bg:      '#18232d',
  sidebar: '#111b24',
  surface: '#1e2d3d',
  border:  '#2a3f52',
  accent:  '#3f9cfb',
  text:    '#ffffff',
  muted:   'rgba(255,255,255,0.5)',
}

// ─── Badge maps ───────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<WorkloadStatus, { bg: string; color: string; label: string }> = {
  not_started: { bg: '#374151', color: '#9ca3af', label: 'Not Started' },
  in_progress: { bg: '#1e3a5f', color: '#3f9cfb', label: 'In Progress' },
  done:        { bg: '#052e16', color: '#4ade80', label: 'Done'        },
  halted:      { bg: '#431407', color: '#fb923c', label: 'Halted'      },
}

const PRIORITY_BADGE: Record<TaskPriority, { bg: string; color: string }> = {
  low:      { bg: '#374151', color: '#9ca3af' },
  medium:   { bg: '#1e3a5f', color: '#60a5fa' },
  high:     { bg: '#431407', color: '#fb923c' },
  critical: { bg: '#450a0a', color: '#f87171' },
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

function TimeCell({
  value,
  onSave,
}: {
  value: number
  onSave: (minutes: number) => Promise<void>
}) {
  const [editing, setEditing]   = useState(false)
  const [draft,   setDraft]     = useState('')
  const [saving,  setSaving]    = useState(false)
  const inputRef                = useRef<HTMLInputElement>(null)

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
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') setEditing(false)
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        min="0"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleKey}
        disabled={saving}
        style={{
          width: 72,
          backgroundColor: C.surface,
          border: `1px solid ${C.accent}`,
          borderRadius: 4,
          color: C.text,
          fontSize: 12,
          padding: '2px 6px',
          outline: 'none',
        }}
      />
    )
  }

  return (
    <span
      onClick={startEdit}
      title="Click to edit (enter minutes)"
      style={{
        cursor: 'pointer',
        color: value === 0 ? C.muted : C.text,
        fontSize: 13,
        padding: '2px 4px',
        borderRadius: 4,
        borderBottom: `1px dashed ${C.border}`,
        display: 'inline-block',
        minWidth: 40,
      }}
    >
      {displayTime(value)}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WorkloadPage() {
  const [rows,        setRows]        = useState<WorkloadRow[]>([])
  const [loading,     setLoading]     = useState(true)
  const [hoveredRow,  setHoveredRow]  = useState<string | null>(null)

  // Filter state
  const [filterStatus,      setFilterStatus]      = useState('')
  const [filterStartAfter,  setFilterStartAfter]  = useState('')
  const [filterStartBefore, setFilterStartBefore] = useState('')

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (status: string, startAfter: string, startBefore: string) => {
    setLoading(true)
    const qs = buildParams(status, startAfter, startBefore)
    const res = await fetch(`/api/workload-entries/list${qs}`)
    const json = await res.json()
    if (json.success) setRows(json.data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load(filterStatus, filterStartAfter, filterStartBefore)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applyFilters() {
    load(filterStatus, filterStartAfter, filterStartBefore)
  }

  function clearFilters() {
    setFilterStatus('')
    setFilterStartAfter('')
    setFilterStartBefore('')
    load('', '', '')
  }

  // ── Inline time save ───────────────────────────────────────────────────────
  async function saveTime(id: string, field: 'planned_time' | 'actual_time', minutes: number) {
    const res = await fetch(`/api/workload-entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: minutes }),
    })
    const json = await res.json()
    if (json.success) {
      setRows(prev =>
        prev.map(r => r.id === id ? { ...r, [field]: minutes } : r)
      )
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px', backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: '0 0 24px' }}>
        Workload
      </h1>

      {/* Filter bar */}
      <div style={{
        backgroundColor: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        padding: '12px 16px',
        marginBottom: 20,
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        alignItems: 'flex-end',
      }}>

        {/* Status filter */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Status
          </label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: filterStatus ? C.text : C.muted,
              fontSize: 13,
              padding: '5px 10px',
              outline: 'none',
              cursor: 'pointer',
              minWidth: 130,
            }}
          >
            <option value="">All statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_BADGE[s].label}</option>
            ))}
          </select>
        </div>

        {/* Start after */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Start after
          </label>
          <input
            type="date"
            value={filterStartAfter}
            onChange={(e) => setFilterStartAfter(e.target.value)}
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: filterStartAfter ? C.text : C.muted,
              fontSize: 13,
              padding: '5px 10px',
              outline: 'none',
              colorScheme: 'dark',
            }}
          />
        </div>

        {/* Start before */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Start before
          </label>
          <input
            type="date"
            value={filterStartBefore}
            onChange={(e) => setFilterStartBefore(e.target.value)}
            style={{
              backgroundColor: C.bg,
              border: `1px solid ${C.border}`,
              borderRadius: 6,
              color: filterStartBefore ? C.text : C.muted,
              fontSize: 13,
              padding: '5px 10px',
              outline: 'none',
              colorScheme: 'dark',
            }}
          />
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 8, paddingBottom: 1 }}>
          <button
            onClick={applyFilters}
            style={{
              backgroundColor: C.accent,
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              fontSize: 13,
              fontWeight: 500,
              padding: '6px 16px',
              cursor: 'pointer',
            }}
          >
            Apply
          </button>
          {(filterStatus || filterStartAfter || filterStartBefore) && (
            <button
              onClick={clearFilters}
              style={{
                backgroundColor: 'transparent',
                color: C.muted,
                border: `1px solid ${C.border}`,
                borderRadius: 6,
                fontSize: 13,
                padding: '6px 12px',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 900,
            borderCollapse: 'collapse',
            fontSize: 13,
          }}>
            {/* Header */}
            <thead>
              <tr style={{ backgroundColor: C.sidebar }}>
                {[
                  { label: 'ST ID',      width: 80  },
                  { label: 'Task Name',  width: undefined },
                  { label: 'Status',     width: 120 },
                  { label: 'Priority',   width: 90  },
                  { label: 'Start Date', width: 110 },
                  { label: 'Due Date',   width: 110 },
                  { label: 'SP (h)',     width: 90  },
                  { label: 'AP (h)',     width: 90  },
                  { label: 'MT ID',      width: 80  },
                ].map(({ label, width }) => (
                  <th
                    key={label}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: C.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
                      width: width ?? undefined,
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            {/* Body */}
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px 12px' }}>
                        <div style={{
                          height: 14,
                          width: j === 1 ? 160 : 60,
                          backgroundColor: C.surface,
                          borderRadius: 3,
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    style={{
                      padding: '48px 24px',
                      textAlign: 'center',
                      color: C.muted,
                      fontSize: 14,
                    }}
                  >
                    No workload entries found.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const st = STATUS_BADGE[row.status]
                  const pr = PRIORITY_BADGE[row.priority]
                  const isHovered = hoveredRow === row.id

                  return (
                    <tr
                      key={row.id}
                      style={{
                        borderTop: `1px solid ${C.border}`,
                        backgroundColor: isHovered ? C.surface : C.bg,
                        transition: 'background-color 0.1s',
                      }}
                      onMouseEnter={() => setHoveredRow(row.id)}
                      onMouseLeave={() => setHoveredRow(null)}
                    >
                      {/* ST ID */}
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.accent }}>
                          {row.st_id}
                        </span>
                      </td>

                      {/* Task Name */}
                      <td style={{ padding: '9px 12px', color: C.text }}>
                        {row.st_name}
                      </td>

                      {/* Status badge */}
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          backgroundColor: st.bg,
                          color: st.color,
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 99,
                          whiteSpace: 'nowrap',
                        }}>
                          {st.label}
                        </span>
                      </td>

                      {/* Priority badge */}
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          backgroundColor: pr.bg,
                          color: pr.color,
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 99,
                          textTransform: 'capitalize',
                        }}>
                          {row.priority}
                        </span>
                      </td>

                      {/* Start Date */}
                      <td style={{ padding: '9px 12px', color: row.start_date ? C.text : C.muted, whiteSpace: 'nowrap', fontSize: 12 }}>
                        {row.start_date ?? '—'}
                      </td>

                      {/* Due Date */}
                      <td style={{ padding: '9px 12px', color: row.due_date ? C.text : C.muted, whiteSpace: 'nowrap', fontSize: 12 }}>
                        {row.due_date ?? '—'}
                      </td>

                      {/* SP (h) — editable */}
                      <td style={{ padding: '9px 12px' }}>
                        <TimeCell
                          value={row.planned_time}
                          onSave={(minutes) => saveTime(row.id, 'planned_time', minutes)}
                        />
                      </td>

                      {/* AP (h) — editable */}
                      <td style={{ padding: '9px 12px' }}>
                        <TimeCell
                          value={row.actual_time}
                          onSave={(minutes) => saveTime(row.id, 'actual_time', minutes)}
                        />
                      </td>

                      {/* MT ID */}
                      <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                        <span style={{ fontFamily: 'monospace', fontSize: 12, color: C.accent }}>
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

        {/* Row count footer */}
        {!loading && rows.length > 0 && (
          <div style={{
            borderTop: `1px solid ${C.border}`,
            padding: '8px 12px',
            backgroundColor: C.sidebar,
            color: C.muted,
            fontSize: 12,
          }}>
            {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
          </div>
        )}
      </div>

      {/* Pulse keyframe for skeleton */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
