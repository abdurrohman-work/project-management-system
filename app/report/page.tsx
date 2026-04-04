'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { minutesToHours } from '@/lib/time'
import type { LoadCategory } from '@/types/database'

// Recharts uses browser APIs — load dynamically to avoid SSR issues
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
  bg:      '#18232d',
  sidebar: '#111b24',
  surface: '#1e2d3d',
  border:  '#2a3f52',
  accent:  '#3f9cfb',
  text:    '#ffffff',
  muted:   'rgba(255,255,255,0.5)',
}

// ─── Load category badge ──────────────────────────────────────────────────────

const LOAD_BADGE: Record<LoadCategory, { bg: string; color: string; label: string }> = {
  balanced:       { bg: '#052e16', color: '#4ade80', label: 'Balanced'       },
  underperforming:{ bg: '#422006', color: '#fbbf24', label: 'Underperforming' },
  underloaded:    { bg: '#374151', color: '#9ca3af', label: 'Underloaded'    },
  overloaded:     { bg: '#450a0a', color: '#f87171', label: 'Overloaded'     },
}

// ─── Period formatter ─────────────────────────────────────────────────────────

function formatPeriod(weekStart: string, weekEnd: string): string {
  const s = new Date(weekStart + 'T00:00:00')
  const e = new Date(weekEnd   + 'T00:00:00')
  const sMonth = s.toLocaleDateString('en-US', { month: 'short' })
  const eMonth = e.toLocaleDateString('en-US', { month: 'short' })
  const sDay   = s.getDate()
  const eDay   = e.getDate()
  if (sMonth === eMonth) return `${sMonth} ${sDay}–${eDay}`
  return `${sMonth} ${sDay} – ${eMonth} ${eDay}`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [rows,       setRows]       = useState<ReportRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [hoveredRow, setHoveredRow] = useState<string | null>(null)

  // ── Load existing rows ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('workload_reports')
        .select('*')
        .order('week_start', { ascending: true })
      setRows((data as ReportRow[]) ?? [])
      setLoading(false)
    }
    load()
  }, [])

  // ── Generate report ───────────────────────────────────────────────────────
  async function handleGenerate() {
    setGenerating(true)
    const res  = await fetch('/api/reports/generate', { method: 'POST' })
    const json = await res.json()
    if (json.success) setRows(json.data as ReportRow[])
    setGenerating(false)
  }

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = rows.map((r) => ({
    period:     formatPeriod(r.week_start, r.week_end),
    efficiency: r.efficiency,
    load:       r.load_level,
  }))

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '32px', backgroundColor: C.bg, minHeight: '100vh' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Workload Report
        </h1>
        <button
          onClick={handleGenerate}
          disabled={generating}
          style={{
            backgroundColor: generating ? C.surface : C.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            padding: '8px 18px',
            cursor: generating ? 'not-allowed' : 'pointer',
            opacity: generating ? 0.7 : 1,
            transition: 'opacity 0.15s',
          }}
        >
          {generating ? 'Generating…' : 'Generate Report'}
        </button>
      </div>

      {/* Table */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        overflow: 'hidden',
        marginBottom: 28,
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            minWidth: 700,
            borderCollapse: 'collapse',
            fontSize: 13,
          }}>
            <thead>
              <tr style={{ backgroundColor: C.sidebar }}>
                {['#', 'Period', 'Total SP (h)', 'Total AP (h)', 'Efficiency %', 'Load %', 'Load Level'].map((label) => (
                  <th
                    key={label}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      fontSize: 11,
                      fontWeight: 500,
                      color: C.muted,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      whiteSpace: 'nowrap',
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
                  <tr key={i} style={{ borderTop: `1px solid ${C.border}` }}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} style={{ padding: '10px 14px' }}>
                        <div style={{
                          height: 14,
                          width: j === 1 ? 100 : 60,
                          backgroundColor: C.surface,
                          borderRadius: 3,
                        }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    color: C.muted,
                    fontSize: 14,
                  }}>
                    No report data yet. Click &ldquo;Generate Report&rdquo; to calculate.
                  </td>
                </tr>
              ) : (
                rows.map((row, idx) => {
                  const badge    = LOAD_BADGE[row.load_category]
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
                      {/* # */}
                      <td style={{ padding: '9px 14px', color: C.muted, fontSize: 12 }}>
                        {idx + 1}
                      </td>

                      {/* Period */}
                      <td style={{ padding: '9px 14px', color: C.text, whiteSpace: 'nowrap' }}>
                        {formatPeriod(row.week_start, row.week_end)}
                      </td>

                      {/* Total SP */}
                      <td style={{ padding: '9px 14px', color: C.text }}>
                        {row.total_planned === 0 ? '—' : minutesToHours(row.total_planned)}
                      </td>

                      {/* Total AP */}
                      <td style={{ padding: '9px 14px', color: C.text }}>
                        {row.total_actual === 0 ? '—' : minutesToHours(row.total_actual)}
                      </td>

                      {/* Efficiency % */}
                      <td style={{ padding: '9px 14px', color: C.accent, fontWeight: 500 }}>
                        {row.efficiency.toFixed(2)}%
                      </td>

                      {/* Load % */}
                      <td style={{ padding: '9px 14px', color: '#f87171', fontWeight: 500 }}>
                        {row.load_level.toFixed(2)}%
                      </td>

                      {/* Load Level badge */}
                      <td style={{ padding: '9px 14px' }}>
                        <span style={{
                          backgroundColor: badge.bg,
                          color: badge.color,
                          fontSize: 11,
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 99,
                          whiteSpace: 'nowrap',
                        }}>
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
        <div style={{
          backgroundColor: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 8,
          padding: '20px 16px 8px',
        }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, color: C.muted, fontWeight: 500 }}>
            Efficiency vs Load — last 12 weeks
          </p>
          <Chart data={chartData} />
        </div>
      )}
    </div>
  )
}
