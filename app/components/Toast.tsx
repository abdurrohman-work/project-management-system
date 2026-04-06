'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, XCircle, X } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type ToastType = 'success' | 'error'

export interface ToastItem {
  id:      string
  message: string
  type:    ToastType
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3200)
  }, [])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  return { toasts, toast, dismiss }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts:    ToastItem[]
  onDismiss: (id: string) => void
}) {
  if (toasts.length === 0) return null

  return (
    <div
      style={{
        position:       'fixed',
        top:            20,
        right:          20,
        zIndex:         9999,
        display:        'flex',
        flexDirection:  'column',
        gap:            8,
        pointerEvents:  'none',
      }}
    >
      {toasts.map(t => {
        const isSuccess = t.type === 'success'
        const accentColor = isSuccess ? '#4ADE80' : '#F87171'
        return (
          <div
            key={t.id}
            style={{
              display:         'flex',
              alignItems:      'center',
              gap:             10,
              backgroundColor: isSuccess ? '#0d1f0d' : '#1f0d0d',
              border:          `1px solid ${accentColor}30`,
              borderLeft:      `3px solid ${accentColor}`,
              borderRadius:    8,
              padding:         '10px 14px',
              fontSize:        13,
              color:           '#E2E4E9',
              boxShadow:       '0 8px 24px rgba(0,0,0,0.35)',
              pointerEvents:   'all',
              minWidth:        220,
              maxWidth:        340,
              animation:       'slideInRight 0.2s ease-out',
            }}
          >
            {isSuccess
              ? <CheckCircle2 size={15} style={{ color: accentColor, flexShrink: 0 }} />
              : <XCircle      size={15} style={{ color: accentColor, flexShrink: 0 }} />
            }
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => onDismiss(t.id)}
              style={{
                background: 'none',
                border:     'none',
                cursor:     'pointer',
                color:      '#6B7280',
                padding:    0,
                display:    'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = '#E2E4E9')}
              onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = '#6B7280')}
            >
              <X size={13} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
