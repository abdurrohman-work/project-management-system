'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { Sparkles, Pause, Send, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type Message = {
  role: 'user' | 'assistant'
  content: string
  action_result?: { id?: string; display_id?: string; name?: string; [key: string]: unknown } | null
  isLoading?: boolean
}

type AgentContext = {
  page: string
  sprint: { id: string; name: string } | null
  tasks: { id: string; display_id: string; name: string; status: string; priority: string }[]
}

function pageFromPathname(p: string) {
  if (p.startsWith('/dashboard')) return 'dashboard'
  if (p.startsWith('/sprints'))   return 'sprints'
  if (p.startsWith('/workload'))  return 'workload'
  if (p.startsWith('/report'))    return 'report'
  return 'dashboard'
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AIAgent() {
  const pathname    = usePathname()
  const currentPage = pageFromPathname(pathname)

  const [isOpen,       setIsOpen]       = useState(false)
  const [isRecording,  setIsRecording]  = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [messages,     setMessages]     = useState<Message[]>([])
  const [input,        setInput]        = useState('')
  const [interimText,  setInterimText]  = useState('')
  const [vol,          setVol]          = useState(0)       // 0–100 audio volume
  const [timer,        setTimer]        = useState(0)       // seconds
  const [context,      setContext]      = useState<AgentContext | null>(null)
  const [btnVisible,   setBtnVisible]   = useState(true)    // floating button visibility

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const audioCtxRef    = useRef<AudioContext | null>(null)
  const analyserRef    = useRef<AnalyserNode | null>(null)
  const animFrameRef   = useRef<number>(0)
  const tRef           = useRef<number>(0)
  const recognitionRef = useRef<{ stop: () => void } | null>(null)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ─── Canvas ribbon animation ─────────────────────────────────────────────

  const drawRibbons = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lines    = 45
    const centerY  = canvas.height - 72
    const t        = tRef.current
    const isActive = isRecording || isGenerating

    // Set canvas opacity
    canvas.style.opacity = isActive ? '1' : '0.4'

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
    gradient.addColorStop(0,    'rgba(17,27,36,0)')
    gradient.addColorStop(0.25, 'rgba(63,156,251,0.4)')
    gradient.addColorStop(0.5,  'rgba(96,165,250,0.7)')
    gradient.addColorStop(0.75, 'rgba(63,156,251,0.4)')
    gradient.addColorStop(1,    'rgba(17,27,36,0)')

    ctx.globalCompositeOperation = 'screen'
    ctx.strokeStyle = gradient

    for (let i = 0; i < lines; i++) {
      ctx.beginPath()
      ctx.lineWidth = i === 0 ? 1.5 : 0.4
      const phase = i * 0.12

      for (let x = 0; x <= canvas.width; x += 8) {
        const nx       = x / canvas.width
        const envelope = Math.exp(-Math.pow((nx - 0.5) * 5, 2))
        const arch     = Math.exp(-Math.pow((nx - 0.5) * 6.5, 2)) * 110
        const wave1    = Math.sin(nx * 10 + t + phase) * 35
        const wave2    = Math.cos(nx * 16 - t * 0.8 + phase * 1.3) * 20
        const audioScale = isRecording
          ? (1 + vol * 0.015)
          : isGenerating ? 1.1 : 0.2
        const audioBump = Math.sin(nx * 15 - t * 2.5) * (vol * 0.8)
        const y = centerY - arch + (wave1 + wave2 + audioBump) * envelope * audioScale
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    tRef.current += 0.018
    animFrameRef.current = requestAnimationFrame(drawRibbons)
  }, [isRecording, isGenerating, vol])

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Start/stop canvas loop when overlay is open
  useEffect(() => {
    if (isOpen) {
      animFrameRef.current = requestAnimationFrame(drawRibbons)
    } else {
      cancelAnimationFrame(animFrameRef.current)
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isOpen, drawRibbons])

  // Resize canvas on window resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      if (canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Timer when recording or generating
  useEffect(() => {
    if (isRecording || isGenerating) {
      setTimer(0)
      timerRef.current = setInterval(() => setTimer(s => s + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
      setTimer(0)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [isRecording, isGenerating])

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Listen for task-created events from this component
  useEffect(() => {
    const handler = (e: Event) => {
      const task = (e as CustomEvent).detail
      if (task?.id) window.dispatchEvent(new CustomEvent('mohir:task-created', { detail: task }))
    }
    return () => { void handler }
  }, [])

  // ─── Timer formatter ──────────────────────────────────────────────────────

  function fmtTimer(s: number) {
    const m = String(Math.floor(s / 60)).padStart(2, '0')
    const sec = String(s % 60).padStart(2, '0')
    return `${m}:${sec}`
  }

  // ─── Context loader ───────────────────────────────────────────────────────

  async function loadContext() {
    try {
      const [tr, sr] = await Promise.all([
        fetch('/api/main-tasks').then(r => r.json()),
        fetch('/api/sprints/active').then(r => r.json()),
      ])
      setContext({
        page:   currentPage,
        sprint: sr.data?.sprint ?? null,
        tasks:  (tr.data ?? []).slice(0, 20).map((t: Record<string, unknown>) => ({
          id: t.id, display_id: t.display_id, name: t.name, status: t.status, priority: t.priority,
        })),
      })
    } catch { /* silent */ }
  }

  // ─── Open/close overlay ───────────────────────────────────────────────────

  function openOverlay() {
    setBtnVisible(false)
    setIsOpen(true)
    loadContext()
    if (messages.length === 0) {
      setTimeout(() => {
        setMessages([{
          role: 'assistant',
          content: "Salom! Vazifa, epic yoki loyihani tavsiflang — Uzbek, Russian yoki English tilida. Barcha ma'lumotlarni so'rab olamiz.",
        }])
      }, 200)
    }
  }

  function closeOverlay() {
    setIsOpen(false)
    if (isRecording) stopVoice()
    setTimeout(() => setBtnVisible(true), 300)
  }

  // ─── Send message ─────────────────────────────────────────────────────────

  async function sendMessage(text?: string) {
    const userText = (text ?? input).trim()
    if (!userText || isGenerating) return

    const userMsg: Message = { role: 'user', content: userText }
    const history = [...messages, userMsg]
    setMessages(history)
    setInput('')
    setInterimText('')
    setIsGenerating(true)

    // Add loading bubble
    setMessages(prev => [...prev, { role: 'assistant', content: '', isLoading: true }])

    try {
      const res  = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          messages: history,
          context:  context ?? { page: currentPage, sprint: null, tasks: [] },
        }),
      })
      const json = await res.json()

      // Replace loading bubble
      setMessages(prev => {
        const without = prev.filter(m => !m.isLoading)
        const reply: Message = {
          role:          'assistant',
          content:       json.success ? json.reply : `Xatolik: ${json.error ?? "Noma'lum xato"}`,
          action_result: json.action_result ?? null,
        }
        return [...without, reply]
      })

      // Dispatch task-created event
      if (json.action_result?.id && json.action_result?.name) {
        window.dispatchEvent(new CustomEvent('mohir:task-created', { detail: json.action_result }))
        setContext(prev => prev ? {
          ...prev,
          tasks: [
            { id: json.action_result.id, display_id: json.action_result.display_id ?? '', name: json.action_result.name, status: json.action_result.status ?? 'backlog', priority: json.action_result.priority ?? 'medium' },
            ...prev.tasks.slice(0, 19),
          ],
        } : prev)
      }
    } catch {
      setMessages(prev => prev.filter(m => !m.isLoading).concat({
        role: 'assistant', content: "Tarmoq xatosi. Qaytadan urinib ko'ring.",
      }))
    }
    setIsGenerating(false)
  }

  // ─── Voice ────────────────────────────────────────────────────────────────

  function stopVoice() {
    recognitionRef.current?.stop()
    audioCtxRef.current?.close()
    audioCtxRef.current = null
    analyserRef.current = null
    setIsRecording(false)
    setVol(0)
    if (interimText.trim()) {
      sendMessage(interimText.trim())
      setInterimText('')
    }
  }

  function startVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SR()
    rec.lang            = 'uz-UZ'
    rec.interimResults  = true
    rec.continuous      = true
    rec.maxAlternatives = 1

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const txt = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          setInput(prev => (prev ? prev + ' ' : '') + txt.trim())
          setInterimText('')
        } else { interim += txt }
      }
      if (interim) setInterimText(interim)
    }
    rec.onerror = () => stopVoice()
    rec.start()
    recognitionRef.current = rec
    setIsRecording(true)
    setInterimText('')

    // Audio context for volume
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const ctx     = new AudioContext()
      const source  = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioCtxRef.current  = ctx
      analyserRef.current  = analyser

      function tick() {
        if (!analyserRef.current) return
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        const avg = data.reduce((a, b) => a + b, 0) / data.length
        setVol(avg)
        if (isRecording) requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => {})
  }

  function toggleVoice() {
    if (isRecording) stopVoice()
    else startVoice()
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Floating button ─────────────────────────────────────────── */}
      {btnVisible && (
        <button
          onClick={openOverlay}
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
            boxShadow:       '0 0 20px rgba(63,156,251,0.5)',
            transition:      'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateX(-50%) scale(1.08)'
            e.currentTarget.style.boxShadow = '0 0 32px rgba(63,156,251,0.75)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
            e.currentTarget.style.boxShadow = '0 0 20px rgba(63,156,251,0.5)'
          }}
        >
          <Sparkles size={22} color="#fff" />
        </button>
      )}

      {/* ── Full-screen overlay ──────────────────────────────────────── */}
      {isOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeOverlay() }}
          style={{
            position:   'fixed',
            inset:      0,
            zIndex:     2000,
            background: 'radial-gradient(circle at center, rgba(24,35,45,0.92), rgba(17,27,36,0.82))',
            backdropFilter: 'blur(8px)',
            display:    'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-end',
          }}
        >
          {/* Close button top-right */}
          <button
            onClick={closeOverlay}
            style={{
              position: 'absolute', top: 20, right: 20,
              background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: '50%', width: 36, height: 36,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            <X size={16} />
          </button>

          {/* Ambient glow */}
          <div style={{
            position:        'absolute',
            top:             '50%',
            left:            '50%',
            transform:       `translate(-50%, -50%) scale(${isRecording || isGenerating ? 1.1 : 1})`,
            width:           '60vw',
            height:          '60vw',
            borderRadius:    '50%',
            backgroundColor: isRecording || isGenerating
              ? 'rgba(63,156,251,0.20)'
              : 'rgba(63,156,251,0.10)',
            filter:          'blur(120px)',
            transition:      'all 0.6s ease',
            pointerEvents:   'none',
          }} />

          {/* Canvas ribbons */}
          <canvas
            ref={canvasRef}
            style={{
              position:     'absolute',
              inset:        0,
              width:        '100%',
              height:       '100%',
              pointerEvents: 'none',
              transition:   'opacity 0.5s ease',
            }}
          />

          {/* Chat messages — left side, above center */}
          <div style={{
            position:      'absolute',
            left:          40,
            bottom:        160,
            width:         420,
            maxHeight:     '60vh',
            overflowY:     'auto',
            display:       'flex',
            flexDirection: 'column',
            gap:           12,
            paddingBottom: 8,
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display:       'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation:     i === 0 ? 'aiMsgIn 0.3s ease-out' : 'aiMsgIn 0.2s ease-out',
                }}
              >
                <div style={{
                  maxWidth:        '82%',
                  backgroundColor: msg.role === 'user'
                    ? 'rgba(42,63,82,0.92)'
                    : 'rgba(30,45,61,0.92)',
                  backdropFilter:  'blur(8px)',
                  border:          msg.role === 'user'
                    ? '1px solid rgba(63,156,251,0.2)'
                    : '1px solid #2a3f52',
                  borderRadius:    msg.role === 'user'
                    ? '16px 16px 2px 16px'
                    : '16px 16px 16px 2px',
                  padding:   '10px 14px',
                  fontSize:  13,
                  color:     msg.isLoading ? 'rgba(255,255,255,0.5)' : '#e2e4e9',
                  lineHeight: 1.55,
                }}>
                  {/* Loading dots */}
                  {msg.isLoading ? (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center', padding: '2px 0' }}>
                      {[0,1,2].map(d => (
                        <span key={d} style={{
                          width: 6, height: 6, borderRadius: '50%',
                          backgroundColor: '#3f9cfb',
                          animation: `aiDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                          display: 'inline-block',
                        }} />
                      ))}
                      <span style={{ marginLeft: 6, fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>
                        Tahlil qilinmoqda... ({fmtTimer(timer)})
                      </span>
                    </div>
                  ) : (
                    <>
                      {msg.content}
                      {/* Action result pill */}
                      {msg.action_result?.display_id && (
                        <div style={{
                          marginTop: 8, padding: '4px 10px',
                          backgroundColor: 'rgba(74,222,128,0.12)',
                          border: '1px solid rgba(74,222,128,0.3)',
                          borderRadius: 6, fontSize: 12, color: '#4ade80',
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}>
                          ✓ {msg.action_result.display_id} — {String(msg.action_result.name)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}

            {/* Live transcript bubble */}
            {isRecording && (interimText || input) && (
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{
                  maxWidth: '82%',
                  backgroundColor: 'rgba(42,63,82,0.92)',
                  backdropFilter: 'blur(8px)',
                  border: '1px solid rgba(63,156,251,0.3)',
                  borderRadius: '16px 16px 2px 16px',
                  padding: '10px 14px',
                  fontSize: 13, color: '#e2e4e9', lineHeight: 1.55,
                }}>
                  {input}{interimText}
                  <span style={{ animation: 'aiCursor 1s step-end infinite', opacity: 1 }}>|</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area (shown when not recording) */}
          {!isRecording && (
            <div style={{
              position:        'absolute',
              left:            40,
              bottom:          100,
              width:           420,
            }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
                }}
                placeholder="Yoki yozing..."
                rows={1}
                style={{
                  width:           '100%',
                  boxSizing:       'border-box',
                  backgroundColor: 'rgba(30,45,61,0.85)',
                  backdropFilter:  'blur(8px)',
                  border:          '1px solid #2a3f52',
                  borderRadius:    10,
                  color:           '#e2e4e9',
                  fontSize:        13,
                  lineHeight:      1.5,
                  padding:         '10px 14px',
                  outline:         'none',
                  resize:          'none',
                  fontFamily:      'inherit',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = '#3f9cfb')}
                onBlur={e  => (e.currentTarget.style.borderColor = '#2a3f52')}
              />
            </div>
          )}

          {/* ── Morphing center button + orbital rings ───────────────── */}
          <div style={{
            position:       'relative',
            marginBottom:   28,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:           148,
            height:          148,
            zIndex:          10,
          }}>
            {/* Orbital rings — only visible when active */}
            {(isRecording || input.trim()) && (
              <>
                {/* Ring 1 — 96px */}
                <div className="animate-spin" style={{
                  position:     'absolute',
                  width:        96, height: 96,
                  borderRadius: '50%',
                  border:       '1px solid transparent',
                  borderTop:    '1px solid rgba(63,156,251,0.8)',
                  borderRight:  '1px solid rgba(63,156,251,0.4)',
                  borderBottom: '1px solid rgba(63,156,251,0.4)',
                  borderLeft:   '1px solid rgba(63,156,251,0.4)',
                  animationDuration: '4s',
                }} />
                {/* Ring 2 — 112px reverse */}
                <div className="animate-spin" style={{
                  position:     'absolute',
                  width:        112, height: 112,
                  borderRadius: '50%',
                  border:       '1px solid transparent',
                  borderBottom: '1px solid rgba(96,165,250,0.6)',
                  borderTop:    '1px solid rgba(96,165,250,0.2)',
                  borderLeft:   '1px solid rgba(96,165,250,0.2)',
                  borderRight:  '1px solid rgba(96,165,250,0.2)',
                  animationDuration: '5s',
                  animationDirection: 'reverse',
                }} />
                {/* Ring 3 — 128px static */}
                <div style={{
                  position:     'absolute',
                  width:        128, height: 128,
                  borderRadius: '50%',
                  border:       '1px solid rgba(63,156,251,0.1)',
                }} />
              </>
            )}

            {/* Center button — 76px */}
            <button
              onClick={isRecording ? stopVoice : (input.trim() ? () => sendMessage() : toggleVoice)}
              disabled={!isRecording && !input.trim() && !isGenerating}
              style={{
                position:        'relative',
                width:           76,
                height:          76,
                borderRadius:    '50%',
                backgroundColor: (isRecording || input.trim()) ? '#3f9cfb' : 'rgba(63,156,251,0.18)',
                border:          `2px solid ${(isRecording || input.trim()) ? '#3f9cfb' : 'rgba(63,156,251,0.3)'}`,
                cursor:          (isRecording || input.trim()) ? 'pointer' : 'default',
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             3,
                filter:          (isRecording || input.trim()) ? 'none' : 'grayscale(1)',
                transition:      'all 0.3s ease',
                overflow:        'hidden',
                zIndex:          2,
              }}
            >
              {/* PAUSE state (recording) */}
              <div style={{
                position:  'absolute',
                transform: isRecording ? 'translateY(0)' : 'translateY(-40px)',
                opacity:   isRecording ? 1 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <Pause size={20} color="#fff" />
                <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, letterSpacing: 1 }}>
                  {fmtTimer(timer)}
                </span>
              </div>

              {/* SEND state (has text) */}
              <div style={{
                position:  'absolute',
                transform: (!isRecording && input.trim()) ? 'translateY(0)' : 'translateY(40px)',
                opacity:   (!isRecording && input.trim()) ? 1 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <Send size={20} color="#fff" />
                <span style={{ fontSize: 9, color: '#fff', fontWeight: 700, letterSpacing: 1 }}>SEND</span>
              </div>

              {/* MIC state (idle) */}
              <div style={{
                position:  'absolute',
                transform: (!isRecording && !input.trim()) ? 'translateY(0)' : 'translateY(40px)',
                opacity:   (!isRecording && !input.trim()) ? 0.5 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <Sparkles size={20} color="#3f9cfb" />
              </div>
            </button>

            {/* Mic toggle button — outside the center button */}
            {!isRecording && (
              <button
                onClick={toggleVoice}
                title="Ovozli kiritish"
                style={{
                  position:        'absolute',
                  right:           -4,
                  bottom:          -4,
                  width:           32,
                  height:          32,
                  borderRadius:    '50%',
                  backgroundColor: 'rgba(30,45,61,0.95)',
                  border:          '1px solid #2a3f52',
                  cursor:          'pointer',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  color:           '#6b8aaa',
                  fontSize:        14,
                  zIndex:          3,
                }}
              >
                🎤
              </button>
            )}
          </div>

        </div>
      )}
    </>
  )
}
