'use client'
import { useEffect, useState } from 'react'
import type { MaintenanceItem, Vehicle } from '@/lib/types'

const STATUS_CFG = {
  ok:        { bg: '#F0FDF4', text: '#16A34A', dot: '#22C55E', label: 'OK' },
  due_soon:  { bg: '#FFFBEB', text: '#D97706', dot: '#F59E0B', label: 'Due soon' },
  overdue:   { bg: '#FFF1F2', text: '#E11D48', dot: '#F43F5E', label: 'Overdue' },
  completed: { bg: '#F1F5F9', text: '#64748B', dot: '#94A3B8', label: 'Completed' },
}

const inputCls = "w-full text-sm px-3 py-2 rounded-lg"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

export default function MaintenancePage() {
  const [items, setItems] = useState<MaintenanceItem[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ vehicle_id: '', service_type: '', interval_miles: 5000, interval_days: 180, last_service_date: '', last_service_mileage: 0, notes: '', cost: '' })
  const [saving, setSaving] = useState(false)
  const [filter, setFilter] = useState<string>('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<Partial<Omit<MaintenanceItem, 'cost'> & { cost: string }>>({})
  const [editSaving, setEditSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const [m, v] = await Promise.all([
      fetch('/api/maintenance').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
    ])
    setItems(Array.isArray(m) ? m : [])
    setVehicles(Array.isArray(v) ? v : [])
  }

  async function markComplete(item: MaintenanceItem) {
    const today = new Date().toISOString().slice(0, 10)
    const vehicle = vehicles.find(v => v.id === item.vehicle_id)
    const nextMileage = item.interval_miles && vehicle
      ? vehicle.current_mileage + item.interval_miles
      : item.next_due_mileage
    const nextDate = item.interval_days
      ? new Date(Date.now() + item.interval_days * 86400000).toISOString().slice(0, 10)
      : undefined

    await fetch('/api/maintenance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: item.id, status: 'ok', last_service_date: today, last_service_mileage: vehicle?.current_mileage, next_due_date: nextDate, next_due_mileage: nextMileage }),
    })
    load()
  }

  async function addCustom() {
    setSaving(true)
    await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        cost: form.cost ? Number(form.cost) : null,
        status: 'ok',
      }),
    })
    setSaving(false)
    setShowForm(false)
    setForm({ vehicle_id: '', service_type: '', interval_miles: 5000, interval_days: 180, last_service_date: '', last_service_mileage: 0, notes: '', cost: '' })
    load()
  }

  function startEdit(item: MaintenanceItem) {
    setEditingId(item.id)
    setEditForm({
      service_type: item.service_type,
      interval_miles: item.interval_miles,
      interval_days: item.interval_days,
      last_service_date: item.last_service_date ?? '',
      last_service_mileage: item.last_service_mileage,
      next_due_date: item.next_due_date ?? '',
      next_due_mileage: item.next_due_mileage,
      status: item.status,
      notes: item.notes ?? '',
      cost: item.cost != null ? String(item.cost) : '',
    })
  }

  async function saveEdit(id: string) {
    setEditSaving(true)
    const payload = {
      id,
      ...editForm,
      cost: editForm.cost !== '' ? Number(editForm.cost) : null,
    }
    await fetch('/api/maintenance', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    setEditSaving(false)
    setEditingId(null)
    load()
  }

  async function deleteItem(id: string) {
    await fetch(`/api/maintenance?id=${id}`, { method: 'DELETE' })
    setConfirmDelete(null)
    load()
  }

  const filtered = filter === 'all' ? items
    : filter === 'alerts' ? items.filter(i => i.status === 'overdue' || i.status === 'due_soon')
    : items.filter(i => i.vehicle_id === filter)

  const alertCount = items.filter(i => i.status === 'overdue' || i.status === 'due_soon').length

  const filterTabs = [
    { key: 'all', label: 'All', count: items.length },
    { key: 'alerts', label: 'Alerts', count: alertCount },
    ...vehicles.map(v => ({ key: v.id, label: `${v.make} ${v.model}`, count: items.filter(i => i.vehicle_id === v.id).length })),
  ]

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Maintenance</h1>
          <p className="text-sm mt-1" style={{ color: alertCount > 0 ? '#DC2626' : '#64748B' }}>
            {alertCount > 0
              ? `${alertCount} item${alertCount > 1 ? 's' : ''} need attention`
              : 'All maintenance up to date'}
          </p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white hover:opacity-90"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add service item
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {filterTabs.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="text-sm px-3.5 py-2 rounded-lg font-medium transition-all flex items-center gap-2"
            style={filter === f.key
              ? { backgroundColor: '#1D9E75', color: 'white', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }
              : { border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
            {f.label}
            <span className="text-xs rounded-full px-1.5 py-0.5 min-w-5 text-center"
              style={filter === f.key
                ? { backgroundColor: 'rgba(255,255,255,0.2)', color: 'white' }
                : { backgroundColor: '#F1F5F9', color: '#64748B' }}>
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Add service item</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Track a recurring maintenance task</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Vehicle</label>
              <select value={form.vehicle_id} onChange={e => setForm(p => ({...p, vehicle_id: e.target.value}))}
                className={inputCls} style={inputStyle}>
                <option value="">Select vehicle</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.year} {v.make} {v.model}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Service type</label>
              <input type="text" placeholder="e.g. Cabin air filter" value={form.service_type}
                onChange={e => setForm(p => ({...p, service_type: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Interval (miles)</label>
              <input type="number" value={form.interval_miles}
                onChange={e => setForm(p => ({...p, interval_miles: Number(e.target.value)}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Interval (days)</label>
              <input type="number" value={form.interval_days}
                onChange={e => setForm(p => ({...p, interval_days: Number(e.target.value)}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Last service date</label>
              <input type="date" value={form.last_service_date}
                onChange={e => setForm(p => ({...p, last_service_date: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Last service mileage</label>
              <input type="number" value={form.last_service_mileage}
                onChange={e => setForm(p => ({...p, last_service_mileage: Number(e.target.value)}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Cost ($)</label>
              <input type="number" min={0} step={0.01} placeholder="Optional" value={form.cost}
                onChange={e => setForm(p => ({...p, cost: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Notes</label>
              <input type="text" placeholder="Optional notes…" value={form.notes}
                onChange={e => setForm(p => ({...p, notes: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={addCustom} disabled={saving || !form.vehicle_id || !form.service_type}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? 'Saving…' : 'Add service item'}
            </button>
            <button onClick={() => setShowForm(false)}
              className="px-5 py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Items list */}
      <div className="space-y-2.5">
        {filtered.map(item => {
          const cfg = STATUS_CFG[item.status] || STATUS_CFG.ok
          const vehicle = vehicles.find(v => v.id === item.vehicle_id)
          const milesUntilDue = item.next_due_mileage && vehicle
            ? item.next_due_mileage - vehicle.current_mileage : null
          const isAlert = item.status === 'overdue' || item.status === 'due_soon'
          const isEditing = editingId === item.id

          return (
            <div key={item.id} className="bg-white rounded-xl"
              style={{ border: `1px solid ${isAlert ? (item.status === 'overdue' ? '#FECDD3' : '#FDE68A') : '#E2E8F0'}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>

              {/* Confirm delete */}
              {confirmDelete === item.id && (
                <div className="p-4 rounded-xl flex items-center justify-between gap-3"
                  style={{ backgroundColor: '#FFF1F2', border: '1px solid #FECDD3' }}>
                  <p className="text-sm font-medium" style={{ color: '#E11D48' }}>
                    Delete {item.service_type} for {(item.fleet as any)?.make} {(item.fleet as any)?.model}?
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => deleteItem(item.id)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-white"
                      style={{ backgroundColor: '#E11D48' }}>Delete</button>
                    <button onClick={() => setConfirmDelete(null)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>Cancel</button>
                  </div>
                </div>
              )}

              {confirmDelete !== item.id && !isEditing && (
                <div className="p-4 flex items-center gap-4">
                  {/* Status dot */}
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cfg.bg }}>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cfg.dot }} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm" style={{ color: '#0F172A' }}>{item.service_type}</p>
                      <span className="badge" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{cfg.label}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs" style={{ color: '#64748B' }}>
                      <span className="font-medium" style={{ color: '#374151' }}>
                        {(item.fleet as any)?.make} {(item.fleet as any)?.model}
                      </span>
                      {item.last_service_date && <span>Last: {item.last_service_date}</span>}
                      {item.next_due_mileage && <span>Due at {item.next_due_mileage.toLocaleString()} mi</span>}
                      {milesUntilDue !== null && milesUntilDue > 0 && (
                        <span style={{ color: '#1D9E75', fontWeight: 500 }}>{milesUntilDue.toLocaleString()} mi to go</span>
                      )}
                      {milesUntilDue !== null && milesUntilDue <= 0 && (
                        <span style={{ color: '#DC2626', fontWeight: 500 }}>{Math.abs(milesUntilDue).toLocaleString()} mi overdue</span>
                      )}
                      {item.next_due_date && <span>By: {item.next_due_date}</span>}
                      {item.cost != null && <span style={{ color: '#1D9E75', fontWeight: 500 }}>Cost: ${Number(item.cost).toFixed(2)}</span>}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isAlert && (
                      <button onClick={() => markComplete(item)}
                        className="flex items-center gap-1.5 text-xs px-3.5 py-2 rounded-lg font-medium transition-all hover:opacity-80"
                        style={{ backgroundColor: '#F0FDF4', color: '#16A34A', border: '1px solid #BBF7D0' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                        Mark done
                      </button>
                    )}
                    <button onClick={() => startEdit(item)}
                      className="p-1.5 rounded-lg hover:opacity-70"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}
                      title="Edit">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                    <button onClick={() => setConfirmDelete(item.id)}
                      className="p-1.5 rounded-lg hover:opacity-70"
                      style={{ border: '1px solid #FECDD3', color: '#E11D48', backgroundColor: '#FFF1F2' }}
                      title="Delete">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* Inline edit form */}
              {isEditing && (
                <div className="p-5">
                  <p className="text-xs font-semibold mb-3" style={{ color: '#64748B' }}>EDITING: {item.service_type}</p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Service type</label>
                      <input type="text" value={editForm.service_type ?? ''} onChange={e => setEditForm(p => ({...p, service_type: e.target.value}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Status</label>
                      <select value={editForm.status ?? 'ok'} onChange={e => setEditForm(p => ({...p, status: e.target.value as any}))}
                        className={inputCls} style={inputStyle}>
                        <option value="ok">OK</option>
                        <option value="due_soon">Due soon</option>
                        <option value="overdue">Overdue</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Cost ($)</label>
                      <input type="number" min={0} step={0.01} placeholder="Optional" value={editForm.cost ?? ''}
                        onChange={e => setEditForm(p => ({...p, cost: e.target.value}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Interval (miles)</label>
                      <input type="number" value={editForm.interval_miles ?? ''} onChange={e => setEditForm(p => ({...p, interval_miles: Number(e.target.value)}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Interval (days)</label>
                      <input type="number" value={editForm.interval_days ?? ''} onChange={e => setEditForm(p => ({...p, interval_days: Number(e.target.value)}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Last service date</label>
                      <input type="date" value={editForm.last_service_date ?? ''} onChange={e => setEditForm(p => ({...p, last_service_date: e.target.value}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Last service mileage</label>
                      <input type="number" value={editForm.last_service_mileage ?? ''} onChange={e => setEditForm(p => ({...p, last_service_mileage: Number(e.target.value)}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Next due date</label>
                      <input type="date" value={editForm.next_due_date ?? ''} onChange={e => setEditForm(p => ({...p, next_due_date: e.target.value}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Next due mileage</label>
                      <input type="number" value={editForm.next_due_mileage ?? ''} onChange={e => setEditForm(p => ({...p, next_due_mileage: Number(e.target.value)}))}
                        className={inputCls} style={inputStyle}/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Notes</label>
                    <input type="text" placeholder="Optional notes…" value={editForm.notes ?? ''} onChange={e => setEditForm(p => ({...p, notes: e.target.value}))}
                      className={inputCls} style={inputStyle}/>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button onClick={() => saveEdit(item.id)} disabled={editSaving}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40"
                      style={{ backgroundColor: '#1D9E75' }}>
                      {editSaving ? 'Saving…' : 'Save changes'}
                    </button>
                    <button onClick={() => setEditingId(null)}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
            <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FFFBEB' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
            </div>
            <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No maintenance items</p>
            <p className="text-sm" style={{ color: '#64748B' }}>
              {filter === 'alerts' ? 'No alerts — everything is up to date!' : 'Add service items to track your fleet maintenance'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
