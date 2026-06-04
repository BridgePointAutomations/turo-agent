'use client'
import { useEffect, useState } from 'react'
import type { Trip, Vehicle, Guest } from '@/lib/types'
import { inputCls, inputStyle } from '@/lib/ui'

const VEHICLE_COLORS = [
  { bg: '#DCFCE7', text: '#16A34A', border: '#86EFAC' },
  { bg: '#DBEAFE', text: '#2563EB', border: '#93C5FD' },
  { bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
  { bg: '#FEF3C7', text: '#D97706', border: '#FCD34D' },
  { bg: '#FCE7F3', text: '#DB2777', border: '#F9A8D4' },
]

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function dateStr(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const EMPTY_FORM = {
  vehicle_id: '',
  guest_name: '',
  start_date: '',
  end_date: '',
  daily_rate: 65,
  turo_fee_pct: 25,
  status: 'upcoming' as const,
  notes: '',
}

export default function CalendarPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tooltip, setTooltip] = useState<{ trip: Trip; vehicleName: string } | null>(null)

  // New trip form state
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [guestSearch, setGuestSearch] = useState('')
  const [showGuestDrop, setShowGuestDrop] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
      fetch('/api/guests').then(r => r.json()),
    ]).then(([t, v, g]) => {
      setTrips(Array.isArray(t) ? t : [])
      setVehicles(Array.isArray(v) ? v : [])
      setGuests(Array.isArray(g) ? g : [])
    })
  }, [])

  const vehicleColorMap = Object.fromEntries(
    vehicles.map((v, i) => [v.id, VEHICLE_COLORS[i % VEHICLE_COLORS.length]])
  )
  const vehicleNameMap = Object.fromEntries(
    vehicles.map(v => [v.id, `${v.year} ${v.make} ${v.model}`])
  )

  const dayTrips: Record<string, Trip[]> = {}
  trips.forEach(t => {
    if (!t.start_date || !t.end_date) return
    const start = new Date(t.start_date + 'T00:00:00')
    const end = new Date(t.end_date + 'T00:00:00')
    const cur = new Date(start)
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10)
      if (!dayTrips[key]) dayTrips[key] = []
      if (!dayTrips[key].find(x => x.id === t.id)) dayTrips[key].push(t)
      cur.setDate(cur.getDate() + 1)
    }
  })

  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  function openNewTripForm(ds: string) {
    setForm({ ...EMPTY_FORM, start_date: ds, end_date: ds })
    setGuestSearch('')
    setShowForm(true)
    setTooltip(null)
  }

  const filteredGuests = guests.filter(g =>
    g.name.toLowerCase().includes(guestSearch.toLowerCase())
  )

  function calcGross() {
    if (form.start_date && form.end_date && form.daily_rate) {
      const days = (new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000
      if (days > 0) {
        const gross = Number((days * form.daily_rate).toFixed(2))
        return gross
      }
    }
    return 0
  }

  async function createAndSelectGuest(name: string) {
    const res = await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, flag: 'none' }),
    })
    const g = await res.json()
    setGuests(prev => [g, ...prev])
    setForm(p => ({ ...p, guest_name: g.name, guest_id: g.id }))
    setGuestSearch(g.name)
    setShowGuestDrop(false)
  }

  async function saveTrip() {
    if (!form.vehicle_id || !form.guest_name || !form.start_date || !form.end_date) return
    setSaving(true)
    const gross = calcGross()
    const net = Number((gross * (1 - form.turo_fee_pct / 100)).toFixed(2))
    await fetch('/api/trips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, gross_revenue: gross, net_revenue: net, line_items: [] }),
    })
    setSaving(false)
    setShowForm(false)
    const t = await fetch('/api/trips').then(r => r.json())
    setTrips(Array.isArray(t) ? t : [])
  }

  const todayStr = now.toISOString().slice(0, 10)
  const gross = calcGross()
  const net = Number((gross * (1 - form.turo_fee_pct / 100)).toFixed(2))

  return (
    <div className="p-4 md:p-7 max-w-5xl mx-auto" onClick={() => { setTooltip(null); setShowGuestDrop(false) }}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Calendar</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Click any day to log a trip. Booking availability across your fleet.</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
            style={{ border: '1px solid #E2E8F0' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <span className="text-base font-semibold min-w-[160px] text-center" style={{ color: '#0F172A' }}>
            {MONTHS[month]} {year}
          </span>
          <button onClick={nextMonth} className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors hover:bg-white"
            style={{ border: '1px solid #E2E8F0' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#374151" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      </div>

      {/* Legend */}
      {vehicles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {vehicles.map((v, i) => {
            const col = VEHICLE_COLORS[i % VEHICLE_COLORS.length]
            return (
              <div key={v.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                style={{ backgroundColor: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: col.text }}/>
                {v.year} {v.make} {v.model}
              </div>
            )
          })}
        </div>
      )}

      {/* New trip form */}
      {showForm && (
        <div className="bg-white rounded-xl p-5 mb-5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
          onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Log a trip</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Quick-add from the calendar</p>
            </div>
            <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:opacity-70"
              style={{ color: '#94A3B8', border: '1px solid #E2E8F0' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {/* Vehicle */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => setForm(p => ({ ...p, vehicle_id: e.target.value }))}
                className={inputCls} style={inputStyle}>
                <option value="">Select vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
              </select>
            </div>

            {/* Guest combobox */}
            <div className="relative">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Guest</label>
              <input
                type="text"
                placeholder="Search or type name…"
                value={guestSearch}
                onChange={e => { setGuestSearch(e.target.value); setForm(p => ({ ...p, guest_name: e.target.value })); setShowGuestDrop(true) }}
                onFocus={() => setShowGuestDrop(true)}
                className={inputCls} style={inputStyle}
                onClick={e => e.stopPropagation()}
              />
              {showGuestDrop && guestSearch.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white rounded-lg overflow-hidden"
                  style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 180, overflowY: 'auto' }}
                  onClick={e => e.stopPropagation()}>
                  {filteredGuests.map(g => (
                    <button key={g.id} onMouseDown={() => { setForm(p => ({ ...p, guest_name: g.name, guest_id: g.id })); setGuestSearch(g.name); setShowGuestDrop(false) }}
                      className="w-full text-left px-3 py-2 text-sm font-medium hover:bg-gray-50" style={{ color: '#0F172A' }}>
                      {g.name}
                    </button>
                  ))}
                  {!filteredGuests.find(g => g.name.toLowerCase() === guestSearch.toLowerCase()) && (
                    <button onMouseDown={() => createAndSelectGuest(guestSearch)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                      style={{ borderTop: filteredGuests.length > 0 ? '1px solid #F1F5F9' : 'none', color: '#1D9E75', fontWeight: 500 }}>
                      + Create "{guestSearch}"
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Daily rate */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Daily rate ($)</label>
              <input type="number" value={form.daily_rate}
                onChange={e => setForm(p => ({ ...p, daily_rate: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}/>
            </div>

            {/* Start date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Start date</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                className={inputCls} style={inputStyle}/>
            </div>

            {/* End date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>End date</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                className={inputCls} style={inputStyle}/>
            </div>

            {/* Turo fee */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Turo fee plan</label>
              <select value={form.turo_fee_pct} onChange={e => setForm(p => ({ ...p, turo_fee_pct: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}>
                <option value={10}>More earnings (90%)</option>
                <option value={20}>Balanced (80%)</option>
                <option value={30}>More protection (70%)</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}
                className={inputCls} style={inputStyle}>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Revenue preview */}
          {gross > 0 && (
            <div className="mt-3 px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span style={{ color: '#065F46' }}>
                Gross: <strong>${gross.toFixed(2)}</strong>
                <span className="mx-2" style={{ color: '#86EFAC' }}>·</span>
                Net: <strong>${net.toFixed(2)}</strong>
                <span className="ml-1 font-normal" style={{ color: '#059669' }}>after {form.turo_fee_pct}% fee</span>
              </span>
            </div>
          )}

          <div className="flex gap-2 mt-4">
            <button onClick={saveTrip}
              disabled={saving || !form.vehicle_id || !form.guest_name || !form.start_date || !form.end_date}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? 'Saving…' : 'Log trip'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Calendar Grid */}
      <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        {/* Day headers */}
        <div className="grid grid-cols-7" style={{ borderBottom: '1px solid #E2E8F0' }}>
          {DAYS.map(d => (
            <div key={d} className="py-2.5 text-center text-xs font-semibold uppercase tracking-wider"
              style={{ color: '#94A3B8', letterSpacing: '0.06em' }}>
              <span className="hidden sm:inline">{d}</span><span className="sm:hidden">{d[0]}</span>
            </div>
          ))}
        </div>

        {/* Weeks */}
        {Array.from({ length: cells.length / 7 }, (_, w) => (
          <div key={w} className="grid grid-cols-7" style={{ borderBottom: w < cells.length / 7 - 1 ? '1px solid #F1F5F9' : 'none' }}>
            {cells.slice(w * 7, w * 7 + 7).map((day, i) => {
              if (!day) return (
                <div key={i} className="min-h-[56px] md:min-h-[80px] p-2" style={{ backgroundColor: '#FAFAFA', borderRight: i < 6 ? '1px solid #F1F5F9' : 'none' }}/>
              )
              const ds = dateStr(year, month, day)
              const isToday = ds === todayStr
              const tripsToday = dayTrips[ds] || []
              return (
                <div key={i}
                  className="min-h-[56px] md:min-h-[80px] p-2 relative cursor-pointer group"
                  style={{ borderRight: i < 6 ? '1px solid #F1F5F9' : 'none', backgroundColor: isToday ? '#F0FDF4' : 'white' }}
                  onClick={e => { e.stopPropagation(); openNewTripForm(ds) }}>
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'text-white' : ''}`}
                    style={{ backgroundColor: isToday ? '#1D9E75' : 'transparent', color: isToday ? 'white' : '#374151' }}>
                    {day}
                  </span>
                  {/* Add trip hint on hover for empty days */}
                  {tripsToday.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ backgroundColor: '#F0FDF4', color: '#1D9E75' }}>+ Trip</span>
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {tripsToday.slice(0, 3).map(t => {
                      const col = vehicleColorMap[t.vehicle_id] || VEHICLE_COLORS[0]
                      return (
                        <button
                          key={t.id}
                          onClick={e => { e.stopPropagation(); setTooltip({ trip: t, vehicleName: vehicleNameMap[t.vehicle_id] || 'Vehicle' }) }}
                          className="w-full text-left text-xs px-1.5 py-0.5 rounded font-medium truncate"
                          style={{ backgroundColor: col.bg, color: col.text, border: `1px solid ${col.border}` }}>
                          {t.guest_name}
                        </button>
                      )
                    })}
                    {tripsToday.length > 3 && (
                      <p className="text-xs px-1" style={{ color: '#94A3B8' }}>+{tripsToday.length - 3} more</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Trip detail tooltip */}
      {tooltip && (
        <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}
          onClick={() => setTooltip(null)}>
          <div className="bg-white rounded-xl p-5 max-w-xs w-full mx-4" style={{ boxShadow: '0 10px 25px rgba(0,0,0,0.15)', border: '1px solid #E2E8F0' }}
            onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3">
              <h3 className="font-semibold text-base" style={{ color: '#0F172A' }}>{tooltip.trip.guest_name}</h3>
              <button onClick={() => setTooltip(null)} className="p-2 text-gray-400 hover:text-gray-600 ml-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="space-y-2 text-sm" style={{ color: '#64748B' }}>
              <div className="flex justify-between">
                <span>Vehicle</span>
                <span className="font-medium" style={{ color: '#0F172A' }}>{tooltip.vehicleName}</span>
              </div>
              <div className="flex justify-between">
                <span>Dates</span>
                <span className="font-medium" style={{ color: '#0F172A' }}>{tooltip.trip.start_date} → {tooltip.trip.end_date}</span>
              </div>
              <div className="flex justify-between">
                <span>Net revenue</span>
                <span className="font-bold" style={{ color: '#1D9E75' }}>${Number(tooltip.trip.net_revenue).toFixed(0)}</span>
              </div>
              {tooltip.trip.host_rating && (
                <div className="flex justify-between">
                  <span>Rating</span>
                  <span className="font-medium" style={{ color: '#F59E0B' }}>★ {tooltip.trip.host_rating}</span>
                </div>
              )}
            </div>
            <a href="/trips" className="mt-3 block text-center text-xs font-medium hover:underline" style={{ color: '#1D9E75' }}>
              View in Trips →
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
