import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = { title: 'Fleet — TuroAgent' }

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
