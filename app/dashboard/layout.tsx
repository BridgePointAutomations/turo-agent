import type { Metadata } from 'next'
import AppShell from '@/components/AppShell'

export const metadata: Metadata = { title: 'Dashboard — TuroAgent' }

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>
}
