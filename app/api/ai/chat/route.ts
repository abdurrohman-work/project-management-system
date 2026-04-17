import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '@/lib/supabase-server'
import type { TaskPriority, MainTaskStatus, SprintTaskStatus } from '@/types/database'

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
- CREATE_SUBTASK — create a sprint task under a main task in the active sprint
- UPDATE_SUBTASK — update any field on a sprint task
- CHANGE_STATUS — change status of a main task or sprint task
- ASSIGN_TASK — set task_owner on a main task
- SET_DEADLINE — set or update deadline on a main task
- DELETE_TASK — permanently delete a main task by ID or name
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
- DELETE_TASK: task ID or name. Always confirm before deleting.

OPTIONAL FIELDS — gather naturally through conversation:
- category, priority, task_owner, deadline, note, blocked_by

CATEGORY VALUES (exact):
Platform Management | Course Management | IT Operations | Administrative / Office | Finance & Billing | Technical Support | Data & Analytics | Telephony/CRM | Others

PRIORITY VALUES: low | medium | high | critical (default: medium)

STATUS VALUES:
- main_task: backlog | in_progress | blocked | stopped | done
- sprint_task: not_started | in_progress | done | partly_completed | blocked | stopped

CONFIRMATION RULE:
Before executing ANY action, show a clear summary and ask for confirmation:
- Uzbek: "Tasdiqlaysizmi?"
- Russian: "Подтверждаете?"
- English: "Confirm?"

For DELETE_TASK, make the warning explicit — state the task name and that this is permanent.

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

      // Resolve the target row
      if (typeof data.id === 'string' && data.id.trim()) {
        // Update by UUID
        const { data: updated, error } = await supabase
          .from('main_tasks')
          .update(updates)
          .eq('id', data.id.trim())
          .select()
          .single()

        if (error) {
          console.error('[chat/route] UPDATE_TASK (by id) Supabase error:', error)
          return { action_result: null, error: error.message }
        }
        return { action_result: updated }
      }

      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        // Find task by name fuzzy match, then update
        const { data: found, error: findError } = await supabase
          .from('main_tasks')
          .select('id')
          .ilike('name', `%${data.name_query.trim()}%`)
          .limit(1)
          .single()

        if (findError || !found) {
          console.error('[chat/route] UPDATE_TASK (by name) find error:', findError)
          return { action_result: null, error: `No task found matching "${data.name_query}".` }
        }

        const { data: updated, error: updateError } = await supabase
          .from('main_tasks')
          .update(updates)
          .eq('id', found.id)
          .select()
          .single()

        if (updateError) {
          console.error('[chat/route] UPDATE_TASK (by name) update error:', updateError)
          return { action_result: null, error: updateError.message }
        }
        return { action_result: updated }
      }

      return { action_result: null, error: 'UPDATE_TASK requires either "id" or "name_query".' }
    }

    // ── CREATE_SUBTASK ───────────────────────────────────────────────────────
    case 'CREATE_SUBTASK': {
      const main_task_id = typeof data.main_task_id === 'string' ? data.main_task_id.trim() : ''
      const name = typeof data.name === 'string' ? data.name.trim() : ''

      if (!main_task_id) return { action_result: null, error: 'CREATE_SUBTASK requires main_task_id.' }
      if (!name) return { action_result: null, error: 'CREATE_SUBTASK requires a name.' }

      const priority: TaskPriority = VALID_PRIORITIES.includes(data.priority as TaskPriority)
        ? (data.priority as TaskPriority)
        : 'medium'

      // Fetch the currently active sprint
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
      return { action_result: created }
    }

    // ── CHANGE_STATUS ────────────────────────────────────────────────────────
    case 'CHANGE_STATUS': {
      const id = typeof data.id === 'string' ? data.id.trim() : ''
      const type = typeof data.type === 'string' ? data.type : 'main'
      const status = typeof data.status === 'string' ? data.status : ''

      if (!id) return { action_result: null, error: 'CHANGE_STATUS requires an id.' }
      if (!status) return { action_result: null, error: 'CHANGE_STATUS requires a status.' }

      if (type === 'sprint') {
        if (!VALID_SPRINT_STATUSES.includes(status as SprintTaskStatus)) {
          return { action_result: null, error: `Invalid sprint task status: "${status}".` }
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
        return { action_result: updated }
      }

      // Default: main task
      if (!VALID_MAIN_STATUSES.includes(status as MainTaskStatus)) {
        return { action_result: null, error: `Invalid main task status: "${status}".` }
      }
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

      if (typeof data.id === 'string' && data.id.trim()) {
        const { data: updated, error } = await supabase
          .from('sprint_tasks')
          .update(updates)
          .eq('id', data.id.trim())
          .select()
          .single()

        if (error) {
          console.error('[chat/route] UPDATE_SUBTASK (by id) error:', error)
          return { action_result: null, error: error.message }
        }
        return { action_result: updated }
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

        const { data: updated, error: updateError } = await supabase
          .from('sprint_tasks')
          .update(updates)
          .eq('id', found.id)
          .select()
          .single()

        if (updateError) {
          console.error('[chat/route] UPDATE_SUBTASK (by name) error:', updateError)
          return { action_result: null, error: updateError.message }
        }
        return { action_result: updated }
      }

      return { action_result: null, error: 'UPDATE_SUBTASK requires either "id" or "name_query".' }
    }

    // ── DELETE_TASK ──────────────────────────────────────────────────────────
    case 'DELETE_TASK': {
      if (typeof data.id === 'string' && data.id.trim()) {
        const { error } = await supabase
          .from('main_tasks')
          .delete()
          .eq('id', data.id.trim())

        if (error) {
          console.error('[chat/route] DELETE_TASK (by id) error:', error)
          return { action_result: null, error: error.message }
        }
        return { action_result: { deleted: true, id: data.id.trim() } }
      }

      if (typeof data.name_query === 'string' && data.name_query.trim()) {
        const { data: found, error: findError } = await supabase
          .from('main_tasks')
          .select('id, name, display_id')
          .ilike('name', `%${data.name_query.trim()}%`)
          .limit(1)
          .single()

        if (findError || !found) {
          return { action_result: null, error: `No task found matching "${data.name_query}".` }
        }

        const { error: deleteError } = await supabase
          .from('main_tasks')
          .delete()
          .eq('id', found.id)

        if (deleteError) {
          console.error('[chat/route] DELETE_TASK (by name) error:', deleteError)
          return { action_result: null, error: deleteError.message }
        }
        return { action_result: { deleted: true, id: found.id, name: found.name, display_id: found.display_id } }
      }

      return { action_result: null, error: 'DELETE_TASK requires either "id" or "name_query".' }
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
          reply,
        })
      }

      return NextResponse.json({
        success: true,
        reply,
        action_result,
      })
    }

    // No action — plain conversational reply
    return NextResponse.json({ success: true, reply })

  } catch (err) {
    console.error('[chat/route] Unhandled error:', err)
    return NextResponse.json(
      { success: false, error: 'Internal server error.' },
      { status: 500 },
    )
  }
}
