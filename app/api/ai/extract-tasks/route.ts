import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const CATEGORIES = [
  'Platform Management', 'Course Management', 'IT Operations',
  'Administrative / Office', 'Finance & Billing', 'Technical Support',
  'Data & Analytics', 'Telephony/CRM', 'Others',
]

const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']

const SYSTEM_PROMPT = `You are a task parser for Mohir.dev project management system.
Extract task details from text in any language (Uzbek, Russian, English).
Return ONLY valid JSON, no markdown, no explanation.
Map priority words: urgent/yuqori/срочно = high, oddiy/обычный = medium.
If sprint subtasks are mentioned, list them in sprint_task_names array.

Return this exact JSON shape:
{
  "name": "string (required, concise task title in English)",
  "category": "one of: Platform Management | Course Management | IT Operations | Administrative / Office | Finance & Billing | Technical Support | Data & Analytics | Telephony/CRM | Others | null",
  "priority": "low | medium | high | critical",
  "task_owner": "string or null",
  "deadline": "ISO 8601 datetime string or null",
  "sprint_task_names": ["subtask 1", "subtask 2"]
}`

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }

    const claudeRes = await anthropic.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: text.trim() }],
    })

    const raw = (
      claudeRes.content[0]?.type === 'text' ? claudeRes.content[0].text : ''
    ).trim()

    // Strip accidental markdown fences
    const clean = raw
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim()

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(clean)
    } catch {
      console.error('JSON parse failed:', clean)
      return NextResponse.json({ success: false, error: 'Could not parse AI response.' }, { status: 422 })
    }

    const data = {
      name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
      category: CATEGORIES.includes(parsed.category as string)
        ? (parsed.category as string)
        : null,
      priority: VALID_PRIORITIES.includes(parsed.priority as string)
        ? (parsed.priority as string)
        : 'medium',
      task_owner: typeof parsed.task_owner === 'string'
        ? parsed.task_owner.trim() || null
        : null,
      deadline: typeof parsed.deadline === 'string'
        ? parsed.deadline
        : null,
      sprint_task_names: Array.isArray(parsed.sprint_task_names)
        ? (parsed.sprint_task_names as unknown[]).filter((s): s is string => typeof s === 'string')
        : [],
    }

    if (!data.name) {
      return NextResponse.json(
        { success: false, error: 'Could not extract a task name from the input.' },
        { status: 422 },
      )
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('extract-tasks error:', err)
    return NextResponse.json({ success: false, error: 'Failed to parse task.' }, { status: 500 })
  }
}
