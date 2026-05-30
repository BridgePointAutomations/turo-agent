'use client'
import { useEffect } from 'react'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <p className="text-sm font-medium" style={{ color: '#E11D48' }}>Something went wrong loading this page.</p>
      <button onClick={reset} className="text-sm px-4 py-2 rounded-lg text-white" style={{ backgroundColor: '#1D9E75' }}>
        Try again
      </button>
    </div>
  )
}
