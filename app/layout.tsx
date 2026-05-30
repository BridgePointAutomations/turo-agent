import type { Metadata } from 'next'
import './globals.css'
import ChatPopup from '@/components/ChatPopup'

export const metadata: Metadata = {
  title: 'TuroAgent — Fleet Management',
  description: 'Professional Turo fleet management platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <ChatPopup />
      </body>
    </html>
  )
}
