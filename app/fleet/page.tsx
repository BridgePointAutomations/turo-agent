'use client'
import { useEffect, useState } from 'react'
import type { Vehicle } from '@/lib/types'

const EMPTY: Partial<Vehicle> = { make:'', model:'', year: new Date().getFullYear(), color:'', daily_rate:65, current_mileage:0, status:'active', notes:'' }

const inputCls = "w-full text-sm px-3 py-2 rounded-lg transition-all"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  active:      { bg: '#F0FDF4', text: '#16A34A', label: 'Active' },
  inactive:    { bg: '#F1F5F9', text: '#64748B', label: 'Inactive' },
  maintenance: { bg: '#FFFBEB', text: '#D97706', label: 'Maintenance' },
}

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Vehicle>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/fleet')
    const data = await res.json()
    setVehicles(Array.isArray(data) ? data : [])
  }

  async function save() {
    setSaving(true)
    const method = editing ? 'PATCH' : 'POST'
    const body = editing ? { ...form, id: editing } : form
    await fetch('/api/fleet', { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
    setSaving(false); setShowForm(false); setEditing(null); setForm(EMPTY); load()
  }

  async function remove(id: string) {
    if (!confirm('Remove this vehicle? All related data will be deleted.')) return
    await fetch('/api/fleet', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    load()
  }

  function startEdit(v: Vehicle) { setForm(v); setEditing(v.id); setShowForm(true) }

  const fields = [
    { label: 'Make', key: 'make', type: 'text', placeholder: 'Toyota' },
    { label: 'Model', key: 'model', type: 'text', placeholder: 'Camry' },
    { label: 'Year', key: 'year', type: 'number', placeholder: '2022' },
    { label: 'Color', key: 'color', type: 'text', placeholder: 'Silver' },
    { label: 'Daily rate ($)', key: 'daily_rate', type: 'number', placeholder: '65' },
    { label: 'Current mileage', key: 'current_mileage', type: 'number', placeholder: '25000' },
    { label: 'License plate', key: 'license_plate', type: 'text', placeholder: 'ABC-1234' },
    { label: 'Turo listing ID', key: 'turo_listing_id', type: 'text', placeholder: 'Optional' },
  ]

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Fleet</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} in your fleet</p>
        </div>
        <button
          onClick={() => { setForm(EMPTY); setEditing(null); setShowForm(true) }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add vehicle
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>{editing ? 'Edit vehicle' : 'Add new vehicle'}</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Fill in your vehicle details below</p>
          <div className="grid grid-cols-2 gap-4">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>{f.label}</label>
                <input
                  type={f.type}
                  placeholder={f.placeholder}
                  value={(form as any)[f.key] || ''}
                  onChange={e => setForm(prev => ({ ...prev, [f.key]: f.type === 'number' ? Number(e.target.value) : e.target.value }))}
                  className={inputCls}
                  style={inputStyle}
                  onFocus={e => { e.target.style.borderColor = '#1D9E75'; e.target.style.boxShadow = '0 0 0 3px rgba(29,158,117,0.12)'; }}
                  onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            ))}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Status</label>
              <select value={form.status || 'active'} onChange={e => setForm(prev => ({ ...prev, status: e.target.value as any }))}
                className={inputCls} style={inputStyle}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="maintenance">In maintenance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Notes</label>
              <input type="text" placeholder="Any notes…" value={form.notes || ''}
                onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
                className={inputCls} style={inputStyle}
                onFocus={e => { e.target.style.borderColor = '#1D9E75'; e.target.style.boxShadow = '0 0 0 3px rgba(29,158,117,0.12)'; }}
                onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={save} disabled={saving || !form.make || !form.model}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Add vehicle'}
            </button>
            <button onClick={() => { setShowForm(false); setEditing(null) }}
              className="px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {vehicles.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#EFF6FF' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
              <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
            </svg>
          </div>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No vehicles in your fleet</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Add your first Turo listing to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {vehicles.map(v => {
            const sc = STATUS_CFG[v.status] || STATUS_CFG.inactive
            return (
              <div key={v.id} className="bg-white rounded-xl p-5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
                        <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
                      </svg>
                    </div>
                    <div>
                      <h3 className="font-semibold text-base" style={{ color: '#0F172A' }}>{v.year} {v.make} {v.model}</h3>
                      <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>
                        {v.color && `${v.color}`}{v.license_plate ? ` · ${v.license_plate}` : ''}
                      </p>
                    </div>
                  </div>
                  <span className="badge" style={{ backgroundColor: sc.bg, color: sc.text }}>{sc.label}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {[
                    { label: 'Daily rate', value: `$${v.daily_rate}` },
                    { label: 'Mileage', value: v.current_mileage.toLocaleString() },
                    { label: 'Listing', value: v.turo_listing_id ? `#${v.turo_listing_id}` : '—' },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ backgroundColor: '#F8FAFC' }}>
                      <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{s.value}</p>
                      <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
                    </div>
                  ))}
                </div>
                {v.notes && (
                  <p className="text-xs italic mb-4 px-3 py-2 rounded-lg" style={{ color: '#64748B', backgroundColor: '#F8FAFC' }}>
                    "{v.notes}"
                  </p>
                )}
                <div className="flex gap-2 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                  <button onClick={() => startEdit(v)}
                    className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors hover:opacity-90"
                    style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: '#F8FAFC' }}>
                    Edit details
                  </button>
                  <button onClick={() => remove(v.id)}
                    className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors"
                    style={{ border: '1px solid #FEE2E2', color: '#DC2626', backgroundColor: '#FFF5F5' }}>
                    Remove
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
