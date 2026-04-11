import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase-server'
import type { TaskPriority, MainTaskStatus, SprintTaskStatus } from '@/types/database'

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

function buildSystemPrompt(context: RequestContext): string {
  const sprintName = context.sprint?.name ?? 'none'
  const taskCount = context.tasks?.length ?? 0
  const currentPage = context.page ?? 'dashboard'

  return `You are an AI agent for Mohir.dev's project management system.
You help users create, update, and manage tasks through natural conversation.
Language: respond in the same language the user writes in (Uzbek, Russian, or English).
Current context: ${currentPage} page, ${taskCount} tasks, active sprint: ${sprintName}

You can perform these actions:
- CREATE_TASK: create a main task
- UPDATE_TASK: update any field on a task by ID or name
- CREATE_SUBTASK: add a sprint task to a main task
- CHANGE_STATUS: change task status
- ASSIGN_TASK: set task owner
- SET_DEADLINE: set deadline
- QUERY_TASKS: answer questions about tasks

Rules:
1. If the user's request is missing required info, ask ONE question at a time
2. Required for CREATE_TASK: name (ask if missing)
3. Optional but ask if not clearly provided: category, priority, owner, deadline
4. Before performing any action, show a confirmation summary and ask "Confirm?" (or "Tasdiqlaysizmi?" or "Подтверждаете?")
5. After user confirms (ha/yes/да/ok/confirm/✓ etc.), include the JSON action in your response
6. Keep responses concise — max 2-3 sentences
7. Return JSON action at the END of your response ONLY when the user has confirmed. Format:
   {"action": "ACTION_NAME", "data": {...}}
8. After executing an action, offer a follow-up: "Sprint task qo'shasizmi?" or "Anything else?"

Task categories (use exactly): Platform Management, Course Management, IT Operations, Administrative / Office, Finance & Billing, Technical Support, Data & Analytics, Telephony/CRM, Others
Task priority values: low, medium, high, critical
Main task status values: backlog, in_progress, blocked, stopped, done
Sprint task status values: not_started, in_progress, done, partly_completed, blocked, stopped`
}

// ─── Action JSON extraction ───────────────────────────────────────────────────

/**
 * Finds and parses the trailing JSON action block from the Groq reply text.
 * Uses a greedy search for the last `{...}` block containing an "action" key.
 */
function extractActionJSON(text: string): ActionPayload | null {
  // Match the last JSON-like block in the response that contains an "action" key
  const regex = /\{[\s\S]*"action"\s*:\s*"[A-Z_]+"[\s\S]*\}(?=[^}]*$)/
  const match = text.match(regex)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
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
    // Malformed JSON — silently ignore
    return null
  }
}

/**
 * Removes the trailing JSON action block from the text that will be shown
 * to the user, so they only see the conversational reply.
 */
function stripActionJSON(text: string): string {
  const regex = /\{[\s\S]*"action"\s*:\s*"[A-Z_]+"[\s\S]*\}(?=[^}]*$)/
  return text.replace(regex, '').trim()
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

    // ── QUERY_TASKS ──────────────────────────────────────────────────────────
    case 'QUERY_TASKS': {
      // The agent answers from the context already injected into the system prompt.
      // No DB call needed.
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

    // 3. Build system prompt from context
    const systemPrompt = buildSystemPrompt(context)

    // 4. Call Groq API
    // messages already contains full conversation history; prepend system message
    const groqMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ]

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.3,
        max_tokens: 512,
        messages: groqMessages,
      }),
    })

    if (!groqRes.ok) {
      const errText = await groqRes.text()
      console.error('[chat/route] Groq API error:', errText)
      return NextResponse.json(
        { success: false, error: 'AI service error. Please try again.' },
        { status: 502 },
      )
    }

    const groqJson = await groqRes.json()
    const rawReply: string = (groqJson.choices?.[0]?.message?.content ?? '').trim()

    if (!rawReply) {
      console.error('[chat/route] Groq returned an empty reply.')
      return NextResponse.json(
        { success: false, error: 'AI returned an empty response.' },
        { status: 502 },
      )
    }

    // 5. Extract action JSON from the reply (if present)
    const actionPayload = extractActionJSON(rawReply)

    // 6. Strip the action JSON block from the display text
    const reply = actionPayload ? stripActionJSON(rawReply) : rawReply

    // 7. Execute the action against Supabase (if found)
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
