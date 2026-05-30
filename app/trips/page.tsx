'use client'
import { useEffect, useRef, useState } from 'react'
import type { Guest, Trip, TripLineItem, Vehicle } from '@/lib/types'

const EMPTY_FORM = {
  vehicle_id: '',
  guest_name: '',
  guest_id: '',
  start_date: '',
  end_date: '',
  daily_rate: 65,
  gross_revenue: 0,
  turo_fee_pct: 25,
  guest_rating: 5,
  host_rating: 5.0,
  miles_added: 0,
  start_mileage: '' as string | number,
  end_mileage: '' as string | number,
  actual_payout: '' as string | number,
  notes: '',
  status: 'completed' as const,
}

const STATUS_CFG: Record<string, { bg: string; text: string }> = {
  completed: { bg: '#F0FDF4', text: '#16A34A' },
  upcoming:  { bg: '#EFF6FF', text: '#2563EB' },
  active:    { bg: '#FFFBEB', text: '#D97706' },
  cancelled: { bg: '#F1F5F9', text: '#64748B' },
}

const FLAG_ICONS: Record<string, string> = {
  great: '★',
  caution: '⚠',
  blocked: '🚫',
}

const LINE_ITEM_TYPES = [
  { value: 'fee', label: 'Fee' },
  { value: 'delivery', label: 'Delivery fee' },
  { value: 'deposit', label: 'Non-refundable deposit' },
  { value: 'discount', label: 'Discount' },
  { value: 'other', label: 'Other' },
]

const inputCls = "w-full text-sm px-3 py-2 rounded-lg"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

export default function TripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [guests, setGuests] = useState<Guest[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [filter, setFilter] = useState('')

  // Guest combobox state
  const [guestSearch, setGuestSearch] = useState('')
  const [showGuestDropdown, setShowGuestDropdown] = useState(false)
  const guestInputRef = useRef<HTMLInputElement>(null)
  const guestDropdownRef = useRef<HTMLDivElement>(null)

  // Line items state
  const [lineItems, setLineItems] = useState<Omit<TripLineItem, 'id' | 'trip_id'>[]>([])
  const [newItem, setNewItem] = useState({ label: '', amount: 0, type: 'fee' as TripLineItem['type'] })
  const [showLineItems, setShowLineItems] = useState(false)

  useEffect(() => { load() }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        guestDropdownRef.current && !guestDropdownRef.current.contains(e.target as Node) &&
        guestInputRef.current && !guestInputRef.current.contains(e.target as Node)
      ) {
        setShowGuestDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function load() {
    const [t, v, g] = await Promise.all([
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
      fetch('/api/guests').then(r => r.json()),
    ])
    setTrips(Array.isArray(t) ? t : [])
    setVehicles(Array.isArray(v) ? v : [])
    setGuests(Array.isArray(g) ? g : [])
  }

  function calcBaseRevenue(f = form) {
    if (f.start_date && f.end_date && f.daily_rate) {
      const days = (new Date(f.end_date).getTime() - new Date(f.start_date).getTime()) / 86400000
      if (days > 0) return Number((days * f.daily_rate).toFixed(2))
    }
    return 0
  }

  function calcGross() {
    const base = calcBaseRevenue()
    if (base > 0) {
      const adj = lineItems.reduce((s, i) => i.type === 'discount' ? s - Math.abs(i.amount) : s + i.amount, 0)
      setForm(p => ({ ...p, gross_revenue: base + adj }))
    }
  }

  function milesAdded() {
    const s = Number(form.start_mileage)
    const e = Number(form.end_mileage)
    if (s > 0 && e > s) return e - s
    return null
  }

  function addLineItem() {
    if (!newItem.label || newItem.amount <= 0) return
    const updated = [...lineItems, { ...newItem }]
    setLineItems(updated)
    setNewItem({ label: '', amount: 0, type: 'fee' })
    const base = calcBaseRevenue()
    const adj = updated.reduce((s, i) => i.type === 'discount' ? s - Math.abs(i.amount) : s + i.amount, 0)
    setForm(p => ({ ...p, gross_revenue: base + adj }))
  }

  function removeLineItem(idx: number) {
    const updated = lineItems.filter((_, i) => i !== idx)
    setLineItems(updated)
    const base = calcBaseRevenue()
    const adj = updated.reduce((s, i) => i.type === 'discount' ? s - Math.abs(i.amount) : s + i.amount, 0)
    setForm(p => ({ ...p, gross_revenue: base + adj }))
  }

  // Guest combobox helpers
  const filteredGuests = guests.filter(g =>
    g.name.toLowerCase().includes(guestSearch.toLowerCase())
  )

  async function selectGuest(g: Guest) {
    setForm(p => ({ ...p, guest_id: g.id, guest_name: g.name }))
    setGuestSearch(g.name)
    setShowGuestDropdown(false)
  }

  async function createAndSelectGuest(name: string) {
    const res = await fetch('/api/guests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, flag: 'none' }),
    })
    const newGuest = await res.json()
    setGuests(prev => [newGuest, ...prev])
    setForm(p => ({ ...p, guest_id: newGuest.id, guest_name: newGuest.name }))
    setGuestSearch(newGuest.name)
    setShowGuestDropdown(false)
  }

  async function save() {
    setSaving(true)
    let receipt_url: string | undefined

    if (receiptFile) {
      setUploading(true)
      const fd = new FormData()
      fd.append('file', receiptFile)
      fd.append('bucket', 'trip-receipts')
      fd.append('folder', `trip-${Date.now()}`)
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const result = await res.json()
      if (result.url) receipt_url = result.url
      setUploading(false)
    }

    const payload: Record<string, unknown> = { ...form }
    if (form.start_mileage !== '') payload.start_mileage = Number(form.start_mileage)
    else delete payload.start_mileage
    if (form.end_mileage !== '') payload.end_mileage = Number(form.end_mileage)
    else delete payload.end_mileage
    if (form.actual_payout !== '') payload.actual_payout = Number(form.actual_payout)
    else delete payload.actual_payout
    if (receipt_url) payload.receipt_url = receipt_url
    if (lineItems.length > 0) payload.line_items = lineItems

    await fetch('/api/trips', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setSaving(false)
    setShowForm(false)
    setForm(EMPTY_FORM)
    setGuestSearch('')
    setLineItems([])
    setShowLineItems(false)
    setReceiptFile(null)
    load()
  }

  const filtered = filter ? trips.filter(t => t.vehicle_id === filter) : trips
  const totalNet = filtered.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
  const miles = milesAdded()

  const baseRevenue = calcBaseRevenue()
  const lineAdj = lineItems.reduce((s, i) => i.type === 'discount' ? s - Math.abs(i.amount) : s + i.amount, 0)
  const displayGross = baseRevenue + lineAdj
  const selectedGuest = form.guest_id ? guests.find(g => g.id === form.guest_id) : null

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Trips</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            {filtered.length} trip{filtered.length !== 1 ? 's' : ''} · <span style={{ color: '#1D9E75', fontWeight: 600 }}>${totalNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> net revenue
          </p>
        </div>
        <div className="flex gap-2">
          {vehicles.length > 1 && (
            <select value={filter} onChange={e => setFilter(e.target.value)}
              className="text-sm px-3 py-2 rounded-lg" style={inputStyle}>
              <option value="">All vehicles</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
            </select>
          )}
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
            style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            Log trip
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Log a trip</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Record your trip details and revenue</p>

          {/* Blocked guest warning */}
          {selectedGuest?.flag === 'blocked' && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3', color: '#E11D48' }}>
              🚫 This guest is flagged as BLOCKED. Proceed with caution.
            </div>
          )}
          {selectedGuest?.flag === 'caution' && (
            <div className="mb-4 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2"
              style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', color: '#D97706' }}>
              ⚠ This guest is flagged as CAUTION. Review their history before confirming.
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
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
                ref={guestInputRef}
                type="text"
                placeholder="Search or type name…"
                value={guestSearch}
                onChange={e => {
                  setGuestSearch(e.target.value)
                  setForm(p => ({ ...p, guest_name: e.target.value, guest_id: '' }))
                  setShowGuestDropdown(true)
                }}
                onFocus={() => setShowGuestDropdown(true)}
                className={inputCls} style={inputStyle}
              />
              {showGuestDropdown && guestSearch.length > 0 && (
                <div ref={guestDropdownRef}
                  className="absolute z-20 w-full mt-1 bg-white rounded-xl overflow-hidden"
                  style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto' }}>
                  {filteredGuests.length > 0 && filteredGuests.map(g => (
                    <button key={g.id} onMouseDown={() => selectGuest(g)}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-50">
                      <span className="font-medium" style={{ color: '#0F172A' }}>{g.name}</span>
                      {g.flag !== 'none' && (
                        <span className="text-xs" style={{ color: g.flag === 'blocked' ? '#E11D48' : g.flag === 'caution' ? '#D97706' : '#16A34A' }}>
                          {FLAG_ICONS[g.flag]}
                        </span>
                      )}
                      {g.total_trips > 0 && (
                        <span className="ml-auto text-xs" style={{ color: '#94A3B8' }}>{g.total_trips} trip{g.total_trips !== 1 ? 's' : ''}</span>
                      )}
                    </button>
                  ))}
                  {!filteredGuests.find(g => g.name.toLowerCase() === guestSearch.toLowerCase()) && (
                    <button onMouseDown={() => createAndSelectGuest(guestSearch)}
                      className="w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 hover:bg-gray-50"
                      style={{ borderTop: filteredGuests.length > 0 ? '1px solid #F1F5F9' : 'none' }}>
                      <span style={{ color: '#1D9E75', fontWeight: 500 }}>+ Create "{guestSearch}" as new guest</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Dates */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Start date</label>
              <input type="date" value={form.start_date}
                onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} onBlur={calcGross}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>End date</label>
              <input type="date" value={form.end_date}
                onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} onBlur={calcGross}
                className={inputCls} style={inputStyle}/>
            </div>
            {/* Revenue */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Daily rate ($)</label>
              <input type="number" value={form.daily_rate} onBlur={calcGross}
                onChange={e => setForm(p => ({ ...p, daily_rate: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Turo fee plan</label>
              <select value={form.turo_fee_pct} onChange={e => setForm(p => ({ ...p, turo_fee_pct: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}>
                <option value={10}>More earnings (90% kept)</option>
                <option value={20}>Balanced (80% kept)</option>
                <option value={30}>More peace of mind (70% kept)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Actual Turo payout received ($)</label>
              <input type="number" placeholder="Optional — reconcile with expected" value={form.actual_payout}
                onChange={e => setForm(p => ({ ...p, actual_payout: e.target.value }))}
                className={inputCls} style={inputStyle}/>
            </div>
            {/* Odometer */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Start mileage (odometer)</label>
              <input type="number" placeholder="e.g. 24500" value={form.start_mileage}
                onChange={e => setForm(p => ({ ...p, start_mileage: e.target.value }))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>End mileage (odometer)</label>
              <input type="number" placeholder="e.g. 24850" value={form.end_mileage}
                onChange={e => setForm(p => ({ ...p, end_mileage: e.target.value }))}
                className={inputCls} style={inputStyle}/>
              {miles !== null && (
                <p className="text-xs mt-1" style={{ color: '#64748B' }}>{miles.toLocaleString()} miles added</p>
              )}
            </div>
            {/* Ratings */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Guest rating (1–5)</label>
              <input type="number" min={1} max={5} value={form.guest_rating}
                onChange={e => setForm(p => ({ ...p, guest_rating: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Host rating received</label>
              <input type="number" min={1} max={5} step={0.1} value={form.host_rating}
                onChange={e => setForm(p => ({ ...p, host_rating: Number(e.target.value) }))}
                className={inputCls} style={inputStyle}/>
            </div>
            {/* Status */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Status</label>
              <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value as any }))}
                className={inputCls} style={inputStyle}>
                <option value="completed">Completed</option>
                <option value="upcoming">Upcoming</option>
                <option value="active">Active</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Notes</label>
              <input type="text" placeholder="Optional notes…" value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                className={inputCls} style={inputStyle}/>
            </div>
            {/* Receipt upload — full width */}
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Receipt / Document</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm px-3 py-2 rounded-lg"
                style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: 'white' }}/>
              {receiptFile && (
                <p className="text-xs mt-1" style={{ color: '#64748B' }}>{receiptFile.name} selected</p>
              )}
            </div>
          </div>

          {/* Line items section */}
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={() => setShowLineItems(p => !p)}
              className="flex items-center gap-2 text-sm font-medium mb-3"
              style={{ color: '#1D9E75' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {showLineItems
                  ? <><line x1="5" y1="12" x2="19" y2="12"/></>
                  : <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>}
              </svg>
              {showLineItems ? 'Hide' : 'Add'} line items (fees, discounts, deposits)
              {lineItems.length > 0 && (
                <span className="ml-1 text-xs px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ backgroundColor: '#F0FDF4', color: '#16A34A' }}>
                  {lineItems.length}
                </span>
              )}
            </button>

            {showLineItems && (
              <div className="space-y-2">
                {lineItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                    <span className="flex-1 font-medium" style={{ color: '#0F172A' }}>{item.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                      style={{ backgroundColor: (item.type === 'discount' || item.amount < 0) ? '#FFF1F2' : '#EFF6FF', color: (item.type === 'discount' || item.amount < 0) ? '#E11D48' : '#2563EB' }}>
                      {LINE_ITEM_TYPES.find(t => t.value === item.type)?.label}
                    </span>
                    <span className="font-semibold w-20 text-right"
                      style={{ color: (item.type === 'discount' || item.amount < 0) ? '#E11D48' : '#0F172A' }}>
                      {(item.type === 'discount' || item.amount < 0) ? '−' : '+'}${Math.abs(item.amount).toFixed(2)}
                    </span>
                    <button onClick={() => removeLineItem(idx)}
                      className="text-xs hover:opacity-70 ml-1" style={{ color: '#94A3B8' }}>×</button>
                  </div>
                ))}

                {/* Add item row */}
                <div className="flex gap-2 mt-2">
                  <input type="text" placeholder="Label (e.g. Delivery fee)"
                    value={newItem.label}
                    onChange={e => setNewItem(p => ({ ...p, label: e.target.value }))}
                    className="flex-1 text-sm px-3 py-2 rounded-lg" style={inputStyle}/>
                  <select value={newItem.type}
                    onChange={e => setNewItem(p => ({ ...p, type: e.target.value as any }))}
                    className="text-sm px-2 py-2 rounded-lg" style={{ ...inputStyle, width: 160 }}>
                    {LINE_ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input type="number" placeholder="Amount" step={0.01}
                    value={newItem.amount || ''}
                    onChange={e => setNewItem(p => ({ ...p, amount: Number(e.target.value) }))}
                    className="text-sm px-3 py-2 rounded-lg" style={{ ...inputStyle, width: 100 }}/>
                  <button onClick={addLineItem} disabled={!newItem.label || newItem.amount === 0}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                    style={{ backgroundColor: '#1D9E75' }}>
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Revenue preview */}
          {displayGross > 0 && (
            <div className="mt-4 p-4 rounded-xl" style={{ backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0' }}>
              {baseRevenue > 0 && (
                <div className="text-xs mb-2 space-y-1" style={{ color: '#065F46' }}>
                  {form.start_date && form.end_date && (
                    <div className="flex justify-between">
                      <span>Base ({Math.ceil((new Date(form.end_date).getTime() - new Date(form.start_date).getTime()) / 86400000)} days × ${form.daily_rate})</span>
                      <span>${baseRevenue.toFixed(2)}</span>
                    </div>
                  )}
                  {lineItems.map((item, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>{item.label}</span>
                      <span style={{ color: (item.type === 'discount' || item.amount < 0) ? '#E11D48' : '#065F46' }}>
                        {(item.type === 'discount' || item.amount < 0) ? '−' : '+'}${Math.abs(item.amount).toFixed(2)}
                      </span>
                    </div>
                  ))}
                  {lineItems.length > 0 && <div style={{ borderTop: '1px solid #BBF7D0', paddingTop: 4 }}/>}
                </div>
              )}
              <div className="flex items-center gap-3">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
                <p className="text-sm" style={{ color: '#065F46' }}>
                  Gross: <strong>${displayGross.toFixed(2)}</strong>
                  <span className="mx-2" style={{ color: '#86EFAC' }}>·</span>
                  Net: <strong>${(displayGross * (1 - form.turo_fee_pct / 100)).toFixed(2)}</strong>
                  <span className="ml-1 font-normal" style={{ color: '#059669' }}>after {form.turo_fee_pct}% Turo fee</span>
                </p>
              </div>
            </div>
          )}

          <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={save} disabled={saving || !form.vehicle_id || !form.guest_name || !form.start_date}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? (uploading ? 'Uploading receipt…' : 'Saving…') : 'Log trip'}
            </button>
            <button onClick={() => { setShowForm(false); setLineItems([]); setGuestSearch(''); setShowLineItems(false); setReceiptFile(null) }}
              className="px-5 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#F0FDF4' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
            </svg>
          </div>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No trips logged yet</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Log your first trip to start tracking revenue</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                {['Guest', 'Vehicle', 'Dates', 'Net Revenue', 'Payout', 'Rating', 'Status'].map(h => (
                  <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${['Net Revenue','Payout','Rating'].includes(h) ? 'text-right' : 'text-left'}`}
                    style={{ color: '#64748B', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const days = t.start_date && t.end_date
                  ? Math.ceil((new Date(t.end_date).getTime() - new Date(t.start_date).getTime()) / 86400000) : 0
                const sc = STATUS_CFG[t.status] || STATUS_CFG.cancelled
                const guestFlag = (t.guests as any)?.flag
                const hasExtras = Array.isArray((t as any).trip_line_items) && (t as any).trip_line_items.length > 0
                const expectedNet = Number(t.net_revenue)
                const paid = t.actual_payout != null ? Number(t.actual_payout) : null
                const discrepancy = paid != null ? paid - expectedNet : null
                return (
                  <tr key={t.id} className="data-table" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="px-4 py-3.5 font-semibold" style={{ color: '#0F172A' }}>
                      <span>{t.guest_name}</span>
                      {guestFlag && guestFlag !== 'none' && (
                        <span className="ml-1.5 text-xs"
                          style={{ color: guestFlag === 'blocked' ? '#E11D48' : guestFlag === 'caution' ? '#D97706' : '#16A34A' }}>
                          {FLAG_ICONS[guestFlag]}
                        </span>
                      )}
                      {t.receipt_url && (
                        <a href={t.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-xs font-normal underline" style={{ color: '#1D9E75' }}>
                          Receipt
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3.5" style={{ color: '#64748B' }}>
                      {(t.fleet as any)?.make} {(t.fleet as any)?.model}
                      {t.start_mileage && t.end_mileage && (
                        <div className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>
                          {Number(t.start_mileage).toLocaleString()}→{Number(t.end_mileage).toLocaleString()} mi
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5" style={{ color: '#64748B' }}>
                      <span>{t.start_date}</span>
                      <span className="mx-1.5" style={{ color: '#CBD5E1' }}>→</span>
                      <span>{t.end_date}</span>
                      <span className="ml-1.5 text-xs" style={{ color: '#94A3B8' }}>({days}d)</span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="font-bold" style={{ color: '#1D9E75' }}>
                        ${expectedNet.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                      {hasExtras && (
                        <span className="ml-1.5 text-xs" title="Has line items" style={{ color: '#94A3B8' }}>+extras</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {paid != null ? (
                        <div>
                          <span className="font-medium" style={{ color: '#0F172A' }}>${paid.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          {discrepancy != null && Math.abs(discrepancy) > 5 && (
                            <div className="text-xs mt-0.5" style={{ color: discrepancy < 0 ? '#DC2626' : '#16A34A' }}>
                              {discrepancy > 0 ? '+' : ''}{discrepancy.toFixed(0)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span style={{ color: '#E2E8F0' }}>—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {t.host_rating
                        ? <span className="font-medium" style={{ color: '#F59E0B' }}>★ {t.host_rating}</span>
                        : <span style={{ color: '#E2E8F0' }}>—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-center">
                        <span className="badge" style={{ backgroundColor: sc.bg, color: sc.text }}>{t.status}</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
