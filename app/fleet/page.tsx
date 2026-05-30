'use client'
import { useEffect, useState } from 'react'
import type { Vehicle, VehicleDocument, DocumentType, Trip } from '@/lib/types'

const DOC_TYPES: DocumentType[] = ['insurance', 'registration', 'title', 'inspection', 'other']
const DOC_CFG: Record<DocumentType, { bg: string; text: string }> = {
  insurance:    { bg: '#FFF1F2', text: '#E11D48' },
  registration: { bg: '#EFF6FF', text: '#2563EB' },
  title:        { bg: '#F5F3FF', text: '#7C3AED' },
  inspection:   { bg: '#FFFBEB', text: '#D97706' },
  other:        { bg: '#F1F5F9', text: '#64748B' },
}

const EMPTY: Partial<Vehicle> = { make:'', model:'', year: new Date().getFullYear(), color:'', daily_rate:65, current_mileage:0, status:'active', notes:'' }

const inputCls = "w-full text-sm px-3 py-2 rounded-lg transition-all"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

const STATUS_CFG: Record<string, { bg: string; text: string; label: string }> = {
  active:      { bg: '#F0FDF4', text: '#16A34A', label: 'Active' },
  inactive:    { bg: '#F1F5F9', text: '#64748B', label: 'Inactive' },
  maintenance: { bg: '#FFFBEB', text: '#D97706', label: 'Maintenance' },
}

const DOC_EMPTY = { name: '', document_type: 'insurance' as DocumentType, expiry_date: '', notes: '' }

export default function FleetPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<Partial<Vehicle>>(EMPTY)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)

  // Documents vault state
  const [docs, setDocs] = useState<Record<string, VehicleDocument[]>>({})
  const [expandedDocs, setExpandedDocs] = useState<string | null>(null)
  const [showDocForm, setShowDocForm] = useState<string | null>(null)
  // ROI panel state
  const [expandedRoi, setExpandedRoi] = useState<string | null>(null)
  const [vehicleTrips, setVehicleTrips] = useState<Record<string, Trip[]>>({})
  const [docForm, setDocForm] = useState(DOC_EMPTY)
  const [docFile, setDocFile] = useState<File | null>(null)
  const [savingDoc, setSavingDoc] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const res = await fetch('/api/fleet')
    const data = await res.json()
    setVehicles(Array.isArray(data) ? data : [])
  }

  async function loadDocs(vehicleId: string) {
    const res = await fetch(`/api/documents?vehicle_id=${vehicleId}`)
    const data = await res.json()
    setDocs(prev => ({ ...prev, [vehicleId]: Array.isArray(data) ? data : [] }))
  }

  function toggleDocs(vehicleId: string) {
    if (expandedDocs === vehicleId) {
      setExpandedDocs(null)
      setShowDocForm(null)
    } else {
      setExpandedDocs(vehicleId)
      setShowDocForm(null)
      loadDocs(vehicleId)
    }
  }

  async function saveDoc(vehicleId: string) {
    if (!docFile) return
    setSavingDoc(true)
    setUploadingDoc(true)
    const fd = new FormData()
    fd.append('file', docFile)
    fd.append('bucket', 'vehicle-docs')
    fd.append('folder', vehicleId)
    const uploadRes = await fetch('/api/upload', { method: 'POST', body: fd })
    const { url, path } = await uploadRes.json()
    setUploadingDoc(false)

    if (url) {
      await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicle_id: vehicleId,
          name: docForm.name || docFile.name,
          document_type: docForm.document_type,
          storage_path: path,
          public_url: url,
          expiry_date: docForm.expiry_date || null,
          notes: docForm.notes || null,
        }),
      })
      setDocForm(DOC_EMPTY)
      setDocFile(null)
      setShowDocForm(null)
      loadDocs(vehicleId)
    }
    setSavingDoc(false)
  }

  async function removeDoc(doc: VehicleDocument) {
    await fetch('/api/documents', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: doc.id, storage_path: doc.storage_path, bucket: 'vehicle-docs' }),
    })
    setConfirmDeleteDoc(null)
    loadDocs(doc.vehicle_id)
  }

  function isExpiringSoon(date?: string) {
    if (!date) return false
    const expiry = new Date(date)
    const thirtyDays = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    return expiry <= thirtyDays
  }

  async function save() {
    setSaving(true)
    const method = editing ? 'PATCH' : 'POST'
    const body = editing ? { ...form, id: editing } : form
    await fetch('/api/fleet', { method, headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) })
    setSaving(false); setShowForm(false); setEditing(null); setForm(EMPTY); load()
  }

  async function remove(id: string) {
    await fetch('/api/fleet', { method: 'DELETE', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    setConfirmDelete(null)
    setShowForm(false)
    setEditing(null)
    load()
  }

  function startEdit(v: Vehicle) { setForm(v); setEditing(v.id); setShowForm(true) }

  async function toggleRoi(vehicleId: string) {
    if (expandedRoi === vehicleId) { setExpandedRoi(null); return }
    setExpandedRoi(vehicleId)
    if (!vehicleTrips[vehicleId]) {
      const data = await fetch(`/api/trips?vehicle_id=${vehicleId}`).then(r => r.json())
      setVehicleTrips(prev => ({ ...prev, [vehicleId]: Array.isArray(data) ? data : [] }))
    }
  }

  function calcRoi(v: Vehicle, trips: Trip[]) {
    const now = new Date()
    const purchaseDate = v.purchase_date ? new Date(v.purchase_date) : null
    const monthsOwned = purchaseDate
      ? Math.max(1, (now.getFullYear() - purchaseDate.getFullYear()) * 12 + now.getMonth() - purchaseDate.getMonth())
      : null
    const yearsOwned = monthsOwned != null ? monthsOwned / 12 : null

    const financeTotal = (v.financing_monthly ?? 0) * (v.financing_months ?? 0)
    const depreciationTotal = yearsOwned != null ? (v.depreciation_annual ?? 0) * yearsOwned : 0
    const totalInvested = (v.purchase_price ?? 0) + financeTotal + depreciationTotal

    const totalEarned = trips.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
    const netPosition = totalEarned - totalInvested
    const recoveredPct = totalInvested > 0 ? Math.min(100, (totalEarned / totalInvested) * 100) : 0

    const avgMonthlyNet = monthsOwned && monthsOwned > 0 ? totalEarned / monthsOwned : null
    const remaining = totalInvested - totalEarned
    const monthsToPayoff = avgMonthlyNet && avgMonthlyNet > 0 && remaining > 0
      ? Math.ceil(remaining / avgMonthlyNet) : null
    const payoffDate = monthsToPayoff != null
      ? new Date(now.getFullYear(), now.getMonth() + monthsToPayoff, 1)
        .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : totalEarned >= totalInvested ? 'Paid off' : null

    return { totalInvested, totalEarned, netPosition, recoveredPct, payoffDate, monthsToPayoff }
  }

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

          {/* ROI Tracking section */}
          <div className="mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748B' }}>
              ROI Tracking <span className="normal-case font-normal ml-1" style={{ color: '#94A3B8' }}>(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Purchase price ($)</label>
                <input type="number" placeholder="e.g. 25000" value={(form as any).purchase_price || ''}
                  onChange={e => setForm(prev => ({ ...prev, purchase_price: e.target.value ? Number(e.target.value) : undefined }))}
                  className={inputCls} style={inputStyle}/>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Purchase date</label>
                <input type="date" value={(form as any).purchase_date || ''}
                  onChange={e => setForm(prev => ({ ...prev, purchase_date: e.target.value || undefined }))}
                  className={inputCls} style={inputStyle}/>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Monthly financing payment ($)</label>
                <input type="number" placeholder="e.g. 350" value={(form as any).financing_monthly || ''}
                  onChange={e => setForm(prev => ({ ...prev, financing_monthly: e.target.value ? Number(e.target.value) : undefined }))}
                  className={inputCls} style={inputStyle}/>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Financing term (months)</label>
                <input type="number" placeholder="e.g. 60" value={(form as any).financing_months || ''}
                  onChange={e => setForm(prev => ({ ...prev, financing_months: e.target.value ? Number(e.target.value) : undefined }))}
                  className={inputCls} style={inputStyle}/>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Annual depreciation ($)</label>
                <input type="number" placeholder="e.g. 2000" value={(form as any).depreciation_annual || ''}
                  onChange={e => setForm(prev => ({ ...prev, depreciation_annual: e.target.value ? Number(e.target.value) : undefined }))}
                  className={inputCls} style={inputStyle}/>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
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
            {editing && (
              confirmDelete === editing ? (
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs" style={{ color: '#64748B' }}>Delete this vehicle?</span>
                  <button onClick={() => remove(editing)}
                    className="text-xs px-2.5 py-1 rounded-md font-medium text-white"
                    style={{ backgroundColor: '#DC2626' }}>
                    Confirm
                  </button>
                  <button onClick={() => setConfirmDelete(null)}
                    className="text-xs px-2.5 py-1 rounded-md font-medium"
                    style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmDelete(editing)}
                  className="ml-auto text-xs font-medium transition-colors hover:underline"
                  style={{ color: '#DC2626' }}>
                  Delete vehicle
                </button>
              )
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {vehicles.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <div className="w-14 h-14 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: '#EFF6FF' }}>
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
                    <div className="w-11 h-11 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
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
                  <button onClick={() => toggleDocs(v.id)}
                    className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors"
                    style={{ border: '1px solid #E2E8F0', color: expandedDocs === v.id ? '#1D9E75' : '#374151', backgroundColor: expandedDocs === v.id ? '#F0FDF4' : '#F8FAFC' }}>
                    Documents
                  </button>
                  <button onClick={() => toggleRoi(v.id)}
                    className="flex-1 text-xs py-2 rounded-lg font-medium transition-colors"
                    style={{ border: '1px solid #E2E8F0', color: expandedRoi === v.id ? '#7C3AED' : '#374151', backgroundColor: expandedRoi === v.id ? '#F5F3FF' : '#F8FAFC' }}>
                    ROI
                  </button>
                </div>

                {/* Documents vault */}
                {expandedDocs === v.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748B' }}>Documents</p>
                      <button onClick={() => setShowDocForm(showDocForm === v.id ? null : v.id)}
                        className="text-xs px-2.5 py-1 rounded-lg font-medium"
                        style={{ backgroundColor: '#F0FDF4', color: '#1D9E75', border: '1px solid #BBF7D0' }}>
                        + Upload
                      </button>
                    </div>

                    {showDocForm === v.id && (
                      <div className="mb-3 p-3 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                        <div className="grid grid-cols-2 gap-2 mb-2">
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Name</label>
                            <input type="text" placeholder="e.g. Insurance Card 2025"
                              value={docForm.name} onChange={e => setDocForm(p => ({ ...p, name: e.target.value }))}
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg" style={{ border: '1px solid #E2E8F0', backgroundColor: 'white', color: '#0F172A' }}/>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Type</label>
                            <select value={docForm.document_type} onChange={e => setDocForm(p => ({ ...p, document_type: e.target.value as DocumentType }))}
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg capitalize" style={{ border: '1px solid #E2E8F0', backgroundColor: 'white', color: '#0F172A' }}>
                              {DOC_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>Expiry date</label>
                            <input type="date" value={docForm.expiry_date} onChange={e => setDocForm(p => ({ ...p, expiry_date: e.target.value }))}
                              className="w-full text-xs px-2.5 py-1.5 rounded-lg" style={{ border: '1px solid #E2E8F0', backgroundColor: 'white', color: '#0F172A' }}/>
                          </div>
                          <div>
                            <label className="block text-xs font-medium mb-1" style={{ color: '#374151' }}>File</label>
                            <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                              onChange={e => setDocFile(e.target.files?.[0] ?? null)}
                              className="w-full text-xs" style={{ color: '#374151' }}/>
                          </div>
                        </div>
                        <button onClick={() => saveDoc(v.id)} disabled={savingDoc || !docFile}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium text-white disabled:opacity-40"
                          style={{ backgroundColor: '#1D9E75' }}>
                          {savingDoc ? (uploadingDoc ? 'Uploading…' : 'Saving…') : 'Save document'}
                        </button>
                      </div>
                    )}

                    {(docs[v.id] || []).length === 0 ? (
                      <p className="text-xs text-center py-3" style={{ color: '#94A3B8' }}>No documents uploaded yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {(docs[v.id] || []).map(d => {
                          const cfg = DOC_CFG[d.document_type] || DOC_CFG.other
                          const expiring = isExpiringSoon(d.expiry_date)
                          return (
                            <div key={d.id} className="flex items-center justify-between px-2.5 py-2 rounded-lg"
                              style={{ backgroundColor: expiring ? '#FFFBEB' : '#F8FAFC', border: `1px solid ${expiring ? '#FDE68A' : '#E2E8F0'}` }}>
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-xs font-medium px-1.5 py-0.5 rounded capitalize flex-shrink-0"
                                  style={{ backgroundColor: cfg.bg, color: cfg.text }}>
                                  {d.document_type}
                                </span>
                                <a href={d.public_url} target="_blank" rel="noopener noreferrer"
                                  className="text-xs font-medium truncate underline" style={{ color: '#0F172A' }}>
                                  {d.name}
                                </a>
                                {d.expiry_date && (
                                  <span className="text-xs flex-shrink-0 flex items-center gap-1" style={{ color: expiring ? '#D97706' : '#94A3B8' }}>
                                    {expiring && (
                                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                                        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                                      </svg>
                                    )}
                                    exp {d.expiry_date}
                                  </span>
                                )}
                              </div>
                              {confirmDeleteDoc === d.id ? (
                                <div className="flex items-center gap-1 flex-shrink-0 ml-2" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => removeDoc(d)}
                                    className="text-xs px-1.5 py-0.5 rounded font-medium text-white"
                                    style={{ backgroundColor: '#DC2626' }}>
                                    Delete
                                  </button>
                                  <button onClick={() => setConfirmDeleteDoc(null)}
                                    className="text-xs px-1.5 py-0.5 rounded font-medium"
                                    style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}>
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button onClick={() => setConfirmDeleteDoc(d.id)} className="flex-shrink-0 ml-2 p-1 rounded hover:bg-red-50">
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                  </svg>
                                </button>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ROI panel */}
                {expandedRoi === v.id && (() => {
                  const trips = vehicleTrips[v.id]
                  if (!trips) return (
                    <div className="mt-3 pt-3 text-xs text-center py-2" style={{ borderTop: '1px solid #F1F5F9', color: '#94A3B8' }}>
                      Loading…
                    </div>
                  )
                  const hasPurchasePrice = v.purchase_price != null && v.purchase_price > 0
                  const roi = hasPurchasePrice ? calcRoi(v, trips) : null
                  return (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid #F1F5F9' }}>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#7C3AED' }}>ROI Tracker</p>
                      {!hasPurchasePrice ? (
                        <div className="flex items-center justify-between px-3 py-3 rounded-lg"
                          style={{ backgroundColor: '#F5F3FF', border: '1px solid #DDD6FE' }}>
                          <p className="text-xs" style={{ color: '#6D28D9' }}>
                            Set a purchase price in Edit details to track ROI.
                          </p>
                          <button onClick={() => startEdit(v)}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium ml-3 flex-shrink-0"
                            style={{ backgroundColor: '#7C3AED', color: 'white' }}>
                            Set up
                          </button>
                        </div>
                      ) : roi && (
                        <div>
                          <div className="mb-3">
                            <div className="flex items-center justify-between text-xs mb-1">
                              <span style={{ color: '#6D28D9' }}>Investment recovered</span>
                              <span className="font-bold" style={{ color: '#7C3AED' }}>{roi.recoveredPct.toFixed(0)}%</span>
                            </div>
                            <div className="w-full h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#EDE9FE' }}>
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${roi.recoveredPct}%`, backgroundColor: roi.recoveredPct >= 100 ? '#16A34A' : '#7C3AED' }}/>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label: 'Total invested', value: `$${Math.round(roi.totalInvested).toLocaleString()}`, color: '#374151', bg: '#F8FAFC' },
                              { label: 'Total earned', value: `$${Math.round(roi.totalEarned).toLocaleString()}`, color: '#1D9E75', bg: '#F0FDF4' },
                              { label: 'Net position', value: `${roi.netPosition >= 0 ? '+' : ''}$${Math.round(roi.netPosition).toLocaleString()}`, color: roi.netPosition >= 0 ? '#16A34A' : '#DC2626', bg: roi.netPosition >= 0 ? '#F0FDF4' : '#FFF1F2' },
                              { label: roi.recoveredPct >= 100 ? 'Status' : 'Est. payoff', value: roi.payoffDate ?? '—', color: '#6D28D9', bg: '#F5F3FF' },
                            ].map(s => (
                              <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ backgroundColor: s.bg }}>
                                <p className="text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{s.label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
