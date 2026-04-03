'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { MainTask, MainTaskStatus, TaskPriority } from '@/types/database'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(minutes: number): string {
  if (minutes === 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

const STATUS_STYLES: Record<MainTaskStatus, string> = {
  backlog:     'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  blocked:     'bg-red-100 text-red-700',
  stopped:     'bg-orange-100 text-orange-700',
  done:        'bg-green-100 text-green-700',
}

const STATUS_LABELS: Record<MainTaskStatus, string> = {
  backlog:     'Backlog',
  in_progress: 'In Progress',
  blocked:     'Blocked',
  stopped:     'Stopped',
  done:        'Done',
}

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low:      'bg-gray-100 text-gray-600',
  medium:   'bg-blue-100 text-blue-600',
  high:     'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MainTaskStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${PRIORITY_STYLES[priority]}`}>
      {priority}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-gray-500">
        {pct.toFixed(0)}%
      </span>
    </div>
  )
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`mt-1 text-3xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
      <div className="mt-2 h-8 w-12 animate-pulse rounded bg-gray-200" />
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {[60, 28, 24, 36, 20, 28].map((w, i) => (
        <td key={i} className="px-4 py-3">
          <div
            className="h-4 animate-pulse rounded bg-gray-200"
            style={{ width: `${w}%` }}
          />
        </td>
      ))}
    </tr>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [tasks, setTasks] = useState<MainTask[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formPriority, setFormPriority] = useState<TaskPriority>('medium')
  const [formError, setFormError] = useState<string | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchTasks() {
      const { data, error } = await supabase
        .from('main_tasks')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) setTasks(data)
      setLoading(false)
    }
    fetchTasks()
  }, [])

  // ── Derived metrics ────────────────────────────────────────────────────────
  const total      = tasks.length
  const inProgress = tasks.filter((t) => t.status === 'in_progress').length
  const blocked    = tasks.filter((t) => t.status === 'blocked').length
  const done       = tasks.filter((t) => t.status === 'done').length

  // ── Create handler ─────────────────────────────────────────────────────────
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const name = formName.trim()
    if (!name) {
      setFormError('Name is required.')
      return
    }

    setSubmitting(true)

    const { data, error } = await supabase
      .from('main_tasks')
      .insert({
        name,
        status: 'backlog',
        priority: formPriority,
        category: formCategory.trim() || null,
      })
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setFormError(error.message)
      return
    }

    if (data) setTasks((prev) => [data, ...prev])

    setFormName('')
    setFormCategory('')
    setFormPriority('medium')
    setShowForm(false)
  }

  function handleCancel() {
    setFormName('')
    setFormCategory('')
    setFormPriority('medium')
    setFormError(null)
    setShowForm(false)
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">

      {/* ── Header ── */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <button
          onClick={() => { setShowForm((v) => !v); setFormError(null) }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          New Task
        </button>
      </div>

      {/* ── Metric cards ── */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
        ) : (
          <>
            <MetricCard label="Total Tasks"  value={total}      color="text-gray-900"  />
            <MetricCard label="In Progress"  value={inProgress} color="text-blue-600"  />
            <MetricCard label="Blocked"      value={blocked}    color="text-red-600"   />
            <MetricCard label="Done"         value={done}       color="text-green-600" />
          </>
        )}
      </div>

      {/* ── Inline create form ── */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
        >
          <h2 className="mb-4 text-sm font-semibold text-gray-700">New Task</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            {/* Name */}
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Task name"
                autoFocus
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Category */}
            <div className="sm:w-40">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Category
              </label>
              <input
                type="text"
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                placeholder="e.g. Frontend"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            {/* Priority */}
            <div className="sm:w-36">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Priority
              </label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:ring-offset-1"
              >
                Cancel
              </button>
            </div>
          </div>

          {formError && (
            <p className="mt-2 text-xs text-red-600">{formError}</p>
          )}
        </form>
      )}

      {/* ── Tasks table ── */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-gray-50">
                {['Name', 'Status', 'Priority', 'Progress', 'Time Spent', 'Category'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <p className="text-sm font-medium text-gray-500">No tasks yet</p>
                    <p className="mt-1 text-xs text-gray-400">
                      Click &ldquo;New Task&rdquo; to create your first epic.
                    </p>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-gray-50">
                    <td className="max-w-[260px] truncate px-4 py-3 text-sm font-medium text-gray-900">
                      {task.name}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <ProgressBar value={task.progress} />
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums text-gray-600">
                      {formatTime(task.time_spent)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {task.category ?? <span className="text-gray-300">—</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  )
}
