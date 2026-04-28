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

  const [isOpen,         setIsOpen]         = useState(false)
  const [isRecording,    setIsRecording]    = useState(false)
  const [isGenerating,   setIsGenerating]   = useState(false)
  const [messages,       setMessages]       = useState<Message[]>([])
  const [input,          setInput]          = useState('')
  const [interimText,    setInterimText]    = useState('')
  const [timer,          setTimer]          = useState(0)       // seconds
  const [context,        setContext]        = useState<AgentContext | null>(null)
  const [voiceSupported, setVoiceSupported] = useState(true)
  const [voiceError,     setVoiceError]     = useState<string | null>(null)

  const canvasRef       = useRef<HTMLCanvasElement>(null)
  const audioCtxRef     = useRef<AudioContext | null>(null)
  const analyserRef     = useRef<AnalyserNode | null>(null)
  const streamRef       = useRef<MediaStream | null>(null)
  const animFrameRef    = useRef<number>(0)
  const tRef            = useRef<number>(0)
  const volRef          = useRef<number>(0)   // live audio volume — ref avoids callback churn
  const isRecordingRef  = useRef<boolean>(false)
  const recognitionRef  = useRef<{ stop: () => void } | null>(null)
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null)
  const interimTextRef  = useRef<string>('')
  const messagesEndRef  = useRef<HTMLDivElement>(null)

  // ─── Canvas ribbon animation ─────────────────────────────────────────────

  const drawRibbons = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Clear only — never resize inside the draw loop (resize causes DOM reflow + position jump)
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const lines    = 45
    // Pin wave center to button center: BTN_BOTTOM(32) + half button height(32) = 64px from bottom
    const centerY  = canvas.height - 64
    const t        = tRef.current
    // Read live volume from ref (no state churn, smooth animation)
    const vol      = volRef.current
    const isActive = isRecordingRef.current || isGenerating

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
        // audioScale: idle=0.65 (visible), generating=1.1, recording=reacts to mic
        const audioScale = isRecordingRef.current
          ? (1 + vol * 0.018)   // loud wave proportional to voice volume
          : isGenerating ? 1.1 : 0.65
        const audioBump  = Math.sin(nx * 15 - t * 2.5) * (vol * 0.9)
        const y = centerY - arch + (wave1 + wave2 + audioBump) * envelope * audioScale
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
    }

    tRef.current += 0.018
    animFrameRef.current = requestAnimationFrame(drawRibbons)
  }, [isGenerating])   // only re-create when generating state changes

  // ─── Effects ──────────────────────────────────────────────────────────────

  // Size canvas once when overlay opens (after DOM settles), then start animation
  useEffect(() => {
    if (!isOpen) {
      cancelAnimationFrame(animFrameRef.current)
      return
    }
    // Wait one frame so overlay is fully laid out before reading dimensions
    const raf = requestAnimationFrame(() => {
      const canvas = canvasRef.current
      if (canvas) {
        canvas.width  = canvas.offsetWidth  || (window.innerWidth - 240)
        canvas.height = canvas.offsetHeight || window.innerHeight
      }
      animFrameRef.current = requestAnimationFrame(drawRibbons)
    })
    return () => {
      cancelAnimationFrame(raf)
      cancelAnimationFrame(animFrameRef.current)
    }
  }, [isOpen, drawRibbons])

  // Resize canvas on window resize
  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      if (canvas && canvas.offsetWidth) {
        canvas.width  = canvas.offsetWidth
        canvas.height = canvas.offsetHeight
      }
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

  // Escape key closes overlay
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  // Detect SpeechRecognition support once on mount
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setVoiceSupported(!!SR)
  }, [])

  // Auto-dismiss voice error toast
  useEffect(() => {
    if (!voiceError) return
    const t = setTimeout(() => setVoiceError(null), 4500)
    return () => clearTimeout(t)
  }, [voiceError])

  // Keep interimText ref in sync (used by SR onend, where state may be stale)
  useEffect(() => { interimTextRef.current = interimText }, [interimText])

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

  // Shared teardown — releases mic stream, audio graph, and resets recording state.
  // Safe to call multiple times. Does NOT call rec.stop() (caller decides).
  function cleanupVoice() {
    isRecordingRef.current = false
    if (audioCtxRef.current) {
      try { audioCtxRef.current.close() } catch { /* ignore */ }
    }
    audioCtxRef.current = null
    analyserRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    volRef.current = 0
    setIsRecording(false)

    const pending = interimTextRef.current.trim()
    if (pending) {
      sendMessage(pending)
      setInterimText('')
      interimTextRef.current = ''
    }
  }

  function stopVoice() {
    try { recognitionRef.current?.stop() } catch { /* ignore */ }
    recognitionRef.current = null
    cleanupVoice()
  }

  function startVoice() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setVoiceSupported(false)
      setVoiceError('Voice input not supported in this browser. Use Chrome or Edge.')
      return
    }

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
          interimTextRef.current = ''
        } else { interim += txt }
      }
      if (interim) setInterimText(interim)
    }
    rec.onerror = () => stopVoice()
    // BUG-028: SR can end on its own (silence timeout, browser policy). Mirror stopVoice cleanup.
    rec.onend = () => {
      recognitionRef.current = null
      cleanupVoice()
    }
    rec.start()
    recognitionRef.current = rec
    isRecordingRef.current = true
    setIsRecording(true)
    setInterimText('')
    interimTextRef.current = ''

    // Audio context — writes to volRef directly, no setState so no re-renders
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      streamRef.current = stream
      const ctx      = new AudioContext()
      const source   = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      audioCtxRef.current = ctx
      analyserRef.current = analyser

      function tick() {
        if (!analyserRef.current || !isRecordingRef.current) {
          volRef.current = 0
          return
        }
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        volRef.current = data.reduce((a, b) => a + b, 0) / data.length
        requestAnimationFrame(tick)
      }
      tick()
    }).catch(() => {
      // BUG-027: mic permission denied or device unavailable
      setVoiceError('Microphone access denied. Please allow mic permission in browser settings.')
      try { recognitionRef.current?.stop() } catch { /* ignore */ }
      recognitionRef.current = null
      cleanupVoice()
    })
  }

  function toggleVoice() {
    if (!voiceSupported) {
      setVoiceError('Voice input not supported in this browser. Use Chrome or Edge.')
      return
    }
    if (isRecording) stopVoice()
    else startVoice()
  }

  // ─── JSX ──────────────────────────────────────────────────────────────────

  const PRIMARY    = '#6F5BFF'
  const PRIMARY_LO = 'rgba(111,91,255,0.35)'
  const PRIMARY_MD = 'rgba(111,91,255,0.55)'

  // Fixed center: same for both open and closed button
  const BTN_LEFT = 'calc(240px + (100vw - 240px) / 2)'
  const BTN_BOTTOM = 32

  return (
    <>
      {/* ── Orbital rings (fixed, same center as button, above overlay) ── */}
      {isOpen && (isRecording || !!input.trim()) && (
        <>
          <div className="animate-spin" style={{
            position: 'fixed', bottom: BTN_BOTTOM - 21, left: BTN_LEFT,
            transform: 'translateX(-50%)',
            width: 96, height: 96, borderRadius: '50%',
            border: '1px solid rgba(111,91,255,0.15)',
            borderTop: '1px solid rgba(111,91,255,0.85)',
            animationDuration: '4s', zIndex: 1001, pointerEvents: 'none',
          }} />
          <div className="animate-spin" style={{
            position: 'fixed', bottom: BTN_BOTTOM - 28, left: BTN_LEFT,
            transform: 'translateX(-50%)',
            width: 114, height: 114, borderRadius: '50%',
            border: '1px solid rgba(96,165,250,0.1)',
            borderBottom: '1px solid rgba(96,165,250,0.6)',
            animationDuration: '5s', animationDirection: 'reverse',
            zIndex: 1001, pointerEvents: 'none',
          }} />
        </>
      )}

      {/* ── Single persistent button — NEVER moves ───────────────────── */}
      <button
        onClick={isOpen
          ? (isRecording ? stopVoice : (input.trim() ? () => sendMessage() : toggleVoice))
          : openOverlay}
        style={{
          position:        'fixed',
          bottom:          BTN_BOTTOM,
          left:            BTN_LEFT,
          transform:       'translateX(-50%)',
          width:           64,
          height:          64,
          borderRadius:    '50%',
          backgroundColor: (isOpen && (isRecording || input.trim())) ? PRIMARY : isOpen ? 'rgba(111,91,255,0.30)' : PRIMARY,
          border:          `2px solid ${isOpen && !isRecording && !input.trim() ? 'rgba(111,91,255,0.5)' : PRIMARY}`,
          cursor:          'pointer',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             2,
          zIndex:          1001,
          overflow:        'hidden',
          boxShadow:       isRecording
            ? '0 0 28px rgba(111,91,255,0.7)'
            : `0 0 20px ${PRIMARY_MD}`,
          transition:      'background-color 0.25s, box-shadow 0.25s, border-color 0.25s',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.transform = 'translateX(-50%) scale(1.07)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.transform = 'translateX(-50%) scale(1)'
        }}
      >
        {/* PAUSE — recording */}
        <div style={{
          position: 'absolute',
          transform: isOpen && isRecording ? 'translateY(0)' : 'translateY(-44px)',
          opacity:   isOpen && isRecording ? 1 : 0,
          transition: 'all 0.22s ease',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <Pause size={20} color="#fff" fill="#fff" />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 1 }}>
            {fmtTimer(timer)}
          </span>
        </div>

        {/* SEND — has typed text */}
        <div style={{
          position: 'absolute',
          transform: isOpen && !isRecording && input.trim() ? 'translateY(0)' : 'translateY(44px)',
          opacity:   isOpen && !isRecording && input.trim() ? 1 : 0,
          transition: 'all 0.22s ease',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
        }}>
          <Send size={19} color="#fff" />
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', fontWeight: 700, letterSpacing: 1 }}>SEND</span>
        </div>

        {/* SPARKLES — idle (open or closed) */}
        <div style={{
          position: 'absolute',
          transform: (!isOpen || (!isRecording && !input.trim())) ? 'translateY(0)' : 'translateY(44px)',
          opacity:   (!isOpen || (!isRecording && !input.trim())) ? 1 : 0,
          transition: 'all 0.22s ease',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Sparkles size={22} color="#fff" />
        </div>
      </button>

      {/* Mic toggle — fixed, just below+right of main button */}
      {isOpen && !isRecording && (
        <button
          onClick={toggleVoice}
          disabled={!voiceSupported}
          title={voiceSupported
            ? 'Ovozli kiritish'
            : 'Voice input not supported in this browser. Use Chrome or Edge.'}
          style={{
            position:        'fixed',
            bottom:          BTN_BOTTOM - 8,
            left:            `calc(${BTN_LEFT} + 24px)`,
            width:           28, height: 28, borderRadius: '50%',
            backgroundColor: 'rgba(21,22,29,0.95)',
            border:          '1px solid rgba(255,255,255,0.1)',
            cursor:          voiceSupported ? 'pointer' : 'not-allowed',
            opacity:         voiceSupported ? 1 : 0.45,
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
            fontSize:        12,
            zIndex:          1002,
            transition:      'background 0.15s',
          }}
          onMouseEnter={e => {
            if (voiceSupported) e.currentTarget.style.background = 'rgba(111,91,255,0.25)'
          }}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(21,22,29,0.95)')}
        >🎤</button>
      )}

      {/* Voice error toast — top-right, auto-dismiss after 4.5s */}
      {voiceError && (
        <div
          role="alert"
          onClick={() => setVoiceError(null)}
          style={{
            position:        'fixed',
            top:             20,
            right:           20,
            maxWidth:        320,
            padding:         '10px 14px',
            backgroundColor: 'rgba(69,10,10,0.95)',
            border:          '1px solid rgba(248,113,113,0.5)',
            borderRadius:    8,
            color:           '#fecaca',
            fontSize:        13,
            lineHeight:      1.4,
            zIndex:          2000,
            cursor:          'pointer',
            boxShadow:       '0 6px 20px rgba(0,0,0,0.45)',
          }}
        >
          {voiceError}
        </div>
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
            // Transparent at top, only a gentle dark fade near the bottom wave area
            background:      'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0) 40%, rgba(15,16,22,0.55) 70%, rgba(15,16,22,0.82) 100%)',
            backdropFilter:  'none',
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

          {/* Ambient glow — only near the button at bottom, not full-height */}
          <div style={{
            position:        'absolute',
            bottom:          '-15%',
            left:            '50%',
            transform:       `translateX(-50%) scale(${isRecording || isGenerating ? 1.1 : 1})`,
            width:           '40vw',
            height:          '40vw',
            maxWidth:        500,
            maxHeight:       500,
            borderRadius:    '50%',
            backgroundColor: isRecording || isGenerating
              ? 'rgba(111,91,255,0.15)'
              : 'rgba(111,91,255,0.07)',
            filter:          'blur(80px)',
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
            maxWidth:      '90%',
            overflowY:     'auto',
            display:       'flex',
            flexDirection: 'column',
            justifyContent:'flex-end',
            gap:            16,
            padding:       'clamp(56px, 8vh, 80px) clamp(16px, 4vw, 40px) 20px',
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
                {/* No background box — bare text with a side accent */}
                <div style={{
                  maxWidth:    'min(78%, 520px)',
                  fontSize:    'clamp(13px, 1.4vw, 15px)',
                  color:       msg.isLoading
                    ? 'rgba(255,255,255,0.4)'
                    : msg.role === 'user'
                      ? 'rgba(220,215,255,0.92)'   // soft lavender for user
                      : 'rgba(226,228,233,0.95)',   // near-white for assistant
                  lineHeight:  1.7,
                  textShadow:  '0 1px 10px rgba(0,0,0,0.95), 0 0 24px rgba(0,0,0,0.8)',
                  textAlign:   msg.role === 'user' ? 'right' : 'left',
                  // assistant: left purple accent; user: right accent
                  borderLeft:  msg.role === 'assistant' && !msg.isLoading
                    ? '2px solid rgba(111,91,255,0.55)'
                    : 'none',
                  borderRight: msg.role === 'user'
                    ? '2px solid rgba(111,91,255,0.4)'
                    : 'none',
                  paddingLeft:  msg.role === 'assistant' && !msg.isLoading ? 12 : 0,
                  paddingRight: msg.role === 'user' ? 12 : 0,
                }}>
                  {msg.isLoading ? (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {[0,1,2].map(d => (
                        <span key={d} style={{
                          width: 7, height: 7, borderRadius: '50%',
                          backgroundColor: PRIMARY,
                          animation: `aiDot 1.2s ease-in-out ${d * 0.2}s infinite`,
                          display: 'inline-block',
                        }} />
                      ))}
                      <span style={{ marginLeft: 4, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
                        {fmtTimer(timer)}s
                      </span>
                    </div>
                  ) : (
                    <>
                      {msg.content}
                      {msg.action_result?.display_id && (
                        <div style={{
                          marginTop: 8, padding: '4px 10px',
                          backgroundColor: 'rgba(74,222,128,0.08)',
                          border: '1px solid rgba(74,222,128,0.25)',
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

            {/* Live recording — same style as user message */}
            {isRecording && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', animation: 'aiMsgIn 0.2s ease-out' }}>
                <div style={{
                  maxWidth:    'min(78%, 520px)',
                  fontSize:    'clamp(13px, 1.4vw, 15px)',
                  color:       'rgba(200,195,255,0.75)',
                  lineHeight:  1.7,
                  textShadow:  '0 1px 10px rgba(0,0,0,0.95), 0 0 24px rgba(0,0,0,0.8)',
                  textAlign:   'right',
                  borderRight: '2px solid rgba(111,91,255,0.3)',
                  paddingRight: 12,
                  fontStyle:   'italic',
                }}>
                  {input || interimText
                    ? <>{input}{interimText}</>
                    : <span style={{ color: 'rgba(160,155,220,0.5)' }}>Listening...</span>
                  }
                  <span style={{ animation: 'aiCursor 0.9s step-end infinite', fontStyle: 'normal' }}>|</span>
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
                  backgroundColor: 'rgba(15,16,22,0.55)',
                  backdropFilter:  'blur(12px)',
                  border:          '1px solid rgba(255,255,255,0.08)',
                  borderRadius:    14,
                  color:           'rgba(226,228,233,0.9)',
                  fontSize:        'clamp(13px, 1.4vw, 15px)',
                  lineHeight:      1.5,
                  padding:         '12px 18px',
                  outline:         'none',
                  resize:          'none',
                  fontFamily:      'inherit',
                  transition:      'border-color 0.15s, background 0.15s',
                }}
                onFocus={e => {
                  e.currentTarget.style.borderColor = 'rgba(111,91,255,0.45)'
                  e.currentTarget.style.backgroundColor = 'rgba(15,16,22,0.7)'
                }}
                onBlur={e  => {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
                  e.currentTarget.style.backgroundColor = 'rgba(15,16,22,0.55)'
                }}
              />
            </div>
          )}

          {/* spacer so content doesn't hide under the fixed button */}
          <div style={{ height: 96, flexShrink: 0 }} />
        </div>
      )}
    </>
  )
}
