'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { BarChart2, Loader2, TrendingUp } from 'lucide-react'
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

// ─── Load category config ─────────────────────────────────────────────────────

const LOAD_CONFIG: Record<LoadCategory, { dot: string; textClass: string; bgClass: string; label: string }> = {
  balanced:        { dot: '#4ade80', textClass: 'text-[#4ade80]', bgClass: 'bg-[#052e16]',  label: 'Balanced'        },
  underperforming: { dot: '#fbbf24', textClass: 'text-[#fbbf24]', bgClass: 'bg-[#3b2f04]',  label: 'Underperforming' },
  underloaded:     { dot: '#9ca3af', textClass: 'text-[#9ca3af]', bgClass: 'bg-[#374151]',  label: 'Underloaded'     },
  overloaded:      { dot: '#f87171', textClass: 'text-[#f87171]', bgClass: 'bg-[#450a0a]',  label: 'Overloaded'      },
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPeriod(weekStart: string, weekEnd: string): string {
  const s    = new Date(weekStart + 'T00:00:00')
  const e    = new Date(weekEnd   + 'T00:00:00')
  const sMon = s.toLocaleDateString('en-US', { month: 'short' })
  const eMon = e.toLocaleDateString('en-US', { month: 'short' })
  const sDay = s.getDate()
  const eDay = e.getDate()
  if (sMon === eMon) return `${sMon} ${sDay}–${eDay}`
  return `${sMon} ${sDay} – ${eMon} ${eDay}`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function LoadLevelBadge({ category }: { category: LoadCategory }) {
  const cfg = LOAD_CONFIG[category]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.bgClass} ${cfg.textClass}`}>
      <span
        className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ backgroundColor: cfg.dot }}
      />
      {cfg.label}
    </span>
  )
}

function TableSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <tr key={i}>
          {Array.from({ length: 6 }).map((_, j) => (
            <td key={j} className="py-2.5 px-3 border-b border-[#2a3f52]">
              <div
                className="h-3 bg-[#1e2d3d] animate-pulse rounded"
                style={{ width: j === 1 ? 100 : 56 }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000)
    return () => clearTimeout(t)
  }, [onClose])

  return (
    <div className="fixed bottom-5 right-5 z-50 flex items-center gap-3 bg-[#1e2d3d] border border-[#2a3f52] text-white text-sm px-4 py-3 rounded-md shadow-xl">
      <TrendingUp size={15} className="text-[#3f9cfb] flex-shrink-0" />
      {message}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReportPage() {
  const [rows,       setRows]       = useState<ReportRow[]>([])
  const [loading,    setLoading]    = useState(true)
  const [generating, setGenerating] = useState(false)
  const [toast,      setToast]      = useState<string | null>(null)

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
    const res  = await fetch('/api/reports/generate', { method: 'POST' })
    const json = await res.json()
    if (json.success) {
      setRows(json.data as ReportRow[])
      setToast('Report generated successfully.')
    }
    setGenerating(false)
  }

  const chartData = rows.map(r => ({
    period:     formatPeriod(r.week_start, r.week_end),
    efficiency: r.efficiency,
    load:       r.load_level,
  }))

  const COLS = ['#', 'Period', 'Planned', 'Actual', 'Efficiency %', 'Load %', 'Load Level']

  return (
    <div className="min-h-screen bg-[#18232d]">

      {/* Sticky header */}
      <div className="sticky top-0 z-30 h-14 flex items-center justify-between px-7 border-b border-[#2a3f52] bg-[#18232d]">
        <div className="flex items-center gap-2.5">
          <BarChart2 size={16} className="text-[#3f9cfb]" />
          <h1 className="text-xl font-semibold text-white">Weekly Reports</h1>
          {!loading && rows.length > 0 && (
            <span className="bg-[#3f9cfb]/10 text-[#3f9cfb] text-xs font-medium px-2 py-0.5 rounded-full">
              {rows.length} report{rows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        <button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-[#3f9cfb] hover:bg-[#2d8ae8] text-white text-sm px-4 py-2 rounded-md flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150"
        >
          {generating ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <BarChart2 size={14} />
              Generate Report
            </>
          )}
        </button>
      </div>

      <div className="px-7 py-6">

        {/* Chart section */}
        {loading ? (
          <div className="bg-[#1e2d3d] border border-[#2a3f52] rounded-md p-4 mb-4">
            <div className="h-3 w-40 bg-[#2a3f52] animate-pulse rounded mb-3" />
            <div className="h-[280px] bg-[#1e2d3d] animate-pulse rounded-md" />
          </div>
        ) : rows.length > 0 ? (
          <div className="bg-[#1e2d3d] border border-[#2a3f52] rounded-md p-4 mb-4">
            <Chart data={chartData} />
          </div>
        ) : null}

        {/* Table section */}
        <div className="bg-[#1e2d3d] border border-[#2a3f52] rounded-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-sm">
              <thead>
                <tr className="bg-[#111b24] sticky top-0">
                  {COLS.map(label => (
                    <th
                      key={label}
                      className="py-2.5 px-3 text-left text-xs font-semibold uppercase tracking-wider text-white/50 border-b border-[#2a3f52] whitespace-nowrap"
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <TableSkeleton />
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={COLS.length} className="py-16 px-6 text-center">
                      <div className="flex flex-col items-center gap-3">
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 48 48"
                          fill="none"
                          className="text-white/20"
                        >
                          <rect x="6" y="10" width="36" height="28" rx="3" stroke="currentColor" strokeWidth="2" />
                          <path d="M6 18h36" stroke="currentColor" strokeWidth="2" />
                          <path d="M16 28h6M16 33h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                          <circle cx="34" cy="30" r="6" fill="#18232d" stroke="currentColor" strokeWidth="2" />
                          <path d="M34 28v2.5l1.5 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <p className="text-sm font-medium text-white/60">No reports generated yet.</p>
                        <button
                          onClick={handleGenerate}
                          disabled={generating}
                          className="bg-[#3f9cfb] hover:bg-[#2d8ae8] text-white text-sm px-4 py-2 rounded-md flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-150 mt-1"
                        >
                          {generating ? (
                            <>
                              <Loader2 size={13} className="animate-spin" />
                              Generating...
                            </>
                          ) : (
                            'Generate your first report'
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="bg-[#18232d] hover:bg-[#1e2d3d] border-b border-[#2a3f52] transition-colors duration-150"
                    >
                      {/* # */}
                      <td className="py-2.5 px-3 text-white/40 text-xs tabular-nums">
                        {idx + 1}
                      </td>

                      {/* Period */}
                      <td className="py-2.5 px-3 text-white font-medium whitespace-nowrap">
                        {formatPeriod(row.week_start, row.week_end)}
                      </td>

                      {/* Planned */}
                      <td className="py-2.5 px-3 text-white/60 tabular-nums">
                        {row.total_planned === 0 ? '—' : minutesToHours(row.total_planned)}
                      </td>

                      {/* Actual */}
                      <td className="py-2.5 px-3 text-white/60 tabular-nums">
                        {row.total_actual === 0 ? '—' : minutesToHours(row.total_actual)}
                      </td>

                      {/* Efficiency % */}
                      <td className="py-2.5 px-3 tabular-nums font-semibold">
                        <span
                          className={
                            row.efficiency >= 90
                              ? 'text-[#4ade80]'
                              : row.efficiency >= 70
                              ? 'text-[#3f9cfb]'
                              : 'text-[#f87171]'
                          }
                        >
                          {row.efficiency.toFixed(1)}%
                        </span>
                      </td>

                      {/* Load % */}
                      <td className="py-2.5 px-3 text-white/60 tabular-nums">
                        {row.load_level.toFixed(1)}%
                      </td>

                      {/* Load Level badge */}
                      <td className="py-2.5 px-3">
                        <LoadLevelBadge category={row.load_category} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* Toast notification */}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

    </div>
  )
}
