'use client'
import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { mdComponents } from '@/lib/mdComponents'
import { inputCls, inputStyle } from '@/lib/ui'
import ConfirmDelete from '@/components/ConfirmDelete'
import type { VinLookupRecord } from '@/lib/types'

type Phase = 'idle' | 'fetching' | 'generating' | 'done'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function VinLookupPage() {
  const [vin, setVin] = useState('')
  const [purchasePrice, setPurchasePrice] = useState('')
  const [mileage, setMileage] = useState('')
  const [reportMarkdown, setReportMarkdown] = useState('')
  const [loading, setLoading] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)

  // Metadata extracted after stream completes for saving
  const [pendingMeta, setPendingMeta] = useState<{ year: string; make: string; model: string; trim: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  // Saved lookups list
  const [savedLookups, setSavedLookups] = useState<VinLookupRecord[]>([])
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => { loadSaved() }, [])

  async function loadSaved() {
    const res = await fetch('/api/vin-lookups')
    const data = await res.json()
    setSavedLookups(Array.isArray(data) ? data : [])
  }

  function extractMeta(markdown: string) {
    // Pull year/make/model/trim from the ## 1. Vehicle Decode section
    const yearMatch = markdown.match(/\*\*Year[:\s*]+\*?\*?([\d]{4})/i) ||
                      markdown.match(/Year[:\s|]+([0-9]{4})/i)
    const makeMatch = markdown.match(/\*\*Make[:\s*]+\*?\*?([A-Za-z]+)/i) ||
                      markdown.match(/Make[:\s|]+([A-Za-z]+)/i)
    const modelMatch = markdown.match(/\*\*Model[:\s*]+\*?\*?([^\n*|]+)/i) ||
                       markdown.match(/Model[:\s|]+([^\n|]+)/i)
    const trimMatch = markdown.match(/\*\*Trim[:\s*]+\*?\*?([^\n*|]+)/i) ||
                      markdown.match(/Trim[:\s|]+([^\n|]+)/i)
    return {
      year: yearMatch?.[1]?.trim() ?? '',
      make: makeMatch?.[1]?.trim() ?? '',
      model: modelMatch?.[1]?.trim() ?? '',
      trim: trimMatch?.[1]?.trim() ?? '',
    }
  }

  async function analyze() {
    const cleanVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (cleanVin.length !== 17) { setError('VIN must be exactly 17 characters.'); return }
    if (!purchasePrice || Number(purchasePrice) <= 0) { setError('Enter a valid purchase price.'); return }
    if (!mileage || Number(mileage) < 0) { setError('Enter a valid mileage.'); return }

    setLoading(true)
    setPhase('fetching')
    setReportMarkdown('')
    setError(null)
    setPendingMeta(null)
    setSavedId(null)
    setActiveId(null)

    try {
      const res = await fetch('/api/vin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vin: cleanVin, purchasePrice: Number(purchasePrice), mileage: Number(mileage) }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Failed to analyze VIN.')
        setLoading(false); setPhase('idle'); return
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
              setPendingMeta(extractMeta(accumulated))
            } else if (payload.error) {
              setError(payload.error); setPhase('idle')
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

  async function saveReport() {
    setSaving(true)
    const cleanVin = vin.toUpperCase().replace(/[^A-Z0-9]/g, '')
    const meta = pendingMeta ?? { year: '', make: '', model: '', trim: '' }
    const res = await fetch('/api/vin-lookups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vin: cleanVin,
        year: meta.year || null,
        make: meta.make || null,
        model: meta.model || null,
        trim: meta.trim || null,
        purchase_price: Number(purchasePrice) || null,
        mileage: Number(mileage) || null,
        report_markdown: reportMarkdown,
      }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.id) {
      setSavedId(data.id)
      setActiveId(data.id)
      loadSaved()
    }
  }

  async function deleteLookup(id: string) {
    await fetch('/api/vin-lookups', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    setConfirmDelete(null)
    if (activeId === id) { setActiveId(null); setReportMarkdown(''); setPhase('idle') }
    loadSaved()
  }

  function loadLookup(record: VinLookupRecord) {
    setActiveId(record.id)
    setVin(record.vin)
    setPurchasePrice(record.purchase_price?.toString() ?? '')
    setMileage(record.mileage?.toString() ?? '')
    setReportMarkdown(record.report_markdown)
    setPhase('done')
    setSavedId(record.id)
    setPendingMeta(null)
    setError(null)
  }

  const phaseLabel =
    phase === 'fetching' ? 'Fetching NHTSA vehicle data…' :
    phase === 'generating' ? 'Generating analysis with Claude Sonnet…' : null

  return (
    <div className="flex h-screen overflow-hidden" style={{ backgroundColor: 'var(--page-bg)' }}>

      {/* ── Saved lookups sidebar ───────────────────────────────── */}
      <aside className="hidden lg:flex w-64 flex-shrink-0 flex-col border-r overflow-y-auto" style={{ borderColor: '#E2E8F0', backgroundColor: '#FAFAFA' }}>
        <div className="px-4 py-4 border-b flex-shrink-0" style={{ borderColor: '#E2E8F0' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748B' }}>Saved Reports</p>
          <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{savedLookups.length} report{savedLookups.length !== 1 ? 's' : ''}</p>
        </div>

        {savedLookups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <p className="text-xs text-center" style={{ color: '#94A3B8' }}>No saved reports yet.<br />Analyze a VIN and save it.</p>
          </div>
        ) : (
          <nav className="flex-1 p-2 space-y-1">
            {savedLookups.map(r => (
              <div
                key={r.id}
                onClick={() => loadLookup(r)}
                className="group relative rounded-lg px-3 py-2.5 cursor-pointer transition-colors"
                style={{
                  backgroundColor: activeId === r.id ? 'rgba(29,158,117,0.08)' : 'transparent',
                  border: activeId === r.id ? '1px solid rgba(29,158,117,0.2)' : '1px solid transparent',
                }}
              >
                <p className="text-xs font-semibold leading-tight truncate" style={{ color: activeId === r.id ? '#1D9E75' : '#0F172A' }}>
                  {r.year && r.make && r.model ? `${r.year} ${r.make} ${r.model}` : r.vin}
                </p>
                <p className="text-xs mt-0.5 font-mono" style={{ color: '#94A3B8' }}>{r.vin}</p>
                <div className="flex items-center justify-between mt-1">
                  {r.purchase_price && (
                    <p className="text-xs" style={{ color: '#64748B' }}>${r.purchase_price.toLocaleString()}</p>
                  )}
                  <p className="text-xs" style={{ color: '#94A3B8' }}>{formatDate(r.created_at)}</p>
                </div>

                {/* Delete button — shows on hover */}
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(r.id) }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center transition-opacity"
                  style={{ color: '#94A3B8' }}
                  title="Delete"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6"/><path d="M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1v2"/>
                  </svg>
                </button>
              </div>
            ))}
          </nav>
        )}
      </aside>

      {/* ── Main content ────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 md:p-8 max-w-4xl mx-auto">

          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>VIN Lookup</h1>
            <p className="mt-1 text-sm" style={{ color: '#64748B' }}>
              AI-powered pre-purchase analysis — NHTSA data + Claude Sonnet
            </p>
          </div>

          {/* Input card */}
          <div className="bg-white rounded-xl p-5 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                style={{ backgroundColor: '#1D9E75', opacity: loading ? 0.7 : 1, boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
              >
                {loading && (
                  <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin flex-shrink-0"
                    style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                )}
                {loading ? 'Analyzing…' : 'Analyze VIN'}
              </button>
              {phaseLabel && <p className="text-xs" style={{ color: '#64748B' }}>{phaseLabel}</p>}
            </div>
          </div>

          {/* Error banner */}
          {error && (
            <div className="mb-6 rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' }}>
              {error}
            </div>
          )}

          {/* Report */}
          {reportMarkdown && (
            <div className="bg-white rounded-xl p-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', borderTop: '2px solid #1D9E75' }}>

              {/* Report toolbar */}
              <div className="flex items-center justify-between mb-5 pb-4" style={{ borderBottom: '1px solid #F1F5F9' }}>
                <div>
                  {pendingMeta?.make && (
                    <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>
                      {pendingMeta.year} {pendingMeta.make} {pendingMeta.model}
                      {pendingMeta.trim && pendingMeta.trim !== 'Unknown' ? ` — ${pendingMeta.trim}` : ''}
                    </p>
                  )}
                  {activeId && !pendingMeta && (
                    <p className="text-xs" style={{ color: '#64748B' }}>Loaded from saved report</p>
                  )}
                </div>

                {phase === 'done' && !savedId && (
                  <button
                    onClick={saveReport}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-opacity"
                    style={{
                      backgroundColor: '#F0FDF4',
                      border: '1px solid #BBF7D0',
                      color: '#16A34A',
                      opacity: saving ? 0.7 : 1,
                    }}
                  >
                    {saving ? (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: '#16A34A', borderTopColor: 'transparent' }} />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                        <polyline points="17,21 17,13 7,13 7,21"/><polyline points="7,3 7,8 15,8"/>
                      </svg>
                    )}
                    {saving ? 'Saving…' : 'Save Report'}
                  </button>
                )}

                {savedId && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0', color: '#16A34A' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20,6 9,17 4,12"/>
                    </svg>
                    Saved
                  </div>
                )}
              </div>

              <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                {reportMarkdown}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>

      {/* Confirm delete */}
      {confirmDelete && (
        <ConfirmDelete
          label="Delete this saved report?"
          onConfirm={() => deleteLookup(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
