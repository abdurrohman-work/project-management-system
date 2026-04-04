'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV_LINKS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Sprint',    href: '/sprints'   },
  { label: 'Workload',  href: '/workload'  },
  { label: 'Report',    href: '/report'    },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      style={{ width: 240, backgroundColor: '#111b24' }}
      className="fixed inset-y-0 left-0 flex flex-col"
    >
      {/* Logo */}
      <div className="px-6 py-6">
        <span className="text-lg font-bold text-white tracking-tight">
          Mohir.dev
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3">
        {NAV_LINKS.map(({ label, href }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={[
                'flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-l-[3px] border-[#3f9cfb] bg-[#1e2d3d] text-white rounded-l-none pl-[9px]'
                  : 'text-[rgba(255,255,255,0.6)] hover:bg-[#1e2d3d] hover:text-white border-l-[3px] border-transparent rounded-l-none pl-[9px]',
              ].join(' ')}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
