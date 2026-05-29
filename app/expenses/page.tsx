'use client'
import { useEffect, useState } from 'react'
import type { Expense, Vehicle } from '@/lib/types'

const CATS = ['maintenance','insurance','fuel','cleaning','registration','parking','other'] as const

const CAT_CFG: Record<string, { bg: string; text: string; bar: string }> = {
  maintenance:  { bg: '#FFFBEB', text: '#D97706', bar: '#F59E0B' },
  insurance:    { bg: '#FFF1F2', text: '#E11D48', bar: '#F43F5E' },
  fuel:         { bg: '#EFF6FF', text: '#2563EB', bar: '#3B82F6' },
  cleaning:     { bg: '#F0FDF4', text: '#16A34A', bar: '#22C55E' },
  registration: { bg: '#F5F3FF', text: '#7C3AED', bar: '#8B5CF6' },
  parking:      { bg: '#F8FAFC', text: '#64748B', bar: '#94A3B8' },
  other:        { bg: '#F8FAFC', text: '#64748B', bar: '#94A3B8' },
}

const EMPTY = { vehicle_id:'', date: new Date().toISOString().slice(0,10), category:'maintenance' as const, description:'', amount:0, notes:'' }
const inputCls = "w-full text-sm px-3 py-2 rounded-lg"
const inputStyle = { border: '1px solid #E2E8F0', color: '#0F172A', outline: 'none', backgroundColor: 'white' }

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [e, v] = await Promise.all([fetch('/api/expenses').then(r => r.json()), fetch('/api/fleet').then(r => r.json())])
    setExpenses(Array.isArray(e) ? e : [])
    setVehicles(Array.isArray(v) ? v : [])
  }

  async function save() {
    setSaving(true)
    let receipt_url: string | undefined

    if (receiptFile) {
      setUploading(true)
      const fd = new FormData()
      fd.append('file', receiptFile)
      fd.append('bucket', 'expense-receipts')
      fd.append('folder', form.date || new Date().toISOString().slice(0, 10))
      const res = await fetch('/api/upload', { method: 'POST', body: fd })
      const result = await res.json()
      if (result.url) receipt_url = result.url
      setUploading(false)
    }

    await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, ...(receipt_url ? { receipt_url } : {}) }),
    })
    setSaving(false); setShowForm(false); setForm(EMPTY); setReceiptFile(null); load()
  }

  async function remove(id: string) {
    if (!confirm('Remove this expense?')) return
    await fetch('/api/expenses', { method:'DELETE', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id }) })
    load()
  }

  const filtered = filter ? expenses.filter(e => e.vehicle_id === filter) : expenses
  const total = filtered.reduce((s, e) => s + Number(e.amount), 0)
  const now = new Date()
  const monthTotal = filtered.filter(e => e.date?.slice(0,7) === now.toISOString().slice(0,7)).reduce((s, e) => s + Number(e.amount), 0)

  const byCategory = CATS.reduce((acc, cat) => {
    acc[cat] = filtered.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0)
    return acc
  }, {} as Record<string, number>)

  const activeCats = CATS.filter(c => byCategory[c] > 0)

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Expenses</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            <span className="font-semibold" style={{ color: '#DC2626' }}>${total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> total ·{' '}
            <span className="font-semibold" style={{ color: '#64748B' }}>${monthTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> this month
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
            Add expense
          </button>
        </div>
      </div>

      {/* Category breakdown */}
      {activeCats.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {activeCats.map(c => {
            const cfg = CAT_CFG[c]
            const pct = total > 0 ? (byCategory[c] / total * 100) : 0
            return (
              <div key={c} className="bg-white rounded-xl p-4 relative overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div className="absolute left-0 top-0 bottom-0 w-0.5" style={{ backgroundColor: cfg.bar }} />
                <p className="text-xs font-semibold uppercase tracking-wider mb-1.5 capitalize" style={{ color: '#94A3B8', letterSpacing: '0.06em' }}>{c}</p>
                <p className="text-xl font-bold" style={{ color: '#0F172A' }}>${byCategory[c].toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                <p className="text-xs mt-0.5 font-medium" style={{ color: cfg.text }}>{pct.toFixed(0)}% of total</p>
              </div>
            )
          })}
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white rounded-xl p-6 mb-6" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <h2 className="text-base font-semibold mb-1" style={{ color: '#0F172A' }}>Add expense</h2>
          <p className="text-sm mb-5" style={{ color: '#64748B' }}>Log a business expense for your fleet</p>
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
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Date</label>
              <input type="date" value={form.date} onChange={e => setForm(p => ({...p, date: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Category</label>
              <select value={form.category} onChange={e => setForm(p => ({...p, category: e.target.value as any}))}
                className={inputCls} style={inputStyle}>
                {CATS.map(c => <option key={c} value={c} className="capitalize">{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Amount ($)</label>
              <input type="number" min={0} step="0.01" value={form.amount}
                onChange={e => setForm(p => ({...p, amount: Number(e.target.value)}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Description</label>
              <input type="text" placeholder="e.g. Oil change at Jiffy Lube" value={form.description}
                onChange={e => setForm(p => ({...p, description: e.target.value}))}
                className={inputCls} style={inputStyle}/>
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#374151' }}>Receipt (photo or PDF)</label>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={e => setReceiptFile(e.target.files?.[0] ?? null)}
                className="w-full text-sm px-3 py-2 rounded-lg"
                style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: 'white' }}/>
              {receiptFile && (
                <p className="text-xs mt-1" style={{ color: '#64748B' }}>{receiptFile.name} selected</p>
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-5 pt-5" style={{ borderTop: '1px solid #F1F5F9' }}>
            <button onClick={save} disabled={saving || !form.vehicle_id || !form.description || !form.amount}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-40 hover:opacity-90"
              style={{ backgroundColor: '#1D9E75' }}>
              {saving ? (uploading ? 'Uploading receipt…' : 'Saving…') : 'Add expense'}
            </button>
            <button onClick={() => { setShowForm(false); setReceiptFile(null) }}
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
          <div className="w-14 h-14 rounded-xl flex items-center justify-center mb-4" style={{ backgroundColor: '#FFF1F2' }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
          </div>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No expenses logged</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Track your business expenses for tax time</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                {['Date', 'Description', 'Vehicle', 'Category', 'Amount', ''].map((h, i) => (
                  <th key={i} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider ${h === 'Amount' ? 'text-right' : 'text-left'}`}
                    style={{ color: '#64748B', letterSpacing: '0.06em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(e => {
                const cfg = CAT_CFG[e.category] || CAT_CFG.other
                return (
                  <tr key={e.id} className="data-table" style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="px-4 py-3.5 text-xs font-medium" style={{ color: '#64748B' }}>{e.date}</td>
                    <td className="px-4 py-3.5 font-semibold" style={{ color: '#0F172A' }}>{e.description}</td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: '#64748B' }}>{(e.fleet as any)?.make} {(e.fleet as any)?.model}</td>
                    <td className="px-4 py-3.5">
                      <span className="badge capitalize" style={{ backgroundColor: cfg.bg, color: cfg.text }}>{e.category}</span>
                    </td>
                    <td className="px-4 py-3.5 text-right font-bold" style={{ color: '#0F172A' }}>
                      ${Number(e.amount).toFixed(2)}
                      {e.receipt_url && (
                        <a href={e.receipt_url} target="_blank" rel="noopener noreferrer"
                          className="ml-2 text-xs font-normal underline" style={{ color: '#1D9E75' }}>
                          Receipt
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button onClick={() => remove(e.id)}
                        className="p-1 rounded transition-colors hover:bg-red-50"
                        title="Remove expense">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                          <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
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
