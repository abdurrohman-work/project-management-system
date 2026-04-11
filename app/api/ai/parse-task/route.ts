import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

const CATEGORIES = [
  'Platform Management', 'Course Management', 'IT Operations',
  'Administrative / Office', 'Finance & Billing', 'Technical Support',
  'Data & Analytics', 'Telephony/CRM', 'Others',
]

const SYSTEM_PROMPT = `You are a task extraction assistant for a project management system.
Given a natural language description in ANY language (auto-detect — English, Russian, Uzbek, etc.), extract structured task data and return ONLY valid JSON — no markdown, no explanation, no code fences.

Return this exact shape:
{
  "name": "string (required, concise task title in English)",
  "category": "one of [${CATEGORIES.map(c => `"${c}"`).join(', ')}] or null",
  "priority": "one of: low | medium | high | critical  (default: medium)",
  "task_owner": "string (email or name) or null",
  "deadline": "ISO 8601 datetime string (e.g. 2026-04-15T17:00) or null",
  "note": "string with extra context or null"
}

Rules:
- name must be a clear, actionable title in English (max ~80 chars) regardless of input language
- Infer priority from urgency words: "urgent/critical/ASAP/срочно/shoshilinch" → critical, "soon/important/важно" → high, "later/whenever/кейин" → low
- Infer deadline from relative phrases like "by Friday", "next week", "в пятницу", "keyingi hafta" using today's date: ${new Date().toISOString().slice(0, 10)}
- If something is unclear, use null rather than guessing`

export async function POST(request: NextRequest) {
  try {
    const { text } = await request.json()

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ success: false, error: 'text is required' }, { status: 400 })
    }

    const model = genAI.getGenerativeModel({
      model:          'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT,
    })

    const result = await model.generateContent(text.trim())
    const raw    = result.response.text().trim()

    // Strip any accidental markdown fences
    const json = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()

    const parsed = JSON.parse(json)

    // Sanitise fields
    const data = {
      name:       typeof parsed.name       === 'string' ? parsed.name.trim()       : '',
      category:   CATEGORIES.includes(parsed.category) ? parsed.category           : null,
      priority:   ['low', 'medium', 'high', 'critical'].includes(parsed.priority)
                    ? parsed.priority : 'medium',
      task_owner: typeof parsed.task_owner === 'string' ? parsed.task_owner.trim() || null : null,
      deadline:   typeof parsed.deadline   === 'string' ? parsed.deadline           : null,
      note:       typeof parsed.note       === 'string' ? parsed.note.trim()   || null : null,
    }

    if (!data.name) {
      return NextResponse.json({ success: false, error: 'Could not extract a task name from the input.' }, { status: 422 })
    }

    return NextResponse.json({ success: true, data })
  } catch (err) {
    console.error('parse-task error:', err)
    return NextResponse.json({ success: false, error: 'Failed to parse task.' }, { status: 500 })
  }
}
