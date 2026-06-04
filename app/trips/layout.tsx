import type { Metadata } from 'next'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = { title: 'Trips — TuroAgent' }

export default function TripsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <Sidebar />
      <main className="flex-1 overflow-auto min-w-0 pt-14 md:pt-0">
        {children}
      </main>
    </div>
  )
}
