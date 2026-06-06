'use client'
import { useEffect, useState } from 'react'
import type { Guest, Trip } from '@/lib/types'
import { inputCls, inputStyle } from '@/lib/ui'
import ConfirmDelete from '@/components/ConfirmDelete'

const FLAG_CONFIG = {
  none:    { label: 'No flag',     bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
  great:   { label: 'Great guest', bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E' },
  caution: { label: 'Use caution', bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  blocked: { label: 'Blocked',     bg: '#FFF1F2', text: '#E11D48', dot: '#F43F5E' },
}

const TEMPLATES = {
  welcome: `Hi [Guest Name]! Thanks for booking. Here are your pickup details:\n\n📍 Location: [Address]\n🔑 Key access: [Instructions]\n📱 My number: [Phone]\n⏰ Trip start: [Start Date]\n\nFeel free to reach out with any questions. Enjoy the trip!`,
  late_return: `Hi [Guest Name], just checking in — your trip was scheduled to end [End Date]. Let me know if you need to extend, and I can check availability. Extensions are $[X]/day. Please coordinate before the trip ends to avoid late fees.`,
  damage_notice: `Hi [Guest Name], I noticed some damage to the vehicle that wasn't present at pickup. I've documented it with photos and will be filing a claim through Turo. Please review the Turo claims process at support.turo.com. I appreciate your cooperation.`,
  review_request: `Thanks so much for choosing my [Car] — it was great having you as a guest! If you have a moment, I'd really appreciate a review. I'll be leaving one for you as well. Hope to host you again!`,
  pickup_reminder: `Hi [Guest Name]! Your trip starts [Start Date]. Quick reminder:\n\n📍 Pickup: [Address]\n⏰ Time: [Time]\n🔑 [Access instructions]\n\nSee you then!`,
}

type TemplateKey = keyof typeof TEMPLATES

type GuestWithTrips = Guest & { trips?: Trip[] }

function computeFilled(raw: string, guest: GuestWithTrips | null | undefined, trips: Trip[]): string {
  if (!raw) return ''
  if (!guest) return raw
  const lastTrip = trips[0]
  const carName = lastTrip
    ? `${(lastTrip.fleet as any)?.year || ''} ${(lastTrip.fleet as any)?.make || ''} ${(lastTrip.fleet as any)?.model || ''}`.trim() || '[Car]'
    : '[Car]'
  const startDate = lastTrip?.start_date || '[Start Date]'
  const endDate = lastTrip?.end_date || '[End Date]'
  const extensionPrice = lastTrip?.daily_rate != null
    ? String(Math.round(Number(lastTrip.daily_rate)))
    : '[X]'
  return raw
    .replace(/\[Guest Name\]/g, guest.name)
    .replace(/\[Car\]/g, carName)
    .replace(/\[Start Date\]/g, startDate)
    .replace(/\[End Date\]/g, endDate)
    .replace(/\[X\]/g, extensionPrice)
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<GuestWithTrips[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', flag: 'none' as Guest['flag'], notes: '', turo_profile_url: '' })
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ name: '', flag: 'none' as Guest['flag'], notes: '', turo_profile_url: '' })
  const [editSaving, setEditSaving] = useState(false)
  const [expandedTrips, setExpandedTrips] = useState<Set<string>>(new Set())
  const [guestTrips, setGuestTrips] = useState<Record<string, Trip[]>>({})
  const [loadingTrips, setLoadingTrips] = useState<Set<string>>(new Set())
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  // Search + filter
  const [search, setSearch] = useState('')
  const [flagFilter, setFlagFilter] = useState<'' | Guest['flag']>('')
  // Template state
  const [template, setTemplate] = useState<TemplateKey | ''>('')
  const [loadedTemplates, setLoadedTemplates] = useState<Record<TemplateKey, string>>({ ...TEMPLATES })
  const [templateGuestId, setTemplateGuestId] = useState('')
  const [composedText, setComposedText] = useState('')
  const [copied, setCopied] = useState(false)
  // Raw template editor
  const [showRawEdit, setShowRawEdit] = useState(false)
  const [rawBodyEdit, setRawBodyEdit] = useState('')
  const [rawBodyDirty, setRawBodyDirty] = useState(false)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateSaved, setTemplateSaved] = useState(false)
  // AI generation
  const [generating, setGenerating] = useState(false)

  useEffect(() => { load(); loadTemplates() }, [])

  async function load() {
    const data = await fetch('/api/guests').then(r => r.json())
    setGuests(Array.isArray(data) ? data : [])
  }

  async function loadTemplates() {
    const data = await fetch('/api/templates').then(r => r.json())
    if (data && typeof data === 'object') {
      setLoadedTemplates(prev => ({ ...prev, ...data }))
    }
  }

  async function save() {
    setSaving(true)
    await fetch('/api/guests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    setSaving(false)
    setShowForm(false)
    setForm({ name: '', flag: 'none', notes: '', turo_profile_url: '' })
    load()
  }

  async function updateFlag(id: string, flag: Guest['flag']) {
    await fetch('/api/guests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, flag }) })
    load()
  }

  function startEdit(g: GuestWithTrips) {
    setEditingId(g.id)
    setEditForm({ name: g.name, flag: g.flag, notes: g.notes ?? '', turo_profile_url: g.turo_profile_url ?? '' })
  }

  async function saveEdit(id: string) {
    setEditSaving(true)
    await fetch('/api/guests', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...editForm }) })
    setEditSaving(false)
    setEditingId(null)
    load()
  }

  async function deleteGuest(id: string) {
    await fetch(`/api/guests?id=${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    load()
  }

  async function fetchTripsForGuest(guestId: string): Promise<Trip[]> {
    if (guestTrips[guestId]) return guestTrips[guestId]
    setLoadingTrips(prev => new Set(prev).add(guestId))
    const data = await fetch(`/api/trips?guest_id=${guestId}`).then(r => r.json())
    const trips: Trip[] = Array.isArray(data) ? data : []
    setGuestTrips(prev => ({ ...prev, [guestId]: trips }))
    setLoadingTrips(prev => { const s = new Set(prev); s.delete(guestId); return s })
    return trips
  }

  async function toggleTrips(guestId: string) {
    if (expandedTrips.has(guestId)) {
      setExpandedTrips(prev => { const s = new Set(prev); s.delete(guestId); return s })
      return
    }
    setExpandedTrips(prev => new Set(prev).add(guestId))
    fetchTripsForGuest(guestId)
  }

  function selectTemplateKey(key: TemplateKey) {
    const newKey = key === template ? '' : key
    setTemplate(newKey)
    setShowRawEdit(false)
    setCopied(false)
    if (!newKey) {
      setComposedText('')
      setRawBodyEdit('')
      setRawBodyDirty(false)
      return
    }
    const raw = loadedTemplates[newKey] || TEMPLATES[newKey]
    setRawBodyEdit(raw)
    setRawBodyDirty(false)
    const guest = templateGuestId ? guests.find(g => g.id === templateGuestId) : null
    const trips = guest ? (guestTrips[guest.id] ?? []) : []
    setComposedText(computeFilled(raw, guest, trips))
  }

  async function selectTemplateGuest(id: string) {
    setTemplateGuestId(id)
    setCopied(false)
    if (!template) return
    const raw = loadedTemplates[template] || TEMPLATES[template]
    if (!id) {
      setComposedText(computeFilled(raw, null, []))
      return
    }
    const guest = guests.find(g => g.id === id) ?? null
    const trips = await fetchTripsForGuest(id)
    setComposedText(computeFilled(raw, guest, trips))
  }

  async function saveTemplate() {
    if (!template) return
    setTemplateSaving(true)
    await fetch('/api/templates', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: template, body: rawBodyEdit }),
    })
    setLoadedTemplates(prev => ({ ...prev, [template]: rawBodyEdit }))
    setRawBodyDirty(false)
    setTemplateSaving(false)
    setTemplateSaved(true)
    setTimeout(() => setTemplateSaved(false), 2500)
    const guest = templateGuestId ? guests.find(g => g.id === templateGuestId) : null
    const trips = guest ? (guestTrips[guest.id] ?? []) : []
    setComposedText(computeFilled(rawBodyEdit, guest, trips))
  }

  function resetTemplate() {
    if (!template) return
    setRawBodyEdit(TEMPLATES[template])
    setRawBodyDirty(true)
  }

  async function generateWithAI() {
    if (!template || !templateGuestId) return
    const guest = guests.find(g => g.id === templateGuestId)
    if (!guest) return

    const trips = guestTrips[guest.id] ?? []
    const lastTrip = trips[0]
    const carName = lastTrip
      ? `${(lastTrip.fleet as any)?.year || ''} ${(lastTrip.fleet as any)?.make || ''} ${(lastTrip.fleet as any)?.model || ''}`.trim() || undefined
      : undefined
    const tripDates = lastTrip ? `${lastTrip.start_date} to ${lastTrip.end_date}` : undefined

    setGenerating(true)
    setComposedText('')
    setCopied(false)

    const res = await fetch('/api/generate-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose: template.replace(/_/g, ' '),
        guestName: guest.name,
        guestFlag: guest.flag,
        carName,
        tripDates,
      }),
    })

    if (!res.ok || !res.body) {
      setGenerating(false)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const parsed = JSON.parse(line.slice(6))
          if (parsed.delta) setComposedText(prev => prev + parsed.delta)
          if (parsed.done || parsed.error) setGenerating(false)
        } catch { /* ignore parse errors */ }
      }
    }
    setGenerating(false)
  }

  function copyTemplate() {
    if (!composedText) return
    navigator.clipboard.writeText(composedText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const filtered = guests.filter(g => {
    const matchName = !search || g.name.toLowerCase().includes(search.toLowerCase())
    const matchFlag = !flagFilter || g.flag === flagFilter
    return matchName && matchFlag
  })

  const templateRaw = template ? (loadedTemplates[template] || TEMPLATES[template] || '') : ''
  const hasAutoFill = !!(templateGuestId && template && (
    templateRaw.includes('[Guest Name]') ||
    templateRaw.includes('[Car]') ||
    templateRaw.includes('[Start Date]') ||
    templateRaw.includes('[End Date]') ||
    templateRaw.includes('[X]')
  ))

  const remainingPlaceholders = composedText && !generating
    ? Array.from(composedText.matchAll(/\[([^\]]+)\]/g)).map(m => m[1])
    : []

  return (
    <div className="p-4 md:p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Guests</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            {filtered.length !== guests.length
              ? `${filtered.length} of ${guests.length} guests`
              : `${guests.length} guest${guests.length !== 1 ? 's' : ''} tracked`}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white hover:opacity-90 self-start"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add guest
        </button>
      </div>

      {/* Search + flag filter */}
      {guests.length > 0 && (
        <div className="flex gap-2 mb-5 flex-wrap">
          <div className="relative flex-1">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input
              type="text"
              placeholder="Search guests…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full text-sm pl-9 pr-3 py-2 rounded-lg"
              style={inputStyle}
            />
          </div>
          <select value={flagFilter} onChange={e => setFlagFilter(e.target.value as any)}
            className="text-sm px-3 py-2 rounded-lg" style={{ ...inputStyle, width: 'auto' }}>
            <option value="">All flags</option>
            {Object.entries(FLAG_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          {(search || flagFilter) && (
            <button onClick={() => { setSearch(''); setFlagFilter('') }}
              className="text-sm px-3 py-2 rounded-lg"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Clear
            </button>
          )}
        </div>
      )}

      {/* Message templates */}
      <div className="bg-white rounded-xl p-5 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EFF6FF' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Message Templates</h2>
            <p className="text-xs" style={{ color: '#94A3B8' }}>Select a template, pick a guest to auto-fill, or generate with AI</p>
          </div>
        </div>

        {/* Template selector buttons */}
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(TEMPLATES) as TemplateKey[]).map(t => (
            <button key={t} onClick={() => selectTemplateKey(t)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-all"
              style={template === t
                ? { backgroundColor: '#1D9E75', color: 'white', border: '1px solid #1D9E75' }
                : { border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>

        {template && (
          <div>
            {/* Guest selector + badges + AI button */}
            {guests.length > 0 && (
              <div className="flex items-center gap-2 mb-3 flex-wrap">
                <span className="text-xs font-medium" style={{ color: '#374151' }}>Fill for:</span>
                <select
                  value={templateGuestId}
                  onChange={e => selectTemplateGuest(e.target.value)}
                  className="text-sm px-3 py-1.5 rounded-lg flex-1"
                  style={inputStyle}>
                  <option value="">— no guest (use placeholders) —</option>
                  {guests.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {hasAutoFill && (
                  <span className="text-xs px-2 py-1 rounded-full font-medium"
                    style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                    Auto-filled
                  </span>
                )}
                {templateGuestId && (
                  <button
                    onClick={generateWithAI}
                    disabled={generating}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-50"
                    style={{ backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE' }}>
                    {generating ? (
                      <>
                        <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                        </svg>
                        Generating…
                      </>
                    ) : (
                      <>✨ Generate with AI</>
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Remaining placeholders warning */}
            {remainingPlaceholders.length > 0 && (
              <div className="mb-2.5 px-3 py-2 rounded-lg flex items-start gap-2"
                style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <p className="text-xs" style={{ color: '#92400E' }}>
                  <span className="font-semibold">Fill in before sending: </span>
                  {remainingPlaceholders.map((p, i) => (
                    <span key={i}>
                      <code className="px-1 py-0.5 rounded font-mono text-xs mx-0.5" style={{ backgroundColor: '#FEF3C7', color: '#B45309' }}>[{p}]</code>
                      {i < remainingPlaceholders.length - 1 ? ' ' : ''}
                    </span>
                  ))}
                </p>
              </div>
            )}

            {/* Main editable textarea */}
            <div className="relative">
              <textarea
                value={composedText}
                onChange={e => !generating && setComposedText(e.target.value)}
                disabled={generating}
                className="w-full text-sm p-3.5 rounded-lg resize-none"
                rows={5}
                style={{
                  backgroundColor: generating ? '#F8FAFC' : 'white',
                  border: `1px solid ${remainingPlaceholders.length > 0 ? '#FDE68A' : '#E2E8F0'}`,
                  color: '#374151',
                  outline: 'none',
                  cursor: generating ? 'wait' : 'text',
                }}
              />
              <button
                onClick={copyTemplate}
                disabled={!composedText || generating}
                className="absolute top-2.5 right-2.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:opacity-40"
                style={{ border: '1px solid #E2E8F0', color: copied ? '#16A34A' : '#64748B', backgroundColor: copied ? '#F0FDF4' : 'white' }}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>

            {/* Customize template toggle */}
            <div className="mt-2.5">
              <button
                onClick={() => setShowRawEdit(!showRawEdit)}
                className="text-xs font-medium hover:underline flex items-center gap-1"
                style={{ color: '#94A3B8' }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  style={{ transform: showRawEdit ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
                {showRawEdit ? 'Hide template editor' : 'Customize template'}
              </button>
            </div>

            {/* Raw template editor */}
            {showRawEdit && (
              <div className="mt-2.5 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                <p className="text-xs mb-2" style={{ color: '#94A3B8' }}>
                  Edit the template wording. Use <code className="font-mono" style={{ color: '#64748B' }}>[Guest Name]</code>, <code className="font-mono" style={{ color: '#64748B' }}>[Car]</code>, <code className="font-mono" style={{ color: '#64748B' }}>[Start Date]</code>, <code className="font-mono" style={{ color: '#64748B' }}>[End Date]</code>, <code className="font-mono" style={{ color: '#64748B' }}>[X]</code> for auto-fill tokens. Saved changes persist across sessions.
                </p>
                <textarea
                  value={rawBodyEdit}
                  onChange={e => { setRawBodyEdit(e.target.value); setRawBodyDirty(true) }}
                  rows={5}
                  className="w-full text-sm p-3.5 rounded-lg resize-none"
                  style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: '#F8FAFC', outline: 'none' }}
                />
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={saveTemplate}
                    disabled={templateSaving || !rawBodyDirty}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-40 transition-all"
                    style={{ backgroundColor: templateSaved ? '#16A34A' : '#1D9E75' }}>
                    {templateSaving ? 'Saving…' : templateSaved ? '✓ Saved' : 'Save template'}
                  </button>
                  <button
                    onClick={resetTemplate}
                    className="text-xs px-3 py-1.5 rounded-lg font-medium"
                    style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
                    Reset to default
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Add guest</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Track this guest for future trips</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Guest name</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                placeholder="John D." className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Flag</label>
              <select value={form.flag} onChange={e => setForm(p => ({...p, flag: e.target.value as any}))}
                className={inputCls} style={inputStyle}>
                {Object.entries(FLAG_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Turo profile URL</label>
              <input type="text" value={form.turo_profile_url} onChange={e => setForm(p => ({...p, turo_profile_url: e.target.value}))}
                placeholder="https://turo.com/us/en/drivers/…" className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Notes</label>
              <input type="text" value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))}
                placeholder="Any notes about this guest…" className={inputCls} style={inputStyle}/>
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={save} disabled={saving || !form.name}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? 'Saving…' : 'Add guest'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Guest cards */}
      {filtered.length === 0 && guests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#F5F3FF' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No guests tracked yet</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Add guests to track ratings, notes, and flags</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <p className="font-semibold text-sm mb-1" style={{ color: '#0F172A' }}>No guests match your filters</p>
          <button onClick={() => { setSearch(''); setFlagFilter('') }}
            className="text-xs mt-2 font-medium hover:underline" style={{ color: '#1D9E75' }}>
            Clear filters
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(g => {
            const flagCfg = FLAG_CONFIG[g.flag] || FLAG_CONFIG.none
            const initials = g.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
            const isEditing = editingId === g.id
            const tripsExpanded = expandedTrips.has(g.id)
            const trips = guestTrips[g.id] ?? []

            return (
              <div key={g.id} className="bg-white rounded-xl" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                {/* Confirm delete overlay */}
                {confirmDelete === g.id && (
                  <div className="p-4 rounded-xl flex items-center justify-between gap-3"
                    style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                    <p className="text-sm font-medium" style={{ color: '#E11D48' }}>
                      Delete {g.name}? Their linked trips will not be deleted.
                    </p>
                    <ConfirmDelete
                      label=""
                      onConfirm={() => deleteGuest(g.id)}
                      onCancel={() => setConfirmDelete(null)}
                    />
                  </div>
                )}

                {confirmDelete !== g.id && (
                  <div className="p-4">
                    {isEditing ? (
                      <div>
                        <p className="text-xs font-semibold mb-3" style={{ color: '#64748B' }}>EDITING GUEST</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Name</label>
                            <input type="text" value={editForm.name} onChange={e => setEditForm(p => ({...p, name: e.target.value}))}
                              className={inputCls} style={inputStyle}/>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Flag</label>
                            <select value={editForm.flag} onChange={e => setEditForm(p => ({...p, flag: e.target.value as any}))}
                              className={inputCls} style={inputStyle}>
                              {Object.entries(FLAG_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Turo profile URL</label>
                            <input type="text" value={editForm.turo_profile_url}
                              onChange={e => setEditForm(p => ({...p, turo_profile_url: e.target.value}))}
                              placeholder="https://turo.com/…" className={inputCls} style={inputStyle}/>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Notes</label>
                            <input type="text" value={editForm.notes}
                              onChange={e => setEditForm(p => ({...p, notes: e.target.value}))}
                              placeholder="Notes…" className={inputCls} style={inputStyle}/>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(g.id)} disabled={editSaving || !editForm.name}
                            className="px-4 py-1.5 rounded-lg text-xs font-medium text-white disabled:opacity-40"
                            style={{ backgroundColor: '#1D9E75' }}>
                            {editSaving ? 'Saving…' : 'Save'}
                          </button>
                          <button onClick={() => setEditingId(null)}
                            className="px-4 py-1.5 rounded-lg text-xs font-medium"
                            style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Main row */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0"
                              style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                              {initials}
                            </div>
                            <div>
                              <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{g.name}</p>
                              {/* Inline stat chips */}
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {g.total_trips > 0 && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                                    {g.total_trips} trip{g.total_trips !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {g.avg_rating != null && (
                                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                                    style={{ backgroundColor: '#FFFBEB', color: '#D97706' }}>
                                    ★ {g.avg_rating} avg
                                  </span>
                                )}
                                {g.last_trip_date && (
                                  <span className="text-xs" style={{ color: '#94A3B8' }}>
                                    Last: {g.last_trip_date}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <select value={g.flag} onChange={e => updateFlag(g.id, e.target.value as any)}
                              className="text-xs px-2 py-1 rounded-lg cursor-pointer font-medium border-0"
                              style={{ backgroundColor: flagCfg.bg, color: flagCfg.text, outline: 'none' }}>
                              {Object.entries(FLAG_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                            <button onClick={() => startEdit(g)}
                              className="p-1.5 rounded-lg hover:opacity-70"
                              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}
                              title="Edit guest">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            <button onClick={() => setConfirmDelete(g.id)}
                              className="p-1.5 rounded-lg hover:opacity-70"
                              style={{ border: '1px solid #FECDD3', color: '#E11D48', backgroundColor: '#FFF1F2' }}
                              title="Delete guest">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                                <path d="M10 11v6"/><path d="M14 11v6"/>
                                <path d="M9 6V4h6v2"/>
                              </svg>
                            </button>
                          </div>
                        </div>

                        {g.notes && (
                          <p className="text-xs italic mt-3 px-3 py-2 rounded-lg" style={{ color: '#64748B', backgroundColor: '#F8FAFC' }}>
                            "{g.notes}"
                          </p>
                        )}

                        {/* Footer row */}
                        <div className="flex items-center gap-4 mt-3 pt-3 text-xs" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
                          {g.total_trips > 0 && (
                            <button onClick={() => toggleTrips(g.id)}
                              className="flex items-center gap-1 hover:opacity-70 font-medium"
                              style={{ color: '#1D9E75' }}>
                              {tripsExpanded ? 'Hide trips' : 'View trip history'}
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                                style={{ transform: tripsExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                                <polyline points="6 9 12 15 18 9"/>
                              </svg>
                            </button>
                          )}
                          {g.turo_profile_url && (
                            <a href={g.turo_profile_url} target="_blank" rel="noreferrer"
                              className="ml-auto font-medium hover:underline" style={{ color: '#1D9E75' }}>
                              Turo profile →
                            </a>
                          )}
                        </div>

                        {/* Trip history */}
                        {tripsExpanded && (
                          <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                            {loadingTrips.has(g.id) ? (
                              <p className="text-xs text-center py-2" style={{ color: '#94A3B8' }}>Loading trips…</p>
                            ) : trips.length === 0 ? (
                              <p className="text-xs py-2" style={{ color: '#94A3B8' }}>No trips found for this guest.</p>
                            ) : (
                              <div className="space-y-2">
                                {trips.map(t => (
                                  <div key={t.id} className="flex items-center justify-between px-3 py-2 rounded-lg text-xs"
                                    style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                                    <div style={{ color: '#64748B' }}>
                                      <span className="font-medium" style={{ color: '#0F172A' }}>
                                        {(t.fleet as any)?.make} {(t.fleet as any)?.model}
                                      </span>
                                      <span className="mx-1.5">·</span>
                                      {t.start_date} → {t.end_date}
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {t.host_rating && (
                                        <span style={{ color: '#F59E0B' }}>★ {t.host_rating}</span>
                                      )}
                                      <span className="font-semibold" style={{ color: '#1D9E75' }}>
                                        ${Number(t.net_revenue).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
