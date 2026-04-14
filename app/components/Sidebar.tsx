'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import {
  LayoutDashboard,
  Zap,
  Clock,
  BarChart2,
  Menu,
  X,
} from 'lucide-react'

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Sprint',    href: '/sprints',   icon: Zap             },
  { label: 'Workload',  href: '/workload',  icon: Clock           },
  { label: 'Report',    href: '/report',    icon: BarChart2       },
]

const C = {
  sidebar:  '#111b24',
  border:   '#2a3f52',
  primary:  '#3f9cfb',
  text:     '#ffffff',
  secondary:'rgba(255,255,255,0.6)',
  muted:    'rgba(255,255,255,0.4)',
}

export default function Sidebar() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  return (
    <>
      {/* ── Mobile hamburger button ─────────────────────────────────────── */}
      <button
        className="md:hidden fixed top-3 left-4 z-50 flex h-8 w-8 items-center justify-center rounded-md border cursor-pointer transition-colors duration-150 hover:bg-white/10"
        style={{ backgroundColor: C.sidebar, borderColor: C.border, color: 'rgba(255,255,255,0.7)' }}
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
      >
        <Menu size={16} />
      </button>

      {/* ── Backdrop ───────────────────────────────────────────────────── */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Sidebar panel ──────────────────────────────────────────────── */}
      <aside
        className={[
          'fixed inset-y-0 left-0 z-50 flex w-[250px] flex-col',
          'transition-transform duration-200 ease-in-out',
          open ? 'translate-x-0' : '-translate-x-full',
          'md:translate-x-0',
        ].join(' ')}
        style={{
          backgroundColor: C.sidebar,
          borderRight: `1px solid ${C.border}`,
        }}
      >
        {/* Workspace header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 56,
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 6,
              backgroundColor: C.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 13,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            M
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>
              Mohir.dev
            </p>
            <p style={{ margin: 0, fontSize: 11, color: C.muted, lineHeight: 1.2 }}>
              Project Management
            </p>
          </div>
          {/* Close button — mobile only */}
          <button
            className="md:hidden flex items-center justify-center w-6 h-6 rounded cursor-pointer"
            style={{ color: C.muted, background: 'transparent', border: 'none' }}
            onClick={() => setOpen(false)}
            aria-label="Close navigation"
          >
            <X size={15} />
          </button>
        </div>

        {/* Nav section */}
        <div style={{ padding: '12px 8px', flex: 1 }}>
          <p
            style={{
              margin: '0 0 6px',
              padding: '0 8px',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: C.muted,
            }}
          >
            Navigation
          </p>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV_LINKS.map(({ label, href, icon: Icon }) => {
              const isActive = pathname === href || pathname.startsWith(href + '/')
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 6,
                    textDecoration: 'none',
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? '#fff' : C.secondary,
                    backgroundColor: isActive ? 'rgba(63,156,251,0.14)' : 'transparent',
                    transition: 'background-color 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'rgba(255,255,255,0.05)'
                      ;(e.currentTarget as HTMLAnchorElement).style.color = C.text
                    }
                  }}
                  onMouseLeave={e => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.backgroundColor = 'transparent'
                      ;(e.currentTarget as HTMLAnchorElement).style.color = C.secondary
                    }
                  }}
                >
                  <Icon
                    size={16}
                    style={{ flexShrink: 0, color: isActive ? C.primary : 'currentColor' }}
                  />
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: `1px solid ${C.border}`,
            fontSize: 11,
            color: C.muted,
          }}
        >
          Project Management v1
        </div>
      </aside>
    </>
  )
}
