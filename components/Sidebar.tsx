'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Crisp SVG icons — no emojis
const Icons = {
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  fleet: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
      <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
      <path d="M3 13h18"/>
    </svg>
  ),
  trips: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
    </svg>
  ),
  expenses: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  ),
  guests: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  maintenance: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
    </svg>
  ),
}

const nav = [
  { href: '/dashboard', icon: Icons.dashboard, label: 'Dashboard' },
  { href: '/fleet', icon: Icons.fleet, label: 'Fleet' },
  { href: '/trips', icon: Icons.trips, label: 'Trips' },
  { href: '/expenses', icon: Icons.expenses, label: 'Expenses' },
  { href: '/guests', icon: Icons.guests, label: 'Guests' },
  { href: '/maintenance', icon: Icons.maintenance, label: 'Maintenance' },
]

export default function Sidebar() {
  const path = usePathname()
  return (
    <aside className="w-56 flex-shrink-0 flex flex-col h-screen sticky top-0" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
      {/* Brand */}
      <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--turo-green)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
              <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">TuroAgent</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--sidebar-text)' }}>Fleet Manager</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        <p className="text-xs font-medium px-3 mb-3 uppercase tracking-widest" style={{ color: 'rgba(148,163,184,0.5)' }}>Main Menu</p>
        {nav.map(item => {
          const active = path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'text-white'
                  : 'hover:text-white'
              }`}
              style={active
                ? { backgroundColor: 'rgba(29,158,117,0.2)', color: '#4ade80' }
                : { color: 'var(--sidebar-text)' }
              }
            >
              <span className={`flex-shrink-0 transition-colors ${active ? '' : ''}`}
                style={{ color: active ? '#4ade80' : 'var(--sidebar-text)' }}>
                {item.icon}
              </span>
              {item.label}
              {active && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#4ade80' }} />
              )}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
            style={{ backgroundColor: 'var(--turo-green)' }}>
            T
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-white truncate">Turo Host</p>
            <p className="text-xs truncate" style={{ color: 'var(--sidebar-text)' }}>v1.0 · Professional</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
