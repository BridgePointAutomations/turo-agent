'use client'
import { useEffect, useState } from 'react'
import type { Trip, Vehicle } from '@/lib/types'

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

export default function CalendarPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [tooltip, setTooltip] = useState<{ trip: Trip; vehicleName: string } | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
    ]).then(([t, v]) => {
      setTrips(Array.isArray(t) ? t : [])
      setVehicles(Array.isArray(v) ? v : [])
    })
  }, [])

  const vehicleColorMap = Object.fromEntries(
    vehicles.map((v, i) => [v.id, VEHICLE_COLORS[i % VEHICLE_COLORS.length]])
  )
  const vehicleNameMap = Object.fromEntries(
    vehicles.map(v => [v.id, `${v.year} ${v.make} ${v.model}`])
  )

  // Build a map: dateString → trips active on that date
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

  // Calendar grid
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

  const todayStr = now.toISOString().slice(0, 10)

  return (
    <div className="p-4 md:p-7 max-w-5xl mx-auto" onClick={() => setTooltip(null)}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Calendar</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Booking availability across your fleet</p>
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
                <div key={i} className="min-h-[56px] md:min-h-[80px] p-2 relative"
                  style={{ borderRight: i < 6 ? '1px solid #F1F5F9' : 'none', backgroundColor: isToday ? '#F0FDF4' : 'white' }}>
                  <span className={`text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'text-white' : ''}`}
                    style={{ backgroundColor: isToday ? '#1D9E75' : 'transparent', color: isToday ? 'white' : '#374151' }}>
                    {day}
                  </span>
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

      {/* Tooltip */}
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
          </div>
        </div>
      )}
    </div>
  )
}
