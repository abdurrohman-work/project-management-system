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

    canvas.width  = canvas.offsetWidth  || window.innerWidth
    canvas.height = canvas.offsetHeight || window.innerHeight

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lines    = 45
    const centerY  = canvas.height - 80
    const t        = tRef.current
    const isActive = isRecording || isGenerating

    // Opacity: always visible, brighter when active
    canvas.style.opacity = isActive ? '1' : '0.85'

    // Purple-indigo gradient matching app primary #6F5BFF
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0)
    gradient.addColorStop(0,    'rgba(21, 22, 29, 0)')
    gradient.addColorStop(0.25, 'rgba(111, 91, 255, 0.45)')
    gradient.addColorStop(0.5,  'rgba(96,  165, 250, 0.75)')
    gradient.addColorStop(0.75, 'rgba(111, 91, 255, 0.45)')
    gradient.addColorStop(1,    'rgba(21, 22, 29, 0)')

    ctx.globalCompositeOperation = 'screen'
    ctx.strokeStyle = gradient

    for (let i = 0; i < lines; i++) {
      ctx.beginPath()
      ctx.lineWidth = i === 0 ? 2 : 0.5
      const phase = i * 0.12

      for (let x = 0; x <= canvas.width; x += 8) {
        const nx         = x / canvas.width
        const envelope   = Math.exp(-Math.pow((nx - 0.5) * 5, 2))
        const arch       = Math.exp(-Math.pow((nx - 0.5) * 6.5, 2)) * 110
        const wave1      = Math.sin(nx * 10 + t + phase) * 35
        const wave2      = Math.cos(nx * 16 - t * 0.8 + phase * 1.3) * 20
        // idle: 0.65 so waves are clearly visible; recording: loud, generating: medium
        const audioScale = isRecording
          ? (1 + vol * 0.015)
          : isGenerating ? 1.1 : 0.65
        const audioBump  = Math.sin(nx * 15 - t * 2.5) * (vol * 0.8)
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

  const PRIMARY    = '#6F5BFF'
  const PRIMARY_LO = 'rgba(111,91,255,0.35)'
  const PRIMARY_MD = 'rgba(111,91,255,0.55)'

  return (
    <>
      {/* ── Floating sparkle button ──────────────────────────────────── */}
      {btnVisible && (
        <button
          onClick={openOverlay}
          style={{
            position:        'fixed',
            bottom:          28,
            left:            '50%',
            transform:       'translateX(-50%)',
            width:           56,
            height:          56,
            borderRadius:    '50%',
            backgroundColor: PRIMARY,
            border:          'none',
            cursor:          'pointer',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            zIndex:          1000,
            boxShadow:       `0 0 24px ${PRIMARY_MD}`,
            transition:      'transform 0.2s, box-shadow 0.2s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateX(-50%) scale(1.08)'
            e.currentTarget.style.boxShadow = `0 0 36px rgba(111,91,255,0.75)`
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
            e.currentTarget.style.boxShadow = `0 0 24px ${PRIMARY_MD}`
          }}
        >
          <Sparkles size={22} color="#fff" />
        </button>
      )}

      {/* ── Overlay — starts after sidebar (240px) ───────────────────── */}
      {isOpen && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeOverlay() }}
          style={{
            position:        'fixed',
            top:             0,
            left:            240,   // leave sidebar visible
            right:           0,
            bottom:          0,
            zIndex:          900,
            background:      'radial-gradient(circle at 50% 60%, rgba(21,22,29,0.88), rgba(15,16,22,0.80))',
            backdropFilter:  'blur(10px)',
            display:         'flex',
            flexDirection:   'column',
            alignItems:      'center',
            overflow:        'hidden',
          }}
        >
          {/* Close button — top-right */}
          <button
            onClick={closeOverlay}
            style={{
              position:        'absolute', top: 16, right: 20,
              background:      'rgba(255,255,255,0.07)',
              border:          '1px solid rgba(255,255,255,0.12)',
              borderRadius:    '50%', width: 34, height: 34,
              cursor:          'pointer',
              display:         'flex', alignItems: 'center', justifyContent: 'center',
              color:           'rgba(255,255,255,0.65)',
              zIndex:          10,
              transition:      'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.13)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.07)')}
          >
            <X size={15} />
          </button>

          {/* Ambient glow behind button */}
          <div style={{
            position:        'absolute',
            bottom:          '-10%',
            left:            '50%',
            transform:       `translateX(-50%) scale(${isRecording || isGenerating ? 1.15 : 1})`,
            width:           '55vw',
            height:          '55vw',
            maxWidth:        700,
            maxHeight:       700,
            borderRadius:    '50%',
            backgroundColor: isRecording || isGenerating
              ? 'rgba(111,91,255,0.18)'
              : 'rgba(111,91,255,0.09)',
            filter:          'blur(100px)',
            transition:      'all 0.7s ease',
            pointerEvents:   'none',
          }} />

          {/* Canvas ribbons — fills overlay */}
          <canvas
            ref={canvasRef}
            style={{
              position:      'absolute',
              inset:         0,
              width:         '100%',
              height:        '100%',
              pointerEvents: 'none',
              transition:    'opacity 0.4s ease',
            }}
          />

          {/* ── Chat message list — centered, scrollable ─────────────── */}
          <div style={{
            flex:          1,
            width:         '100%',
            maxWidth:      620,
            overflowY:     'auto',
            display:       'flex',
            flexDirection: 'column',
            justifyContent:'flex-end',
            gap:            12,
            padding:       '72px 24px 24px',
            boxSizing:     'border-box',
            position:      'relative',
            zIndex:         5,
          }}>
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display:        'flex',
                  justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  animation:      'aiMsgIn 0.25s ease-out',
                }}
              >
                <div style={{
                  maxWidth:        '80%',
                  backgroundColor: msg.role === 'user'
                    ? 'rgba(37,39,51,0.92)'
                    : 'rgba(26,28,38,0.92)',
                  backdropFilter:  'blur(10px)',
                  border:          msg.role === 'user'
                    ? `1px solid ${PRIMARY_LO}`
                    : '1px solid rgba(255,255,255,0.08)',
                  borderRadius:    msg.role === 'user'
                    ? '18px 18px 4px 18px'
                    : '18px 18px 18px 4px',
                  padding:    '12px 16px',
                  fontSize:   14,
                  color:      msg.isLoading ? 'rgba(255,255,255,0.45)' : '#e2e4e9',
                  lineHeight: 1.6,
                  boxShadow:  '0 2px 12px rgba(0,0,0,0.25)',
                }}>
                  {msg.isLoading ? (
                    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                      {[0,1,2].map(d => (
                        <span key={d} style={{
                          width: 7, height: 7, borderRadius: '50%',
                          backgroundColor: PRIMARY,
                          animation: `aiDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                          display: 'inline-block',
                        }} />
                      ))}
                      <span style={{ marginLeft: 6, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                        {fmtTimer(timer)}s
                      </span>
                    </div>
                  ) : (
                    <>
                      {msg.content}
                      {msg.action_result?.display_id && (
                        <div style={{
                          marginTop: 8, padding: '5px 10px',
                          backgroundColor: 'rgba(74,222,128,0.1)',
                          border: '1px solid rgba(74,222,128,0.28)',
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

            {/* Live recording bubble */}
            {isRecording && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'aiMsgIn 0.2s ease-out' }}>
                <div style={{
                  maxWidth:        '80%',
                  backgroundColor: 'rgba(37,39,51,0.92)',
                  backdropFilter:  'blur(10px)',
                  border:          `1px solid ${PRIMARY_LO}`,
                  borderRadius:    '18px 18px 4px 18px',
                  padding:         '12px 16px',
                  fontSize:        14, color: '#e2e4e9', lineHeight: 1.6,
                  boxShadow:       '0 2px 12px rgba(0,0,0,0.25)',
                  minWidth:        120,
                }}>
                  {input || interimText
                    ? <>{input}{interimText}</>
                    : <span style={{ color: 'rgba(255,255,255,0.4)' }}>Listening...</span>
                  }
                  <span style={{ animation: 'aiCursor 0.9s step-end infinite' }}>|</span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Text input (shown when not recording) ────────────────── */}
          {!isRecording && (
            <div style={{
              width:     '100%',
              maxWidth:  620,
              padding:   '0 24px 16px',
              boxSizing: 'border-box',
              position:  'relative',
              zIndex:     5,
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
                  backgroundColor: 'rgba(26,28,38,0.88)',
                  backdropFilter:  'blur(10px)',
                  border:          '1px solid rgba(255,255,255,0.1)',
                  borderRadius:    12,
                  color:           '#e2e4e9',
                  fontSize:        14,
                  lineHeight:      1.5,
                  padding:         '11px 16px',
                  outline:         'none',
                  resize:          'none',
                  fontFamily:      'inherit',
                  transition:      'border-color 0.15s',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = PRIMARY_LO)}
                onBlur={e  => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
              />
            </div>
          )}

          {/* ── Morphing center button + orbital rings ───────────────── */}
          <div style={{
            position:       'relative',
            marginBottom:   32,
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            width:           148,
            height:          148,
            flexShrink:      0,
            zIndex:          10,
          }}>
            {/* Orbital rings — visible when recording or has text */}
            {(isRecording || input.trim()) && (
              <>
                <div className="animate-spin" style={{
                  position: 'absolute', width: 96, height: 96, borderRadius: '50%',
                  border: '1px solid rgba(111,91,255,0.15)',
                  borderTop: `1px solid rgba(111,91,255,0.85)`,
                  animationDuration: '4s',
                }} />
                <div className="animate-spin" style={{
                  position: 'absolute', width: 114, height: 114, borderRadius: '50%',
                  border: '1px solid rgba(96,165,250,0.1)',
                  borderBottom: '1px solid rgba(96,165,250,0.6)',
                  animationDuration: '5s',
                  animationDirection: 'reverse',
                }} />
                <div style={{
                  position: 'absolute', width: 130, height: 130, borderRadius: '50%',
                  border: `1px solid rgba(111,91,255,0.08)`,
                }} />
              </>
            )}

            {/* Center button — 76px */}
            <button
              onClick={isRecording ? stopVoice : (input.trim() ? () => sendMessage() : toggleVoice)}
              style={{
                position:        'relative',
                width:           76,
                height:          76,
                borderRadius:    '50%',
                backgroundColor: isRecording
                  ? PRIMARY
                  : input.trim() ? PRIMARY : 'rgba(111,91,255,0.22)',
                border:          `2px solid ${isRecording ? PRIMARY : input.trim() ? PRIMARY : 'rgba(111,91,255,0.4)'}`,
                cursor:          'pointer',
                display:         'flex',
                flexDirection:   'column',
                alignItems:      'center',
                justifyContent:  'center',
                gap:             3,
                transition:      'all 0.3s ease',
                overflow:        'hidden',
                zIndex:          2,
                boxShadow:       isRecording
                  ? `0 0 28px rgba(111,91,255,0.6)`
                  : input.trim() ? `0 0 20px rgba(111,91,255,0.4)` : 'none',
              }}
            >
              {/* PAUSE state (recording) */}
              <div style={{
                position:   'absolute',
                transform:  isRecording ? 'translateY(0)' : 'translateY(-40px)',
                opacity:    isRecording ? 1 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <Pause size={22} color="#fff" fill="#fff" />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 1 }}>
                  {fmtTimer(timer)}
                </span>
              </div>

              {/* SEND state (has text, not recording) */}
              <div style={{
                position:   'absolute',
                transform:  (!isRecording && input.trim()) ? 'translateY(0)' : 'translateY(40px)',
                opacity:    (!isRecording && input.trim()) ? 1 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <Send size={20} color="#fff" />
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 1 }}>SEND</span>
              </div>

              {/* SPARKLES state (idle) */}
              <div style={{
                position:   'absolute',
                transform:  (!isRecording && !input.trim()) ? 'translateY(0)' : 'translateY(40px)',
                opacity:    (!isRecording && !input.trim()) ? 1 : 0,
                transition: 'all 0.25s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={22} color="rgba(255,255,255,0.6)" />
              </div>
            </button>

            {/* Mic toggle — small pill below center button when idle */}
            {!isRecording && (
              <button
                onClick={toggleVoice}
                title="Ovozli kiritish"
                style={{
                  position:        'absolute',
                  bottom:          -4,
                  right:           -4,
                  width:           30,
                  height:          30,
                  borderRadius:    '50%',
                  backgroundColor: 'rgba(21,22,29,0.95)',
                  border:          '1px solid rgba(255,255,255,0.1)',
                  cursor:          'pointer',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  fontSize:        13,
                  zIndex:           3,
                  transition:      'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = `rgba(111,91,255,0.2)`)}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(21,22,29,0.95)')}
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
