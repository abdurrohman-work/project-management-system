import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const CATEGORIES = [
  'Platform Management', 'Course Management', 'IT Operations',
  'Administrative / Office', 'Finance & Billing', 'Technical Support',
  'Data & Analytics', 'Telephony/CRM', 'Others',
]

const SYSTEM_PROMPT = `You are a task extraction assistant for a project management system.
Given a natural language description, extract structured task data and return ONLY valid JSON — no markdown, no explanation, no code fences.

Return this exact shape:
{
  "name": "string (required, concise task title)",
  "category": "one of [${CATEGORIES.map(c => `"${c}"`).join(', ')}] or null",
  "priority": "one of: low | medium | high | critical  (default: medium)",
  "task_owner": "string (email or name) or null",
  "deadline": "ISO 8601 datetime string (e.g. 2026-04-15T17:00) or null",
  "note": "string with extra context or null"
}

Rules:
- name must be a clear, actionable title (max ~80 chars)
- Infer priority from urgency words: "urgent/critical/ASAP" → critical, "soon/important" → high, "later/whenever" → low
- Infer deadline from relative phrases like "by Friday", "next week", "in 3 days" using today's date: ${new Date().toISOString().slice(0, 10)}
- If something is unclear, use null rather than guessing`

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }

    const message = await client.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 512,
      system:     SYSTEM_PROMPT,
      messages:   [{ role: 'user', content: text.trim() }],
    })

    const raw = (message.content[0] as { type: string; text: string }).text.trim()

    // Strip any accidental markdown fences
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    const parsed = JSON.parse(json)

    // Sanitise fields
    const result = {
      name:       typeof parsed.name       === 'string' ? parsed.name.trim()       : '',
      category:   CATEGORIES.includes(parsed.category) ? parsed.category           : null,
      priority:   ['low','medium','high','critical'].includes(parsed.priority)
                    ? parsed.priority : 'medium',
      task_owner: typeof parsed.task_owner === 'string' ? parsed.task_owner.trim() || null : null,
      deadline:   typeof parsed.deadline   === 'string' ? parsed.deadline           : null,
      note:       typeof parsed.note       === 'string' ? parsed.note.trim()   || null : null,
    }

    if (!result.name) {
      return NextResponse.json({ success: false, error: 'Could not extract a task name from the input.' }, { status: 422 })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error('parse-task error:', err)
    return NextResponse.json({ success: false, error: 'Failed to parse task.' }, { status: 500 })
  }
}
