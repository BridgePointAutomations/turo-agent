'use client'
import { useEffect, useState } from 'react'
import type { Guest } from '@/lib/types'

const FLAG_CONFIG = {
  none:    { label: 'No flag',     bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8' },
  great:   { label: 'Great guest', bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E' },
  caution: { label: 'Use caution', bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B' },
  blocked: { label: 'Blocked',     bg: '#FFF1F2', text: '#E11D48', dot: '#F43F5E' },
}

const TEMPLATES = {
  welcome: `Hi [Guest Name]! Thanks for booking. Here are your pickup details:\n\n📍 Location: [Address]\n🔑 Key access: [Instructions]\n📱 My number: [Phone]\n\nFeel free to reach out with any questions. Enjoy the trip!`,
  late_return: `Hi [Guest Name], just checking in — your trip was scheduled to end today. Let me know if you need to extend, and I can check availability. Extensions are $[X]/day. Please coordinate before the trip ends to avoid late fees.`,
  damage_notice: `Hi [Guest Name], I noticed some damage to the vehicle that wasn't present at pickup. I've documented it with photos and will be filing a claim through Turo. Please review the Turo claims process at support.turo.com. I appreciate your cooperation.`,
  review_request: `Thanks so much for choosing my [Car] — it was great having you as a guest! If you have a moment, I'd really appreciate a review. I'll be leaving one for you as well. Hope to host you again!`,
  pickup_reminder: `Hi [Guest Name]! Your trip starts tomorrow. Quick reminder:\n\n📍 Pickup: [Address]\n⏰ Time: [Time]\n🔑 [Access instructions]\n\nSee you then!`,
}

const inputCls = "w-full text-sm px-3 py-2 rounded-lg"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

export default function GuestsPage() {
  const [guests, setGuests] = useState<Guest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', flag:'none' as const, notes:'', turo_profile_url:'' })
  const [saving, setSaving] = useState(false)
  const [template, setTemplate] = useState<keyof typeof TEMPLATES | ''>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [])
  async function load() {
    const data = await fetch('/api/guests').then(r => r.json())
    setGuests(Array.isArray(data) ? data : [])
  }

  async function save() {
    setSaving(true)
    await fetch('/api/guests', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) })
    setSaving(false); setShowForm(false); setForm({ name:'', flag:'none', notes:'', turo_profile_url:'' }); load()
  }

  async function updateFlag(id: string, flag: Guest['flag']) {
    await fetch('/api/guests', { method:'PATCH', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, flag }) })
    load()
  }

  function copyTemplate() {
    if (!template) return
    navigator.clipboard.writeText(TEMPLATES[template])
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Guests</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>{guests.length} guest{guests.length !== 1 ? 's' : ''} tracked</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add guest
        </button>
      </div>

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
            <p className="text-xs" style={{ color: '#94A3B8' }}>Pre-written messages for common situations</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {(Object.keys(TEMPLATES) as (keyof typeof TEMPLATES)[]).map(t => (
            <button key={t} onClick={() => setTemplate(t === template ? '' : t)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium capitalize transition-all"
              style={template === t
                ? { backgroundColor: '#1D9E75', color: 'white', border: '1px solid #1D9E75' }
                : { border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              {t.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
        {template && (
          <div className="relative">
            <textarea readOnly value={TEMPLATES[template]}
              className="w-full text-sm p-3.5 rounded-xl resize-none"
              rows={5}
              style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0', color: '#374151', outline: 'none' }} />
            <button onClick={copyTemplate}
              className="absolute top-2.5 right-2.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
              style={{ border: '1px solid #E2E8F0', color: copied ? '#16A34A' : '#64748B', backgroundColor: copied ? '#F0FDF4' : 'white' }}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Add guest</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Track this guest for future trips</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Guest name</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))}
                placeholder="John D." className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Flag</label>
              <select value={form.flag} onChange={e => setForm(p => ({...p, flag: e.target.value as any}))}
                className={inputCls} style={inputStyle}>
                {Object.entries(FLAG_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
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
      {guests.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#F5F3FF' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
          </div>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No guests tracked yet</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Add guests to track ratings, notes, and flags</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {guests.map(g => {
            const flagCfg = FLAG_CONFIG[g.flag] || FLAG_CONFIG.none
            const initials = g.name.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()
            return (
              <div key={g.id} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{ backgroundColor: '#EFF6FF', color: '#2563EB' }}>
                      {initials}
                    </div>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{g.name}</p>
                      {g.avg_rating && (
                        <p className="text-xs font-medium" style={{ color: '#F59E0B' }}>★ {g.avg_rating} avg rating</p>
                      )}
                    </div>
                  </div>
                  <select value={g.flag} onChange={e => updateFlag(g.id, e.target.value as any)}
                    className="text-xs px-2 py-1 rounded-lg cursor-pointer font-medium border-0"
                    style={{ backgroundColor: flagCfg.bg, color: flagCfg.text, outline: 'none' }}>
                    {Object.entries(FLAG_CONFIG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                {g.notes && (
                  <p className="text-xs italic mb-3 px-3 py-2 rounded-lg" style={{ color: '#64748B', backgroundColor: '#F8FAFC' }}>
                    "{g.notes}"
                  </p>
                )}
                <div className="flex items-center gap-4 text-xs pt-2" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
                  {g.total_trips > 0 && (
                    <span className="flex items-center gap-1">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 11l3 3L22 4"/>
                      </svg>
                      {g.total_trips} trip{g.total_trips !== 1 ? 's' : ''}
                    </span>
                  )}
                  {g.last_trip_date && <span>Last: {g.last_trip_date}</span>}
                  {g.turo_profile_url && (
                    <a href={g.turo_profile_url} target="_blank" rel="noreferrer"
                      className="ml-auto font-medium hover:underline" style={{ color: '#1D9E75' }}>
                      Turo profile →
                    </a>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
