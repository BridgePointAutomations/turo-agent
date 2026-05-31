'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

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
  calendar: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  reports: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  ),
  menu: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
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
  { href: '/calendar', icon: Icons.calendar, label: 'Calendar' },
  { href: '/reports', icon: Icons.reports, label: 'Reports' },
]

const Brand = () => (
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
)

const Footer = () => (
  <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold text-white flex-shrink-0"
        style={{ backgroundColor: 'var(--turo-green)' }}>
        T
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-white truncate">Turo Host</p>
      </div>
    </div>
  </div>
)

export default function Sidebar() {
  const path = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLinks = (onNavigate?: () => void) =>
    nav.map(item => {
      const active = path === item.href || (item.href !== '/dashboard' && path.startsWith(item.href))
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all hover:text-white"
          style={active
            ? { backgroundColor: 'rgba(29,158,117,0.2)', color: '#4ade80' }
            : { color: 'var(--sidebar-text)' }
          }
        >
          <span className="flex-shrink-0 transition-colors" style={{ color: active ? '#4ade80' : 'var(--sidebar-text)' }}>
            {item.icon}
          </span>
          {item.label}
        </Link>
      )
    })

  return (
    <>
      {/* ── Desktop sidebar (md+) ─────────────────────────────── */}
      <aside className="hidden md:flex w-56 flex-shrink-0 flex-col h-screen sticky top-0" style={{ backgroundColor: 'var(--sidebar-bg)' }}>
        <div className="px-5 py-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <Brand />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navLinks()}
        </nav>
        <Footer />
      </aside>

      {/* ── Mobile top bar (< md) ─────────────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-30 flex items-center px-4 h-14"
        style={{ backgroundColor: 'var(--sidebar-bg)', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center w-11 h-11 rounded-lg -ml-1.5 flex-shrink-0"
          style={{ color: 'var(--sidebar-text)' }}
          aria-label="Open navigation">
          {Icons.menu}
        </button>
        <div className="flex-1 flex items-center justify-center">
          <Brand />
        </div>
        <div className="w-11 flex-shrink-0" />
      </header>

      {/* ── Mobile drawer backdrop ─────────────────────────────── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(2px)' }}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile drawer panel ────────────────────────────────── */}
      <div
        className="md:hidden fixed top-0 left-0 bottom-0 z-50 w-72 flex flex-col transition-transform duration-300"
        style={{
          backgroundColor: 'var(--sidebar-bg)',
          transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)',
        }}>
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <Brand />
          <button
            onClick={() => setMobileOpen(false)}
            className="flex items-center justify-center w-11 h-11 rounded-lg -mr-1.5"
            style={{ color: 'var(--sidebar-text)' }}
            aria-label="Close navigation">
            {Icons.close}
          </button>
        </div>

        {/* Drawer nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navLinks(() => setMobileOpen(false))}
        </nav>

        <Footer />
      </div>
    </>
  )
}
