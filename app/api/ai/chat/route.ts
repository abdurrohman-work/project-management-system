import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import {
  onMainTaskStatusChanged,
  onSprintTaskCreated,
  onSprintTaskPatched,
  onWorkloadEntryChanged,
} from '@/lib/cascade'
import { recalculateAll } from '@/lib/calculations'
import type { TaskPriority, MainTaskStatus, SprintTaskStatus, WorkloadStatus } from '@/types/database'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? '' })

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  'Platform Management',
  'Course Management',
  'IT Operations',
  'Administrative / Office',
  'Finance & Billing',
  'Technical Support',
  'Data & Analytics',
  'Telephony/CRM',
  'Others',
] as const

const VALID_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical']
const VALID_MAIN_STATUSES: MainTaskStatus[] = ['backlog', 'in_progress', 'blocked', 'stopped', 'done']
const VALID_SPRINT_STATUSES: SprintTaskStatus[] = [
  'not_started', 'in_progress', 'done', 'partly_completed', 'blocked', 'stopped',
]
const VALID_WORKLOAD_STATUSES: WorkloadStatus[] = ['not_started', 'in_progress', 'done', 'stopped', 'blocked']

// ─── Request / Response types ─────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface TaskContext {
  id: string
  display_id: string
  name: string
  status: string
  priority: string
}

interface RequestContext {
  page: 'dashboard' | 'sprints' | 'workload' | 'report'
  sprint: { id: string; name: string } | null
  tasks: TaskContext[]
}

interface ChatRequestBody {
  messages: ChatMessage[]
  context: RequestContext
}

interface ActionPayload {
  action: string
  data: Record<string, unknown>
}

// ─── System Prompt Builder ────────────────────────────────────────────────────

function buildSystemPrompt(
  context: RequestContext,
  tasksJson: string,
  taskCount: number,
): string {
  const sprintName   = context.sprint?.name ?? 'none'
  const currentPage  = context.page ?? 'dashboard'

  return `You are an intelligent AI agent for Mohir.dev's internal project management system.
Your job: help team members manage tasks through natural conversation.

LANGUAGE RULE:
Detect user language. Respond in the SAME language always.
- Uzbek detected → respond Uzbek
- Russian detected → respond Russian
- English detected → respond English
Default (first message): Uzbek

CURRENT CONTEXT:
Page: ${currentPage} | Tasks: ${taskCount} | Active sprint: ${sprintName}
All tasks: ${tasksJson}

CAPABILITIES:
You are NOT limited to the current page. Navigate mentally across all pages.
If user describes a task on Dashboard, sprint tasks on Sprint, time on Workload — handle all.

Actions you can perform:
- CREATE_TASK — create a main task (epic)
- UPDATE_TASK — update any field on an existing task by ID or name
- DELETE_TASK — delete a main task and all its subtasks (requires confirmed: true)
- CREATE_SUBTASK — create one or multiple sprint tasks under a main task in the active sprint
- UPDATE_SUBTASK — update any field on a sprint task
- DELETE_SUBTASK — delete a sprint task (requires confirmed: true)
- CHANGE_STATUS — change status of a main task or sprint task
- ASSIGN_TASK — set task_owner on a main task
- SET_DEADLINE — set or update deadline on a main task
- UPDATE_WORKLOAD — update planned time, actual time, dates, or status on a workload entry (lookup by sprint_task_id)
- QUERY_TASKS — answer questions about existing tasks from context data

THINKING RULES:
1. Read what the user says carefully. Extract ALL information they give.
2. Identify which fields are already provided vs which are missing.
3. Fill in what you know. Ask ONLY about what is genuinely unclear.
4. Ask ONE question at a time. Never ask multiple questions at once.
5. If the user's intent is clear enough, proceed without asking everything.

REQUIRED FIELDS:
- CREATE_TASK: name is the only required field. Ask if missing.
- CREATE_SUBTASK: name + main task reference are required.
- UPDATE_TASK / UPDATE_SUBTASK: task ID or name + what to change.

OPTIONAL FIELDS — gather naturally through conversation:
- category, priority, task_owner, deadline, note, blocked_by

CATEGORY VALUES (exact):
Platform Management | Course Management | IT Operations | Administrative / Office | Finance & Billing | Technical Support | Data & Analytics | Telephony/CRM | Others

PRIORITY VALUES: low | medium | high | critical (default: medium)

STATUS VALUES:
- main_task: backlog | in_progress | blocked | stopped | done
- sprint_task: not_started | in_progress | done | partly_completed | blocked | stopped
- workload: not_started | in_progress | done | stopped | blocked

CONFIRMATION RULE:
Before executing ANY action, show a clear summary and ask for confirmation:
- Uzbek: "Tasdiqlaysizmi?"
- Russian: "Подтверждаете?"
- English: "Confirm?"

Accepted confirmations: ha / yes / да / ok / ✓ / confirm / tasdiqlash / tasdiqlandi

ACTION JSON RULE:
After user confirms, output ONE JSON block at the END of your response. Nothing after it.
Format: {"action": "ACTION_NAME", "data": {...}}
Never emit two action blocks in one response.
Never emit action JSON before confirmation.

AFTER ACTION:
Report what was done. Offer logical next step in same language.

QUERY BEHAVIOR:
For QUERY_TASKS, read from tasksJson context. Answer directly.
If task not found in context, say so honestly. Do not invent data.`
}

// ─── Action JSON extraction ───────────────────────────────────────────────────

/**
 * Finds the index of the first JSON action block in the text.
 * Searches for `{"action"` or `{ "action"` (with optional whitespace).
 * Returns -1 if not found.
 */
function findActionStart(text: string): number {
  // Possible opening patterns the model might emit
  const patterns = ['{"action"', '{ "action"', '{\n"action"', '{\n  "action"']
  let min = -1
  for (const p of patterns) {
    const idx = text.indexOf(p)
    if (idx !== -1 && (min === -1 || idx < min)) min = idx
  }
  return min
}

/**
 * Walk the string from `start` to find the matching closing `}` at depth 0.
 * Returns the exclusive end index (i.e., position after the `}`), or -1.
 */
function findJsonEnd(text: string, start: number): number {
  let depth = 0
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++
    else if (text[i] === '}') {
      depth--
      if (depth === 0) return i + 1
    }
  }
  return -1
}

/**
 * Parses the FIRST valid JSON action block from the model's reply.
 * Robust against models emitting multiple consecutive `{"action":...}` blocks.
 */
function extractActionJSON(text: string): ActionPayload | null {
  const start = findActionStart(text)
  if (start === -1) return null

  const end = findJsonEnd(text, start)
  if (end === -1) return null

  try {
    const parsed = JSON.parse(text.slice(start, end)) as Record<string, unknown>
    if (
      typeof parsed.action === 'string' &&
      parsed.action.length > 0 &&
      typeof parsed.data === 'object' &&
      parsed.data !== null
    ) {
      return { action: parsed.action, data: parsed.data as Record<string, unknown> }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Removes everything from the first JSON action block onwards so the user
 * only sees the conversational part of the reply.
 */
function stripActionJSON(text: string): string {
  const start = findActionStart(text)
  if (start === -1) return text.trim()
  return text.slice(0, start).trim()
}

// ─── Action Execution ─────────────────────────────────────────────────────────

async function executeAction(
  action: string,
  data: Record<string, unknown>,
  supabase: ReturnType<typeof createServerClient>,
): Promise<{ action_result: unknown; error?: string }> {
  switch (action) {

    // ── CREATE_TASK ──────────────────────────────────────────────────────────
    case 'CREATE_TASK': {
      const name = typeof data.name === 'string' ? data.name.trim() : ''
      if (!name) return { action_result: null, error: 'CREATE_TASK requires a task name.' }

      const category = CATEGORIES.includes(data.category as typeof CATEGORIES[number])
        ? (data.category as string)
        : null

      const priority: TaskPriority = VALID_PRIORITIES.includes(data.priority as TaskPriority)
        ? (data.priority as TaskPriority)
        : 'medium'

      const task_owner = typeof data.task_owner === 'string' && data.task_owner.trim()
        ? data.task_owner.trim()
        : null

      const deadline = typeof data.deadline === 'string' && data.deadline.trim()
        ? data.deadline.trim()
        : null

      const { data: created, error } = await supabase
        .from('main_tasks')
        .insert({ name, category, priority, task_owner, deadline })
        .select()
        .single()

      if (error) {
        console.error('[chat/route] CREATE_TASK Supabase error:', error)
        return { action_result: null, error: error.message }
      }
      return { action_result: created }
    }

    // ── UPDATE_TASK ──────────────────────────────────────────────────────────
    case 'UPDATE_TASK': {
      // Build the update payload — only include recognised fields
      const updates: Record<string, unknown> = {}

      if (typeof data.name === 'string' && data.name.trim()) updates.name = data.name.trim()
      if (typeof data.category === 'string') {
        updates.category = CATEGORIES.includes(data.category as typeof CATEGORIES[number])
          ? data.category
          : null
      }
      if (typeof data.priority === 'string') {
        if (VALID_PRIORITIES.includes(data.priority as TaskPriority)) updates.priority = data.priority
      }
      if (typeof data.task_owner === 'string') updates.task_owner = data.task_owner.trim() || null
      if (typeof data.deadline === 'string') updates.deadline = data.deadline || null
      if (typeof data.status === 'string') {
        if (VALID_MAIN_STATUSES.includes(data.status as MainTaskStatus)) updates.status = data.status
      }
      if (typeof data.note === 'string') updates.note = data.note

      if (Object.keys(updates).length === 0) {
        return { action_result: null, error: 'UPDATE_TASK: no valid fields to update.' }
      }

      // Helper: update by resolved UUID
      const doUpdate = async (uuid: string) => {
        let prevStatus: MainTaskStatus | undefined
        if (typeof updates.status === 'string') {
          const { data: current } = await supabase
            .from('main_tasks').select('status').eq('id', uuid).single()
          prevStatus = current?.status as MainTaskStatus | undefined
        }

        const { data: updated, error } = await supabase
          .from('main_tasks').update(updates).eq('id', uuid).select().single()
        if (error) {
          console.error('[chat/route] UPDATE_TASK error:', error)
          return { action_result: null, error: error.message }
        }

        if (
          typeof updates.status === 'string' &&
          prevStatus !== undefined &&
          updates.status !== prevStatus
        ) {
          try {
            await onMainTaskStatusChanged(
              uuid,
              updates.status as MainTaskStatus,
              prevStatus,
              supabase,
            )
          } catch (cascadeErr) {
            console.error('[chat/route] UPDATE_TASK cascade error:', cascadeErr)
          }
        }

        return { action_result: updated }
      }

      // By UUID
      if (typeof data.id === 'string' && data.id.trim()) return doUpdate(data.id.trim())

      // By display_id (e.g. MT-013)
      if (typeof data.display_id === 'string' && data.display_id.trim()) {
        const { data: found, error } = await supabase
          .from('main_tasks').select('id').ilike('display_id', data.display_id.trim()).limit(1).single()
        if (error || !found) return { action_result: null, error: `No task found with display_id "${data.display_id}".` }
        return doUpdate(found.id)
      }

      // By name fuzzy
      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        const { data: found, error } = await supabase
          .from('main_tasks').select('id').ilike('name', `%${data.name_query.trim()}%`).limit(1).single()
        if (error || !found) return { action_result: null, error: `No task found matching "${data.name_query}".` }
        return doUpdate(found.id)
      }

      return { action_result: null, error: 'UPDATE_TASK requires "id", "display_id", or "name_query".' }
    }

    // ── CREATE_SUBTASK ───────────────────────────────────────────────────────
    case 'CREATE_SUBTASK': {
      const main_task_id = typeof data.main_task_id === 'string' ? data.main_task_id.trim() : ''
      if (!main_task_id) return { action_result: null, error: 'CREATE_SUBTASK requires main_task_id.' }

      // Fetch the currently active sprint (shared for both paths)
      const { data: activeSprint, error: sprintError } = await supabase
        .from('sprints')
        .select('*')
        .eq('status', 'active')
        .limit(1)
        .single()

      if (sprintError || !activeSprint) {
        console.error('[chat/route] CREATE_SUBTASK: no active sprint found:', sprintError)
        return { action_result: null, error: 'No active sprint found. Cannot create sprint task.' }
      }

      // ── Bulk path: data.tasks is an array ──────────────────────────────────
      if (Array.isArray(data.tasks) && data.tasks.length > 0) {
        const results: unknown[] = []
        for (const item of data.tasks) {
          const taskName = typeof item === 'object' && item !== null && typeof (item as Record<string, unknown>).name === 'string'
            ? ((item as Record<string, unknown>).name as string).trim()
            : ''
          if (!taskName) continue

          const taskPriority: TaskPriority = VALID_PRIORITIES.includes(
            (item as Record<string, unknown>).priority as TaskPriority,
          )
            ? ((item as Record<string, unknown>).priority as TaskPriority)
            : 'medium'

          const { data: created, error } = await supabase
            .from('sprint_tasks')
            .insert({
              main_task_id,
              sprint_id: activeSprint.id,
              name: taskName,
              priority: taskPriority,
              status: 'not_started',
            })
            .select()
            .single()

          if (error) {
            console.error('[chat/route] CREATE_SUBTASK (bulk) Supabase error:', error)
            continue
          }

          try {
            await onSprintTaskCreated(created.id, main_task_id, supabase)
          } catch (cascadeErr) {
            console.error('[chat/route] CREATE_SUBTASK (bulk) cascade error:', cascadeErr)
          }

          results.push(created)
        }
        return { action_result: results }
      }

      // ── Single path: data.name present ────────────────────────────────────
      const name = typeof data.name === 'string' ? data.name.trim() : ''
      if (!name) return { action_result: null, error: 'CREATE_SUBTASK requires a name or a tasks array.' }

      const priority: TaskPriority = VALID_PRIORITIES.includes(data.priority as TaskPriority)
        ? (data.priority as TaskPriority)
        : 'medium'

      const { data: created, error } = await supabase
        .from('sprint_tasks')
        .insert({
          main_task_id,
          sprint_id: activeSprint.id,
          name,
          priority,
          status: 'not_started',
        })
        .select()
        .single()

      if (error) {
        console.error('[chat/route] CREATE_SUBTASK Supabase error:', error)
        return { action_result: null, error: error.message }
      }

      try {
        await onSprintTaskCreated(created.id, main_task_id, supabase)
      } catch (cascadeErr) {
        console.error('[chat/route] CREATE_SUBTASK cascade error:', cascadeErr)
      }

      return { action_result: created }
    }

    // ── CHANGE_STATUS ────────────────────────────────────────────────────────
    case 'CHANGE_STATUS': {
      const type = typeof data.type === 'string' ? data.type : 'main'
      const status = typeof data.status === 'string' ? data.status : ''

      if (!status) return { action_result: null, error: 'CHANGE_STATUS requires a status.' }

      const rawId         = typeof data.id         === 'string' ? data.id.trim()         : ''
      const rawDisplayId  = typeof data.display_id === 'string' ? data.display_id.trim() : ''
      const rawNameQuery  = typeof data.name_query === 'string' ? data.name_query.trim() : ''

      // Resolve UUID by id → display_id → name_query, mirroring UPDATE_TASK lookup.
      const resolveId = async (
        table: 'main_tasks' | 'sprint_tasks'
      ): Promise<{ uuid: string } | { error: string }> => {
        if (rawId) return { uuid: rawId }

        if (rawDisplayId) {
          const { data: found, error } = await supabase
            .from(table).select('id').ilike('display_id', rawDisplayId).limit(1).single()
          if (error || !found) {
            return { error: `No ${table === 'main_tasks' ? 'main task' : 'sprint task'} found with display_id "${rawDisplayId}".` }
          }
          return { uuid: found.id }
        }

        if (rawNameQuery) {
          const { data: found, error } = await supabase
            .from(table).select('id').ilike('name', `%${rawNameQuery}%`).limit(1).single()
          if (error || !found) {
            return { error: `No ${table === 'main_tasks' ? 'main task' : 'sprint task'} found matching "${rawNameQuery}".` }
          }
          return { uuid: found.id }
        }

        return { error: 'CHANGE_STATUS requires "id", "display_id", or "name_query".' }
      }

      if (type === 'sprint') {
        if (!VALID_SPRINT_STATUSES.includes(status as SprintTaskStatus)) {
          return { action_result: null, error: `Invalid sprint task status: "${status}".` }
        }

        const resolved = await resolveId('sprint_tasks')
        if ('error' in resolved) return { action_result: null, error: resolved.error }
        const id = resolved.uuid

        const { data: existing, error: fetchErr } = await supabase
          .from('sprint_tasks')
          .select('main_task_id')
          .eq('id', id)
          .single()
        if (fetchErr || !existing) {
          return { action_result: null, error: `Sprint task not found: "${id}".` }
        }

        const { data: updated, error } = await supabase
          .from('sprint_tasks')
          .update({ status: status as SprintTaskStatus })
          .eq('id', id)
          .select()
          .single()

        if (error) {
          console.error('[chat/route] CHANGE_STATUS (sprint) Supabase error:', error)
          return { action_result: null, error: error.message }
        }

        try {
          await onSprintTaskPatched(
            id,
            status as SprintTaskStatus,
            existing.main_task_id as string,
            supabase,
          )
        } catch (cascadeErr) {
          console.error('[chat/route] CHANGE_STATUS (sprint) cascade error:', cascadeErr)
        }

        return { action_result: updated }
      }

      // Default: main task
      if (!VALID_MAIN_STATUSES.includes(status as MainTaskStatus)) {
        return { action_result: null, error: `Invalid main task status: "${status}".` }
      }

      const resolved = await resolveId('main_tasks')
      if ('error' in resolved) return { action_result: null, error: resolved.error }
      const id = resolved.uuid

      const { data: prev, error: prevErr } = await supabase
        .from('main_tasks')
        .select('status')
        .eq('id', id)
        .single()
      if (prevErr || !prev) {
        return { action_result: null, error: `Main task not found: "${id}".` }
      }
      const prevStatus = prev.status as MainTaskStatus

      const { data: updated, error } = await supabase
        .from('main_tasks')
        .update({ status: status as MainTaskStatus })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[chat/route] CHANGE_STATUS (main) Supabase error:', error)
        return { action_result: null, error: error.message }
      }

      if (status !== prevStatus) {
        try {
          await onMainTaskStatusChanged(
            id,
            status as MainTaskStatus,
            prevStatus,
            supabase,
          )
        } catch (cascadeErr) {
          console.error('[chat/route] CHANGE_STATUS (main) cascade error:', cascadeErr)
        }
      }

      return { action_result: updated }
    }

    // ── ASSIGN_TASK ──────────────────────────────────────────────────────────
    case 'ASSIGN_TASK': {
      const id = typeof data.id === 'string' ? data.id.trim() : ''
      const task_owner = typeof data.task_owner === 'string' ? data.task_owner.trim() : ''

      if (!id) return { action_result: null, error: 'ASSIGN_TASK requires an id.' }
      if (!task_owner) return { action_result: null, error: 'ASSIGN_TASK requires a task_owner.' }

      const { data: updated, error } = await supabase
        .from('main_tasks')
        .update({ task_owner })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[chat/route] ASSIGN_TASK Supabase error:', error)
        return { action_result: null, error: error.message }
      }
      return { action_result: updated }
    }

    // ── SET_DEADLINE ─────────────────────────────────────────────────────────
    case 'SET_DEADLINE': {
      const id = typeof data.id === 'string' ? data.id.trim() : ''
      const deadline = typeof data.deadline === 'string' ? data.deadline.trim() : ''

      if (!id) return { action_result: null, error: 'SET_DEADLINE requires an id.' }
      if (!deadline) return { action_result: null, error: 'SET_DEADLINE requires a deadline (ISO string).' }

      const { data: updated, error } = await supabase
        .from('main_tasks')
        .update({ deadline })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[chat/route] SET_DEADLINE Supabase error:', error)
        return { action_result: null, error: error.message }
      }
      return { action_result: updated }
    }

    // ── UPDATE_SUBTASK ───────────────────────────────────────────────────────
    case 'UPDATE_SUBTASK': {
      const updates: Record<string, unknown> = {}

      if (typeof data.name === 'string' && data.name.trim()) updates.name = data.name.trim()
      if (typeof data.priority === 'string') {
        if (VALID_PRIORITIES.includes(data.priority as TaskPriority)) updates.priority = data.priority
      }
      if (typeof data.status === 'string') {
        if (VALID_SPRINT_STATUSES.includes(data.status as SprintTaskStatus)) updates.status = data.status
      }
      if (typeof data.note === 'string') updates.note = data.note
      if (typeof data.task_owner === 'string') updates.task_owner = data.task_owner.trim() || null

      if (Object.keys(updates).length === 0) {
        return { action_result: null, error: 'UPDATE_SUBTASK: no valid fields to update.' }
      }

      const doUpdateSubtask = async (uuid: string) => {
        const { data: existing, error: fetchErr } = await supabase
          .from('sprint_tasks')
          .select('main_task_id')
          .eq('id', uuid)
          .single()
        if (fetchErr || !existing) {
          return { action_result: null, error: `Sprint task not found: "${uuid}".` }
        }

        const { data: updated, error } = await supabase
          .from('sprint_tasks')
          .update(updates)
          .eq('id', uuid)
          .select()
          .single()

        if (error) {
          console.error('[chat/route] UPDATE_SUBTASK error:', error)
          return { action_result: null, error: error.message }
        }

        try {
          const newStatus = typeof updates.status === 'string'
            ? (updates.status as SprintTaskStatus)
            : undefined
          await onSprintTaskPatched(
            uuid,
            newStatus,
            existing.main_task_id as string,
            supabase,
          )
        } catch (cascadeErr) {
          console.error('[chat/route] UPDATE_SUBTASK cascade error:', cascadeErr)
        }

        return { action_result: updated }
      }

      if (typeof data.id === 'string' && data.id.trim()) {
        return doUpdateSubtask(data.id.trim())
      }

      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        const { data: found, error: findError } = await supabase
          .from('sprint_tasks')
          .select('id')
          .ilike('name', `%${data.name_query.trim()}%`)
          .limit(1)
          .single()

        if (findError || !found) {
          return { action_result: null, error: `No sprint task found matching "${data.name_query}".` }
        }

        return doUpdateSubtask(found.id)
      }

      return { action_result: null, error: 'UPDATE_SUBTASK requires either "id" or "name_query".' }
    }

    // ── DELETE_TASK ──────────────────────────────────────────────────────────
    case 'DELETE_TASK': {
      // Require explicit confirmation in the action payload before destructive op.
      if (data.confirmed !== true) {
        return {
          action_result: null,
          error: 'DELETE_TASK requires "confirmed": true in the action payload.',
        }
      }

      // Helper: delete by resolved UUID
      const doDelete = async (uuid: string, name: string, display_id: string) => {
        const { error } = await supabase.from('main_tasks').delete().eq('id', uuid)
        if (error) {
          console.error('[chat/route] DELETE_TASK error:', error)
          return { action_result: null, error: error.message }
        }
        return { action_result: { deleted: true, id: uuid, name, display_id } }
      }

      // By UUID
      if (typeof data.id === 'string' && data.id.trim()) {
        return doDelete(data.id.trim(), String(data.name ?? ''), String(data.display_id ?? ''))
      }

      // By display_id (e.g. MT-013)
      if (typeof data.display_id === 'string' && data.display_id.trim()) {
        const { data: found, error } = await supabase
          .from('main_tasks')
          .select('id, name, display_id')
          .ilike('display_id', data.display_id.trim())
          .limit(1)
          .single()
        if (error || !found) return { action_result: null, error: `No task found with display_id "${data.display_id}".` }
        return doDelete(found.id, found.name, found.display_id)
      }

      // By name fuzzy
      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        const { data: found, error } = await supabase
          .from('main_tasks')
          .select('id, name, display_id')
          .ilike('name', `%${data.name_query.trim()}%`)
          .limit(1)
          .single()
        if (error || !found) return { action_result: null, error: `No task found matching "${data.name_query}".` }
        return doDelete(found.id, found.name, found.display_id)
      }

      return { action_result: null, error: 'DELETE_TASK requires "id", "display_id", or "name_query".' }
    }

    // ── DELETE_SUBTASK ───────────────────────────────────────────────────────
    case 'DELETE_SUBTASK': {
      if (data.confirmed !== true) {
        return {
          action_result: null,
          error: 'DELETE_SUBTASK requires "confirmed": true in the action payload.',
        }
      }

      const doDeleteSubtask = async (uuid: string, name: string, display_id: string) => {
        // Fetch main_task_id before deletion for cascade recalculation
        const { data: existing, error: fetchErr } = await supabase
          .from('sprint_tasks')
          .select('main_task_id')
          .eq('id', uuid)
          .single()
        if (fetchErr || !existing) {
          return { action_result: null, error: `Sprint task not found: "${uuid}".` }
        }
        const main_task_id = existing.main_task_id as string

        const { error } = await supabase.from('sprint_tasks').delete().eq('id', uuid)
        if (error) {
          console.error('[chat/route] DELETE_SUBTASK error:', error)
          return { action_result: null, error: error.message }
        }

        try {
          await recalculateAll(main_task_id, supabase)
        } catch (calcErr) {
          console.error('[chat/route] DELETE_SUBTASK recalculate error:', calcErr)
        }

        return { action_result: { deleted: true, id: uuid, name, display_id } }
      }

      // By UUID
      if (typeof data.id === 'string' && data.id.trim()) {
        return doDeleteSubtask(data.id.trim(), String(data.name ?? ''), String(data.display_id ?? ''))
      }

      // By display_id (e.g. ST-012)
      if (typeof data.display_id === 'string' && data.display_id.trim()) {
        const { data: found, error } = await supabase
          .from('sprint_tasks')
          .select('id, name, display_id')
          .ilike('display_id', data.display_id.trim())
          .limit(1)
          .single()
        if (error || !found) return { action_result: null, error: `No sprint task found with display_id "${data.display_id}".` }
        return doDeleteSubtask(found.id, found.name, found.display_id)
      }

      // By name fuzzy
      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        const { data: found, error } = await supabase
          .from('sprint_tasks')
          .select('id, name, display_id')
          .ilike('name', `%${data.name_query.trim()}%`)
          .limit(1)
          .single()
        if (error || !found) return { action_result: null, error: `No sprint task found matching "${data.name_query}".` }
        return doDeleteSubtask(found.id, found.name, found.display_id)
      }

      return { action_result: null, error: 'DELETE_SUBTASK requires "id", "display_id", or "name_query".' }
    }

    // ── UPDATE_WORKLOAD ──────────────────────────────────────────────────────
    case 'UPDATE_WORKLOAD': {
      const workloadUpdates: Record<string, unknown> = {}

      if (typeof data.planned_time === 'number') workloadUpdates.planned_time = data.planned_time
      if (typeof data.actual_time  === 'number') workloadUpdates.actual_time  = data.actual_time
      if (typeof data.start_date   === 'string') workloadUpdates.start_date   = data.start_date || null
      if (typeof data.due_date     === 'string') workloadUpdates.due_date     = data.due_date   || null
      if (typeof data.status       === 'string') {
        if (VALID_WORKLOAD_STATUSES.includes(data.status as WorkloadStatus)) {
          workloadUpdates.status = data.status
        }
      }

      if (Object.keys(workloadUpdates).length === 0) {
        return { action_result: null, error: 'UPDATE_WORKLOAD: no valid fields to update.' }
      }

      // Resolve workload entry: direct id OR lookup by sprint_task_id
      let entryId: string | null = null
      let sprintTaskId: string | null = null
      let mainTaskId:   string | null = null

      if (typeof data.id === 'string' && data.id.trim()) {
        // Direct workload_entry UUID
        entryId = data.id.trim()
        // Fetch sprint_task_id + main_task_id via join
        const { data: entry, error: entryErr } = await supabase
          .from('workload_entries')
          .select('sprint_task_id, sprint_tasks(main_task_id)')
          .eq('id', entryId)
          .single()
        if (entryErr || !entry) return { action_result: null, error: `Workload entry not found: "${entryId}".` }
        sprintTaskId = entry.sprint_task_id as string
        const st = entry.sprint_tasks as { main_task_id: string } | null
        mainTaskId = st?.main_task_id ?? null
      } else {
        // Lookup by sprint_task_id
        const rawStId = typeof data.sprint_task_id === 'string' ? data.sprint_task_id.trim() : ''
        if (!rawStId) return { action_result: null, error: 'UPDATE_WORKLOAD requires "sprint_task_id" or "id".' }

        sprintTaskId = rawStId

        // Resolve sprint_task UUID if display_id given (e.g. ST-012)
        if (rawStId.toUpperCase().startsWith('ST-')) {
          const { data: st, error: stErr } = await supabase
            .from('sprint_tasks')
            .select('id, main_task_id')
            .ilike('display_id', rawStId)
            .limit(1)
            .single()
          if (stErr || !st) return { action_result: null, error: `Sprint task not found: "${rawStId}".` }
          sprintTaskId = st.id
          mainTaskId   = st.main_task_id as string
        } else {
          // Assume UUID — fetch main_task_id
          const { data: st, error: stErr } = await supabase
            .from('sprint_tasks')
            .select('main_task_id')
            .eq('id', rawStId)
            .single()
          if (stErr || !st) return { action_result: null, error: `Sprint task not found: "${rawStId}".` }
          mainTaskId = st.main_task_id as string
        }

        // Find workload entry for this sprint_task
        const { data: entry, error: entryErr } = await supabase
          .from('workload_entries')
          .select('id')
          .eq('sprint_task_id', sprintTaskId)
          .limit(1)
          .single()
        if (entryErr || !entry) return { action_result: null, error: `No workload entry found for sprint task "${rawStId}".` }
        entryId = entry.id
      }

      // Patch the entry
      const { data: updated, error: patchErr } = await supabase
        .from('workload_entries')
        .update(workloadUpdates)
        .eq('id', entryId)
        .select()
        .single()

      if (patchErr) {
        console.error('[chat/route] UPDATE_WORKLOAD patch error:', patchErr)
        return { action_result: null, error: patchErr.message }
      }

      // Cascade: propagate status change if applicable
      if (typeof workloadUpdates.status === 'string' && mainTaskId) {
        try {
          await onWorkloadEntryChanged(
            mainTaskId,
            supabase,
            sprintTaskId ?? undefined,
            workloadUpdates.status as WorkloadStatus,
          )
        } catch (cascadeErr) {
          console.error('[chat/route] UPDATE_WORKLOAD cascade error:', cascadeErr)
        }
      }

      return { action_result: updated }
    }

    // ── QUERY_TASKS ──────────────────────────────────────────────────────────
    case 'QUERY_TASKS': {
      // Agent answers from tasksJson already injected into system prompt. No DB call needed.
      return { action_result: null }
    }

    default:
      return { action_result: null, error: `Unknown action: "${action}".` }
  }
}

// ─── POST handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    // 1. Parse request body
    let body: ChatRequestBody
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.' }, { status: 400 })
    }

    const { messages, context } = body

    // 2. Validate
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { success: false, error: '"messages" must be a non-empty array.' },
        { status: 400 },
      )
    }

    if (!context || typeof context.page !== 'string') {
      return NextResponse.json(
        { success: false, error: '"context.page" is required.' },
        { status: 400 },
      )
    }

    // 3. Fetch last 50 main_tasks for tasksJson context injection
    let tasksJson = '[]'
    let taskCount = 0
    try {
      const supabaseCtx = createServerClient()
      const { data: allTasks } = await supabaseCtx
        .from('main_tasks')
        .select('id, display_id, name, status, priority, category, task_owner, deadline')
        .order('created_at', { ascending: false })
        .limit(50)
      taskCount  = allTasks?.length ?? 0
      tasksJson  = JSON.stringify(allTasks ?? [])
    } catch (e) {
      console.error('[chat/route] Failed to fetch tasks for context:', e)
    }

    // 4. Build system prompt
    const systemPrompt = buildSystemPrompt(context, tasksJson, taskCount)

    // 5. Call AI — try Anthropic first, fall back to Groq if key missing or error
    let rawReply = ''

    if (process.env.ANTHROPIC_API_KEY) {
      try {
        const claudeRes = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system:     systemPrompt,
          messages:   messages.map(m => ({ role: m.role, content: m.content })),
        })
        rawReply = (claudeRes.content[0]?.type === 'text' ? claudeRes.content[0].text : '').trim()
      } catch (err) {
        console.error('[chat/route] Anthropic error, falling back to Groq:', err)
      }
    }

    if (!rawReply && process.env.GROQ_API_KEY) {
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method:  'POST',
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:       'llama-3.3-70b-versatile',
          temperature: 0.3,
          max_tokens:  800,
          messages:    [{ role: 'system', content: systemPrompt }, ...messages.map(m => ({ role: m.role, content: m.content }))],
        }),
      })
      if (groqRes.ok) {
        const groqJson = await groqRes.json()
        rawReply = (groqJson.choices?.[0]?.message?.content ?? '').trim()
      } else {
        console.error('[chat/route] Groq error:', await groqRes.text())
      }
    }

    if (!rawReply) {
      return NextResponse.json({ success: false, error: 'AI service unavailable. Check ANTHROPIC_API_KEY or GROQ_API_KEY.' }, { status: 502 })
    }

    // 6. Extract action JSON from the reply (if present)
    const actionPayload = extractActionJSON(rawReply)

    // 7. Strip the action JSON block from the display text
    const reply = actionPayload ? stripActionJSON(rawReply) : rawReply

    // 8. Execute the action against Supabase (if found)
    if (actionPayload) {
      const supabase = createServerClient()
      const { action_result, error: actionError } = await executeAction(
        actionPayload.action,
        actionPayload.data,
        supabase,
      )

      if (actionError) {
        // Return the conversational reply but surface the execution error
        console.error(`[chat/route] Action "${actionPayload.action}" failed:`, actionError)
        return NextResponse.json({
          success: false,
          error: actionError,
          data: { reply, action_result: null },
        })
      }

      return NextResponse.json({
        success: true,
        data: { reply, action_result },
      })
    }

    // No action — plain conversational reply
    return NextResponse.json({
      success: true,
      data: { reply, action_result: null },
    })

  } catch (err) {
    console.error('[chat/route] Unhandled error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    )
  }
}
