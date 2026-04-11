'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, X, Mic, MicOff, Send, CheckCircle2 } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role: 'user' | 'assistant'
  content: string
  action_result?: ActionResult | null
}

type ActionResult = {
  id?: string
  display_id?: string
  name?: string
  [key: string]: unknown
}

type AgentContext = {
  page: string
  sprint: { id: string; name: string } | null
  tasks: { id: string; display_id: string; name: string; status: string; priority: string }[]
}

// ─── Page name map ────────────────────────────────────────────────────────────

function pageFromPathname(pathname: string): string {
  if (pathname.startsWith('/dashboard')) return 'dashboard'
  if (pathname.startsWith('/sprints'))   return 'sprints'
  if (pathname.startsWith('/workload'))  return 'workload'
  if (pathname.startsWith('/report'))    return 'report'
  return 'dashboard'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAgent() {
  const pathname    = usePathname()
  const currentPage = pageFromPathname(pathname)

  const [isOpen,    setIsOpen]    = useState(false)
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const [context,   setContext]   = useState<AgentContext | null>(null)

  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Load context when panel opens ──────────────────────────────────────────
  async function loadContext() {
    try {
      const [tasksRes, sprintRes] = await Promise.all([
        fetch('/api/main-tasks').then(r => r.json()),
        fetch('/api/sprints/active').then(r => r.json()),
      ])
      setContext({
        page:   currentPage,
        sprint: sprintRes.data?.sprint ?? null,
        tasks:  (tasksRes.data ?? []).slice(0, 20).map((t: {
          id: string
          display_id: string
          name: string
          status: string
          priority: string
        }) => ({
          id:         t.id,
          display_id: t.display_id,
          name:       t.name,
          status:     t.status,
          priority:   t.priority,
        })),
      })
    } catch {
      // Context load failed silently — sendMessage will use empty fallback
    }
  }

  // ── Open panel ─────────────────────────────────────────────────────────────
  function handleOpen() {
    setIsOpen(v => !v)
    if (!isOpen) {
      loadContext()
      if (messages.length === 0) {
        setMessages([{
          role:    'assistant',
          content: `Hi! I'm your AI agent. I can create tasks, update statuses, assign owners, set deadlines, and answer questions about your tasks. What would you like to do?`,
        }])
      }
    }
  }

  // ── Send message ───────────────────────────────────────────────────────────
  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || isLoading) return

    const userMsg: Message = { role: 'user', content: userText }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: newMessages,
          context:  context ?? { page: currentPage, sprint: null, tasks: [] },
        }),
      })
      const json = await res.json()

      if (json.success) {
        const assistantMsg: Message = {
          role:          'assistant',
          content:       json.reply,
          action_result: json.action_result ?? null,
        }
        setMessages(prev => [...prev, assistantMsg])

        // Dispatch event so dashboard can flash the new row
        if (json.action_result?.id && json.action_result?.name) {
          window.dispatchEvent(new CustomEvent('mohir:task-created', {
            detail: json.action_result,
          }))
          // Refresh context tasks list
          setContext(prev => prev ? {
            ...prev,
            tasks: [
              {
                id:         json.action_result.id,
                display_id: json.action_result.display_id ?? '',
                name:       json.action_result.name,
                status:     json.action_result.status   ?? 'backlog',
                priority:   json.action_result.priority ?? 'medium',
              },
              ...prev.tasks.slice(0, 19),
            ],
          } : prev)
        }
      } else {
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `Sorry, I ran into an error: ${json.error}` },
        ])
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Network error. Please try again.' },
      ])
    }
    setIsLoading(false)
  }

  // ── Voice input ────────────────────────────────────────────────────────────
  function toggleVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      setListening(false)
      return
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec = new SR()
    rec.interimResults = false
    rec.continuous     = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript
      sendMessage(transcript)
    }
    rec.onend   = () => setListening(false)
    rec.onerror = () => setListening(false)
    rec.start()
    recognitionRef.current = rec
    setListening(true)
  }

  // ── JSX ────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating action button */}
      <button
        onClick={handleOpen}
        title="AI Agent"
        style={{
          position:        'fixed',
          bottom:          24,
          left:            '50%',
          transform:       'translateX(-50%)',
          width:           56,
          height:          56,
          borderRadius:    '50%',
          backgroundColor: '#3f9cfb',
          border:          'none',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          zIndex:          1000,
          boxShadow:       '0 4px 20px rgba(63,156,251,0.4)',
          animation:       isOpen ? 'none' : 'aiPulse 2s ease-in-out infinite',
        }}
      >
        {isOpen ? <X size={22} color="#fff" /> : <Sparkles size={22} color="#fff" />}
      </button>

      {/* Chat panel */}
      {isOpen && (
        <div
          style={{
            position:        'fixed',
            bottom:          92,
            right:           24,
            width:           480,
            maxHeight:       560,
            backgroundColor: '#1e2d3d',
            border:          '1px solid #2a3f52',
            borderRadius:    '16px 16px 12px 12px',
            display:         'flex',
            flexDirection:   'column',
            zIndex:          999,
            boxShadow:       '0 8px 32px rgba(0,0,0,0.4)',
            animation:       'aiSlideUp 0.22s ease-out',
          }}
        >

          {/* Header */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '12px 16px',
              borderBottom: '1px solid #2a3f52',
              flexShrink:   0,
            }}
          >
            <Sparkles size={14} style={{ color: '#3f9cfb' }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e4e9', flex: 1 }}>AI Agent</span>
            {/* Page context badge */}
            <span
              style={{
                fontSize:        10,
                fontWeight:      600,
                backgroundColor: 'rgba(63,156,251,0.12)',
                border:          '1px solid rgba(63,156,251,0.22)',
                color:           '#3f9cfb',
                borderRadius:    4,
                padding:         '2px 7px',
                textTransform:   'capitalize',
              }}
            >
              {currentPage}
            </span>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background:  'none',
                border:      'none',
                cursor:      'pointer',
                color:       '#6b8aaa',
                padding:     4,
                display:     'flex',
                borderRadius: 4,
              }}
            >
              <X size={14} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex:          1,
              overflowY:     'auto',
              padding:       '12px 14px',
              display:       'flex',
              flexDirection: 'column',
              gap:           10,
            }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display:       'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                <div
                  style={{
                    maxWidth:        '80%',
                    backgroundColor: msg.role === 'user' ? '#3f9cfb' : '#12202e',
                    border:          msg.role === 'assistant' ? '1px solid #2a3f52' : 'none',
                    borderRadius:    msg.role === 'user'
                      ? '12px 12px 2px 12px'
                      : '12px 12px 12px 2px',
                    padding:    '8px 12px',
                    fontSize:   13,
                    color:      msg.role === 'user' ? '#fff' : '#e2e4e9',
                    lineHeight: 1.5,
                  }}
                >
                  {msg.content}
                  {/* Action result pill */}
                  {msg.action_result?.display_id && (
                    <div
                      style={{
                        marginTop:       6,
                        padding:         '3px 8px',
                        backgroundColor: 'rgba(74,222,128,0.12)',
                        border:          '1px solid rgba(74,222,128,0.25)',
                        borderRadius:    5,
                        fontSize:        11,
                        color:           '#4ade80',
                        display:         'inline-flex',
                        alignItems:      'center',
                        gap:             4,
                      }}
                    >
                      <CheckCircle2 size={11} />
                      {msg.action_result.display_id} — {msg.action_result.name}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {isLoading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div
                  style={{
                    backgroundColor: '#12202e',
                    border:          '1px solid #2a3f52',
                    borderRadius:    '12px 12px 12px 2px',
                    padding:         '10px 14px',
                    display:         'flex',
                    gap:             4,
                    alignItems:      'center',
                  }}
                >
                  {[0, 1, 2].map(d => (
                    <span
                      key={d}
                      style={{
                        width:           6,
                        height:          6,
                        borderRadius:    '50%',
                        backgroundColor: '#3f9cfb',
                        animation:       `aiDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div
            style={{
              padding:     '10px 12px',
              borderTop:   '1px solid #2a3f52',
              display:     'flex',
              gap:         8,
              alignItems:  'flex-end',
              flexShrink:  0,
            }}
          >
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder="Ask me anything about your tasks…"
              rows={1}
              style={{
                flex:            1,
                backgroundColor: '#12202e',
                border:          '1px solid #2a3f52',
                borderRadius:    8,
                color:           '#e2e4e9',
                fontSize:        13,
                lineHeight:      1.5,
                padding:         '8px 12px',
                outline:         'none',
                resize:          'none',
                fontFamily:      'inherit',
                maxHeight:       100,
                overflowY:       'auto',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#3f9cfb')}
              onBlur={e  => (e.currentTarget.style.borderColor = '#2a3f52')}
            />

            {/* Mic button */}
            <button
              onClick={toggleVoice}
              title="Voice input"
              style={{
                width:           34,
                height:          34,
                flexShrink:      0,
                border:          `1px solid ${listening ? 'rgba(239,68,68,0.3)' : '#2a3f52'}`,
                borderRadius:    8,
                cursor:          'pointer',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                backgroundColor: listening ? 'rgba(239,68,68,0.18)' : '#12202e',
                color:           listening ? '#f87171' : '#6b8aaa',
              }}
            >
              {listening ? <MicOff size={14} /> : <Mic size={14} />}
            </button>

            {/* Send button */}
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              style={{
                width:           34,
                height:          34,
                flexShrink:      0,
                backgroundColor: input.trim() && !isLoading ? '#3f9cfb' : '#1a2840',
                border:          'none',
                borderRadius:    8,
                cursor:          input.trim() && !isLoading ? 'pointer' : 'not-allowed',
                display:         'flex',
                alignItems:      'center',
                justifyContent:  'center',
                transition:      'background-color 0.15s',
              }}
            >
              <Send size={14} color={input.trim() && !isLoading ? '#fff' : '#4a6580'} />
            </button>
          </div>

        </div>
      )}
    </>
  )
}
