'use client'
import { useState, useEffect, useCallback, useRef } from 'react'

interface Tip {
  category: 'pricing' | 'maintenance' | 'tax' | 'bookings'
  title: string
  tip: string
  prompt: string
}

const TODAY = new Date().toISOString().slice(0, 10)
const CACHE_KEY = 'turo_tips_v2'

const CATEGORY_META: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
  pricing: {
    bg: '#EFF6FF', color: '#2563EB',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    ),
  },
  maintenance: {
    bg: '#FFF7ED', color: '#EA580C',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  tax: {
    bg: '#F0FDF4', color: '#16A34A',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  bookings: {
    bg: '#FAF5FF', color: '#7C3AED',
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
    ),
  },
}

function openChat(prompt: string) {
  window.dispatchEvent(new CustomEvent('open-chat', { detail: { prompt } }))
}

// Fleet fingerprint: vehicle count + trip count + maintenance alert count
// Refreshes tips when fleet state changes meaningfully during the day
async function getFleetFingerprint(): Promise<string> {
  try {
    const [v, t, m] = await Promise.all([
      fetch('/api/fleet').then(r => r.json()),
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/maintenance').then(r => r.json()),
    ])
    const vCount = Array.isArray(v) ? v.length : 0
    const tCount = Array.isArray(t) ? t.length : 0
    const mAlerts = Array.isArray(m) ? m.filter((i: any) => i.status === 'overdue' || i.status === 'due_soon').length : 0
    return `${TODAY}:${vCount}:${tCount}:${mAlerts}`
  } catch {
    return TODAY
  }
}

export default function AITipsPanel() {
  const [tips, setTips] = useState<Tip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [noNewInsights, setNoNewInsights] = useState(false)
  const shownTitlesRef = useRef<string[]>([])

  useEffect(() => {
    if (tips.length === 0) return
    const merged = [...shownTitlesRef.current, ...tips.map(t => t.title)]
    shownTitlesRef.current = merged.slice(-16)
  }, [tips])

  const fetchTips = useCallback(async (force = false) => {
    setLoading(true)
    setError(false)
    setNoNewInsights(false)

    if (!force) {
      try {
        const fingerprint = await getFleetFingerprint()
        const cached = localStorage.getItem(CACHE_KEY)
        if (cached) {
          const { fp, data } = JSON.parse(cached)
          if (fp === fingerprint && Array.isArray(data) && data.length > 0) {
            setTips(data)
            setLoading(false)
            return
          }
        }
        // Cache miss — fetch and store with current fingerprint
        const res = await fetch('/api/tips')
        if (!res.ok) throw new Error('Failed')
        const data: Tip[] = await res.json()
        setTips(data)
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ fp: fingerprint, data }))
        } catch { /* ignore */ }
      } catch {
        setError(true)
      } finally {
        setLoading(false)
      }
      return
    }

    // Force refresh — ask for tips different from what's already shown
    try {
      const res = await fetch('/api/tips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ excludeTitles: shownTitlesRef.current }),
      })
      if (!res.ok) throw new Error('Failed')
      const { tips: data, noNewInsights: fresh }: { tips: Tip[]; noNewInsights: boolean } = await res.json()

      if (Array.isArray(data) && data.length > 0) {
        setTips(data)
        setNoNewInsights(false)
        try {
          const fingerprint = await getFleetFingerprint()
          localStorage.setItem(CACHE_KEY, JSON.stringify({ fp: fingerprint, data }))
        } catch { /* ignore */ }
      } else if (fresh) {
        setNoNewInsights(true)
      } else {
        setTips([])
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchTips() }, [fetchTips])

  return (
    <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderTop: '2px solid #1D9E75' }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #F1F5F9' }}>
        <div>
          <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>AI Recommendations</h2>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Personalized insights from your fleet data</p>
        </div>
        <button
          onClick={() => fetchTips(true)}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-all hover:opacity-80 disabled:opacity-40"
          style={{ color: '#1D9E75', backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}
          title="Refresh tips">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className={loading ? 'animate-spin' : ''}>
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
          </svg>
          Refresh
        </button>
      </div>

      {noNewInsights && !loading && !error && (
        <div className="mx-4 mt-3 px-3 py-2 rounded-lg text-xs" style={{ backgroundColor: '#F8FAFC', border: '1px dashed #E2E8F0', color: '#94A3B8' }}>
          No new insights since your last refresh — your fleet data hasn't changed enough to surface something different.
        </div>
      )}

      {/* Body */}
      <div className="p-4 space-y-3">
        {loading && (
          <>
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl p-3.5 animate-pulse" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg flex-shrink-0" style={{ backgroundColor: '#E2E8F0' }} />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 rounded" style={{ backgroundColor: '#E2E8F0', width: '60%' }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#E2E8F0', width: '90%' }} />
                    <div className="h-2.5 rounded" style={{ backgroundColor: '#E2E8F0', width: '75%' }} />
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center py-8 rounded-xl" style={{ backgroundColor: '#FFF8F1', border: '1px solid #FED7AA' }}>
            <p className="text-sm font-medium" style={{ color: '#C2410C' }}>Could not load tips</p>
            <button onClick={() => fetchTips(true)} className="text-xs mt-2 font-medium hover:underline" style={{ color: '#EA580C' }}>
              Try again
            </button>
          </div>
        )}

        {!loading && !error && tips.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 rounded-xl" style={{ backgroundColor: '#F8FAFC', border: '1px dashed #E2E8F0' }}>
            <p className="text-sm" style={{ color: '#94A3B8' }}>No tips available yet</p>
            <p className="text-xs mt-1" style={{ color: '#CBD5E1' }}>Add fleet data to get recommendations</p>
          </div>
        )}

        {!loading && !error && tips.map((tip, i) => {
          const meta = CATEGORY_META[tip.category] ?? CATEGORY_META.pricing
          return (
            <div key={i} className="rounded-xl p-3.5 transition-all hover:shadow-sm"
              style={{ backgroundColor: '#FAFCFF', border: '1px solid #F1F5F9' }}>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: meta.bg, color: meta.color }}>
                  {meta.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-semibold leading-tight" style={{ color: '#0F172A' }}>{tip.title}</p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full capitalize flex-shrink-0"
                      style={{ backgroundColor: meta.bg, color: meta.color }}>
                      {tip.category}
                    </span>
                  </div>
                  <p className="text-xs leading-relaxed" style={{ color: '#64748B' }}>{tip.tip}</p>
                  <button
                    onClick={() => openChat(tip.prompt)}
                    className="mt-2 text-xs font-medium hover:underline flex items-center gap-1"
                    style={{ color: '#1D9E75' }}>
                    Ask AI
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
