'use client'

import { AlertTriangle, X } from 'lucide-react'

const C = {
  bg:      '#1A1D23',
  surface: '#2A2D35',
  border:  '#363940',
  text:    '#E2E4E9',
  secondary:'#9BA0AB',
  muted:   '#6B7280',
  danger:  '#EF4444',
}

interface ConfirmDialogProps {
  open:          boolean
  title:         string
  message:       string
  confirmLabel?: string
  danger?:       boolean
  onConfirm:     () => void
  onCancel:      () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  danger = true,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  return (
    <div
      style={{
        position:        'fixed',
        inset:           0,
        backgroundColor: 'rgba(0,0,0,0.65)',
        backdropFilter:  'blur(4px)',
        zIndex:          9900,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
      }}
      onClick={onCancel}
    >
      <div
        className="modal-enter"
        onClick={e => e.stopPropagation()}
        style={{
          backgroundColor: C.surface,
          border:          `1px solid ${C.border}`,
          borderRadius:    12,
          width:           400,
          maxWidth:        '90vw',
          boxShadow:       '0 24px 48px rgba(0,0,0,0.4)',
          overflow:        'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'space-between',
            padding:        '16px 20px',
            borderBottom:   `1px solid ${C.border}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {danger && (
              <div
                style={{
                  width:           28,
                  height:          28,
                  borderRadius:    '50%',
                  backgroundColor: 'rgba(239,68,68,0.12)',
                  display:         'flex',
                  alignItems:      'center',
                  justifyContent:  'center',
                  flexShrink:      0,
                }}
              >
                <AlertTriangle size={14} style={{ color: C.danger }} />
              </div>
            )}
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: C.text }}>
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border:     'none',
              cursor:     'pointer',
              color:      C.muted,
              padding:    4,
              borderRadius: 5,
              display:    'flex',
              alignItems: 'center',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = C.text)}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = C.muted)}
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px' }}>
          <p style={{ margin: 0, fontSize: 13, color: C.secondary, lineHeight: 1.5 }}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            display:        'flex',
            justifyContent: 'flex-end',
            gap:            8,
            padding:        '12px 20px',
            borderTop:      `1px solid ${C.border}`,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              backgroundColor: 'transparent',
              border:          `1px solid ${C.border}`,
              borderRadius:    7,
              color:           C.secondary,
              padding:         '6px 16px',
              fontSize:        13,
              fontWeight:      500,
              cursor:          'pointer',
              fontFamily:      'inherit',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = '#4A4F5A')}
            onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.borderColor = C.border)}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              backgroundColor: danger ? C.danger : '#7B68EE',
              border:          'none',
              borderRadius:    7,
              color:           '#fff',
              padding:         '6px 16px',
              fontSize:        13,
              fontWeight:      500,
              cursor:          'pointer',
              fontFamily:      'inherit',
              transition:      'background-color 0.12s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = danger ? '#DC3535' : '#6C5CE7'
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = danger ? C.danger : '#7B68EE'
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
