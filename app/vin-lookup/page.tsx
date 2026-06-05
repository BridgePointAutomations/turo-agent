'use client'
import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { mdComponents } from '@/lib/mdComponents'
import { inputCls, inputStyle } from '@/lib/ui'

type Phase = 'idle' | 'fetching' | 'generating' | 'done'

export default function VinLookupPage() {
  const [vin, setVin] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [mileage, setMileage] = useState('')
  const [reportMarkdown, setReportMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  async function analyze() {
    const cleanVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleanVin.length !== 17) {
      setError('VIN must be exactly 17 characters.')
      return
    }
    if (!purchasePrice || Number(purchasePrice) <= 0) {
      setError('Enter a valid purchase price.')
      return
    }
    if (!mileage || Number(mileage) < 0) {
      setError('Enter a valid mileage.')
      return
    }

    setLoading(true)
    setPhase('fetching')
    setReportMarkdown('')
    setError(null)

    try {
      const res = await fetch('/api/vin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vin: cleanVin,
          purchasePrice: Number(purchasePrice),
          mileage: Number(mileage),
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to analyze VIN.')
        setLoading(false)
        setPhase('idle')
        return
      }

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let firstDelta = false

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.delta) {
              if (!firstDelta) { setPhase('generating'); firstDelta = true }
              accumulated += payload.delta
              setReportMarkdown(accumulated)
            } else if (payload.done) {
              setPhase('done')
            } else if (payload.error) {
              setError(payload.error)
              setPhase('idle')
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
      setPhase('idle')
    } finally {
      setLoading(false)
    }
  }

  const phaseLabel =
    phase === 'fetching' ? 'Fetching NHTSA vehicle data…' :
    phase === 'generating' ? 'Generating analysis with Claude Sonnet…' :
    null

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>VIN Lookup</h1>
        <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
          AI-powered pre-purchase analysis for Turo hosts — powered by NHTSA data and Claude Sonnet
        </p>
      </div>

      {/* Input card */}
      <div className="bg-white rounded-xl p-5 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* VIN */}
          <div className="md:col-span-1">
            <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>VIN</label>
            <input
              type="text"
              maxLength={17}
              placeholder="e.g. 1HGCM82633A004352"
              value={vin}
              onChange={e => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              className={inputCls}
              style={{ ...inputStyle, fontFamily: 'monospace', letterSpacing: '0.05em' }}
              disabled={loading}
            />
            <p className="mt-1 text-xs" style={{ color: vin.length === 17 ? '#16A34A' : '#94A3B8' }}>
              {vin.length}/17 characters
            </p>
          </div>

          {/* Purchase price */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Purchase Price</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#64748B' }}>$</span>
              <input
                type="number"
                min={0}
                placeholder="18500"
                value={purchasePrice}
                onChange={e => setPurchasePrice(e.target.value)}
                className={inputCls}
                style={{ ...inputStyle, paddingLeft: '1.5rem' }}
                disabled={loading}
              />
            </div>
          </div>

          {/* Mileage */}
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: '#64748B' }}>Current Mileage</label>
            <div className="relative">
              <input
                type="number"
                min={0}
                placeholder="52000"
                value={mileage}
                onChange={e => setMileage(e.target.value)}
                className={inputCls}
                style={{ ...inputStyle, paddingRight: '3rem' }}
                disabled={loading}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#94A3B8' }}>mi</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-4">
          <button
            onClick={analyze}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity"
            style={{
              backgroundColor: '#1D9E75',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
            }}
          >
            {loading && (
              <div
                className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                style={{ borderColor: 'white', borderTopColor: 'transparent' }}
              />
            )}
            {loading ? 'Analyzing…' : 'Analyze VIN'}
          </button>

          {phaseLabel && (
            <p className="text-xs" style={{ color: '#64748B' }}>{phaseLabel}</p>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-6 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' }}>
          {error}
        </div>
      )}

      {/* Report output — rendered exactly like a chat message */}
      {reportMarkdown && (
        <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderTop: '2px solid #1D9E75' }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
            {reportMarkdown}
          </ReactMarkdown>
        </div>
      )}
    </div>
  )
}
