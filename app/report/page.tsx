'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { BarChart2, RefreshCw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { minutesToHours } from '@/lib/time'
import type { LoadCategory } from '@/types/database'

const Chart = dynamic(() => import('./_chart'), { ssr: false })

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportRow = {
  id:            string
  week_start:    string
  week_end:      string
  total_planned: number
  total_actual:  number
  efficiency:    number
  load_level:    number
  load_category: LoadCategory
  generated_at:  string
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           '#1A1D23',
  sidebar:      '#1E2028',
  surface:      '#2A2D35',
  surfaceHover: '#2E323A',
  elevated:     '#31353F',
  border:       '#363940',
  primary:      '#7B68EE',
  primaryHover: '#6C5CE7',
  text:         '#E2E4E9',
  secondary:    '#9BA0AB',
  muted:        '#6B7280',
}

// ─── Load category config ─────────────────────────────────────────────────────

const LOAD_CONFIG: Record<LoadCategory, { dot: string; text: string; bg: string; label: string }> = {
  balanced:       { dot: '#4ADE80', text: '#4ADE80', bg: 'rgba(74,222,128,0.12)',  label: 'Balanced'        },
  underperforming:{ dot: '#FBBF24', text: '#FBBF24', bg: 'rgba(251,191,36,0.12)', label: 'Underperforming' },
  underloaded:    { dot: '#9BA0AB', text: '#9BA0AB', bg: 'rgba(155,160,171,0.12)', label: 'Underloaded'     },
  overloaded:     { dot: '#F87171', text: '#F87171', bg: 'rgba(248,113,113,0.12)', label: 'Overloaded'      },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(weekStart: string, weekEnd: string): string {
  const s     = new Date(weekStart + 'T00:00:00')
  const e     = new Date(weekEnd   + 'T00:00:00')
  const sMon  = s.toLocaleDateString('en-US', { month: 'short' })
  const eMon  = e.toLocaleDateString('en-US', { month: 'short' })
  const sDay  = s.getDate()
  const eDay  = e.getDate()
  if (sMon === eMon) return `${sMon} ${sDay}–${eDay}`
  return `${sMon} ${sDay} – ${eMon} ${eDay}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [rows,       setRows]       = useState<ReportRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    supabase
      .from('workload_reports')
      .select('*')
      .order('week_start', { ascending: true })
      .then(({ data }) => {
        setRows((data as ReportRow[]) ?? [])
        setLoading(false)
      })
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    const res  = await fetch('/api/cron/workload-report', { method: 'POST' })
    const json = await res.json()
    if (json.success) setRows(json.data as ReportRow[])
    setGenerating(false)
  }

  const chartData = rows.map(r => ({
    period:     formatPeriod(r.week_start, r.week_end),
    efficiency: r.efficiency,
    load:       r.load_level,
  }))

  const COLS = ['#', 'Period', 'Total SP', 'Total AP', 'Efficiency', 'Load %', 'Load Level']

  return (
    <div style={{ backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* Sticky header bar */}
      <div
        style={{
          height: 56, borderBottom: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 28px', backgroundColor: C.bg,
          position: 'sticky', top: 0, zIndex: 30,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <BarChart2 size={16} style={{ color: C.primary }} />
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>Workload Report</h1>
          {!loading && rows.length > 0 && (
            <span style={{ backgroundColor: 'rgba(123,104,238,0.12)', color: C.primary, fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 9999 }}>
              {rows.length} reports
            </span>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            backgroundColor: generating ? C.elevated : C.primary,
            color: '#fff', border: 'none', borderRadius: 7,
            fontSize: 13, fontWeight: 500, padding: '7px 16px',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1, transition: 'background-color 0.12s',
            fontFamily: 'inherit',
          }}
          onMouseEnter={e => { if (!generating) (e.currentTarget.style.backgroundColor = C.primaryHover) }}
          onMouseLeave={e => { if (!generating) (e.currentTarget.style.backgroundColor = C.primary) }}
        >
          <RefreshCw size={13} style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }} />
          {generating ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      <div style={{ padding: '24px 28px' }}>

        {/* Table */}
        <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', backgroundColor: C.surface, marginBottom: 24 }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13 }}>

              <thead>
                <tr style={{ backgroundColor: C.sidebar }}>
                  {COLS.map(label => (
                    <th
                      key={label}
                      style={{
                        padding: '0 16px', height: 34, textAlign: 'left',
                        fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.06em', color: C.muted, whiteSpace: 'nowrap',
                        borderBottom: `1px solid ${C.border}`,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {COLS.map((_, j) => (
                        <td key={j} style={{ padding: '10px 16px', borderBottom: `1px solid ${C.border}` }}>
                          <div className="skeleton" style={{ height: 12, width: j === 1 ? 100 : 60, borderRadius: 4 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} style={{ padding: '56px 24px', textAlign: 'center' }}>
                      <BarChart2 size={28} style={{ color: C.muted, margin: '0 auto 12px', display: 'block' }} />
                      <p style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 500, color: C.secondary }}>
                        No report data yet
                      </p>
                      <p style={{ margin: 0, fontSize: 12, color: C.muted }}>
                        Click &ldquo;Generate Report&rdquo; to calculate from current workload entries.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => {
                    const badge = LOAD_CONFIG[row.load_category]

                    return (
                      <tr
                        key={row.id}
                        style={{ backgroundColor: C.surface, borderBottom: `1px solid ${C.border}`, transition: 'background-color 0.08s' }}
                        onMouseEnter={e => (e.currentTarget.style.backgroundColor = C.surfaceHover)}
                        onMouseLeave={e => (e.currentTarget.style.backgroundColor = C.surface)}
                      >
                        {/* # */}
                        <td style={{ padding: '0 16px', height: 40, color: C.muted, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                          {idx + 1}
                        </td>

                        {/* Period */}
                        <td style={{ padding: '0 16px', height: 40, color: C.text, whiteSpace: 'nowrap', fontWeight: 500 }}>
                          {formatPeriod(row.week_start, row.week_end)}
                        </td>

                        {/* Total SP */}
                        <td style={{ padding: '0 16px', height: 40, color: C.secondary, fontVariantNumeric: 'tabular-nums' }}>
                          {row.total_planned === 0 ? '—' : minutesToHours(row.total_planned)}
                        </td>

                        {/* Total AP */}
                        <td style={{ padding: '0 16px', height: 40, color: C.secondary, fontVariantNumeric: 'tabular-nums' }}>
                          {row.total_actual === 0 ? '—' : minutesToHours(row.total_actual)}
                        </td>

                        {/* Efficiency */}
                        <td style={{ padding: '0 16px', height: 40 }}>
                          <span
                            style={{
                              color: row.efficiency >= 90 ? '#4ADE80' : row.efficiency >= 70 ? '#60A5FA' : '#F87171',
                              fontWeight: 600, fontSize: 13, fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {row.efficiency.toFixed(1)}%
                          </span>
                        </td>

                        {/* Load % */}
                        <td style={{ padding: '0 16px', height: 40 }}>
                          <span style={{ color: C.secondary, fontVariantNumeric: 'tabular-nums' }}>
                            {row.load_level.toFixed(1)}%
                          </span>
                        </td>

                        {/* Load Level badge */}
                        <td style={{ padding: '0 16px', height: 40 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, backgroundColor: badge.bg, color: badge.text, fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 9999, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: badge.dot, flexShrink: 0 }} />
                            {badge.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Chart */}
        {!loading && rows.length > 0 && (
          <div
            style={{
              backgroundColor: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              padding: '20px 20px 12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <div style={{ width: 3, height: 16, backgroundColor: C.primary, borderRadius: 2 }} />
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>
                Efficiency vs Load
              </p>
              <span style={{ fontSize: 12, color: C.muted }}>— last {rows.length} report{rows.length !== 1 ? 's' : ''}</span>
            </div>
            <Chart data={chartData} />
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
