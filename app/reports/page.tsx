'use client'
import { useEffect, useState } from 'react'
import type { Trip, Expense, Vehicle } from '@/lib/types'
import { downloadCSV } from '@/lib/export'

export default function ReportsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  useEffect(() => {
    Promise.all([
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/fleet').then(r => r.json()),
    ]).then(([t, e, v]) => {
      setTrips(Array.isArray(t) ? t : [])
      setExpenses(Array.isArray(e) ? e : [])
      setVehicles(Array.isArray(v) ? v : [])
    })
  }, [])

  const yearStart = `${yearFilter}-01-01`
  const yearEnd = `${yearFilter}-12-31`

  const filteredTrips = trips.filter(t => t.start_date >= yearStart && t.start_date <= yearEnd)
  const filteredExpenses = expenses.filter(e => e.date >= yearStart && e.date <= yearEnd)

  const availableYears = Array.from(new Set([
    ...trips.map(t => t.start_date?.slice(0, 4)).filter(Boolean),
    ...expenses.map(e => e.date?.slice(0, 4)).filter(Boolean),
    String(new Date().getFullYear()),
  ])).map(Number).sort((a, b) => b - a)

  // Per-vehicle P&L
  const vehiclePL = vehicles.map(v => {
    const vTrips = filteredTrips.filter(t => t.vehicle_id === v.id)
    const vExpenses = filteredExpenses.filter(e => e.vehicle_id === v.id)
    const gross = vTrips.reduce((s, t) => s + Number(t.gross_revenue || 0), 0)
    const turoFees = vTrips.reduce((s, t) => s + Number(t.gross_revenue || 0) * (Number(t.turo_fee_pct || 25) / 100), 0)
    const netRevenue = vTrips.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
    const actualPayouts = vTrips.filter(t => t.actual_payout != null).reduce((s, t) => s + Number(t.actual_payout || 0), 0)
    const expenseTotal = vExpenses.reduce((s, e) => s + Number(e.amount || 0), 0)
    const profit = netRevenue - expenseTotal
    const margin = gross > 0 ? (profit / gross * 100) : 0
    const tripCount = vTrips.length
    return { v, gross, turoFees, netRevenue, actualPayouts, expenseTotal, profit, margin, tripCount }
  }).filter(row => row.gross > 0 || row.expenseTotal > 0)

  const totals = vehiclePL.reduce((acc, row) => ({
    gross: acc.gross + row.gross,
    turoFees: acc.turoFees + row.turoFees,
    netRevenue: acc.netRevenue + row.netRevenue,
    actualPayouts: acc.actualPayouts + row.actualPayouts,
    expenseTotal: acc.expenseTotal + row.expenseTotal,
    profit: acc.profit + row.profit,
    tripCount: acc.tripCount + row.tripCount,
  }), { gross: 0, turoFees: 0, netRevenue: 0, actualPayouts: 0, expenseTotal: 0, profit: 0, tripCount: 0 })

  function exportTrips() {
    downloadCSV(
      filteredTrips.map(t => ({
        date: t.start_date,
        end_date: t.end_date,
        guest: t.guest_name,
        vehicle: `${(t.fleet as any)?.year || ''} ${(t.fleet as any)?.make || ''} ${(t.fleet as any)?.model || ''}`.trim(),
        gross_revenue: t.gross_revenue,
        turo_fee_pct: t.turo_fee_pct,
        net_revenue: t.net_revenue,
        actual_payout: t.actual_payout ?? '',
        start_mileage: t.start_mileage ?? '',
        end_mileage: t.end_mileage ?? '',
        miles_added: t.miles_added ?? '',
        guest_rating: t.guest_rating ?? '',
        host_rating: t.host_rating ?? '',
        status: t.status,
        notes: t.notes ?? '',
      })),
      `turo-trips-${yearFilter}.csv`
    )
  }

  function exportExpenses() {
    downloadCSV(
      filteredExpenses.map(e => ({
        date: e.date,
        vehicle: `${(e.fleet as any)?.year || ''} ${(e.fleet as any)?.make || ''} ${(e.fleet as any)?.model || ''}`.trim(),
        category: e.category,
        description: e.description,
        amount: e.amount,
        receipt_url: e.receipt_url ?? '',
        notes: e.notes ?? '',
      })),
      `turo-expenses-${yearFilter}.csv`
    )
  }

  // Schedule C computation
  const expByCat = (cats: string[]) =>
    filteredExpenses.filter(e => cats.includes(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0)

  const carTruck = expByCat(['fuel', 'registration', 'parking'])
  const schedCInsurance = expByCat(['insurance'])
  const repairs = expByCat(['maintenance'])
  const otherExp = expByCat(['cleaning', 'other'])
  const totalDeductions = carTruck + schedCInsurance + repairs + otherExp
  const schedC = {
    grossReceipts: totals.gross,
    turoFees: totals.turoFees,
    netFromTuro: totals.netRevenue,
    carTruck,
    insurance: schedCInsurance,
    repairs,
    other: otherExp,
    totalDeductions,
    netProfit: totals.netRevenue - totalDeductions,
  }

  function exportScheduleC() {
    const rows = [
      { line: 'Line 1', description: 'Gross receipts (trip revenue)', amount: schedC.grossReceipts.toFixed(2) },
      { line: 'Line 2', description: 'Returns & allowances (Turo platform fees)', amount: (-schedC.turoFees).toFixed(2) },
      { line: 'Line 7', description: 'Gross income (net from Turo)', amount: schedC.netFromTuro.toFixed(2) },
      { line: '', description: '--- DEDUCTIONS ---', amount: '' },
      { line: 'Line 9', description: 'Car & truck (fuel, registration, parking)', amount: (-schedC.carTruck).toFixed(2) },
      { line: 'Line 15', description: 'Insurance', amount: (-schedC.insurance).toFixed(2) },
      { line: 'Line 22', description: 'Repairs & maintenance', amount: (-schedC.repairs).toFixed(2) },
      { line: 'Line 27a', description: 'Other expenses (cleaning, other)', amount: (-schedC.other).toFixed(2) },
      { line: 'Line 28', description: 'Total deductions', amount: (-schedC.totalDeductions).toFixed(2) },
      { line: 'Line 31', description: 'Net profit / loss', amount: (schedC.netProfit).toFixed(2) },
    ]
    downloadCSV(rows, `turo-schedule-c-${yearFilter}.csv`)
  }

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const fmtPct = (n: number) => n.toFixed(1) + '%'

  return (
    <div className="p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Reports</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Per-vehicle P&L and CSV exports</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            className="text-sm px-3 py-2 rounded-lg" style={{ border: '1px solid #E2E8F0', color: '#0F172A', backgroundColor: 'white' }}>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={exportTrips}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: 'white' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export trips
          </button>
          <button onClick={exportExpenses}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90"
            style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: 'white' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export expenses
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4 mb-7">
        {[
          { label: 'Gross Revenue', value: fmt(totals.gross), color: '#0F172A' },
          { label: 'Net Revenue', value: fmt(totals.netRevenue), color: '#1D9E75' },
          { label: 'Total Expenses', value: fmt(totals.expenseTotal), color: '#DC2626' },
          { label: 'Net Profit', value: fmt(totals.profit), color: totals.profit >= 0 ? '#1D9E75' : '#DC2626' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <p className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: '#94A3B8' }}>{s.label}</p>
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Per-vehicle table */}
      {vehiclePL.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-xl bg-white" style={{ border: '2px dashed #E2E8F0' }}>
          <p className="font-semibold text-base mb-1" style={{ color: '#0F172A' }}>No data for {yearFilter}</p>
          <p className="text-sm" style={{ color: '#64748B' }}>Log trips and expenses to see your P&L breakdown</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Per-vehicle P&L — {yearFilter}</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  {['Vehicle', 'Trips', 'Gross', 'Turo Fees', 'Net Revenue', 'Actual Payouts', 'Expenses', 'Profit', 'Margin'].map(h => (
                    <th key={h} className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${h === 'Vehicle' || h === 'Trips' ? 'text-left' : 'text-right'}`}
                      style={{ color: '#64748B' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vehiclePL.map(row => (
                  <tr key={row.v.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td className="px-4 py-3.5 font-semibold whitespace-nowrap" style={{ color: '#0F172A' }}>
                      {row.v.year} {row.v.make} {row.v.model}
                    </td>
                    <td className="px-4 py-3.5 text-center" style={{ color: '#64748B' }}>{row.tripCount}</td>
                    <td className="px-4 py-3.5 text-right" style={{ color: '#64748B' }}>{fmt(row.gross)}</td>
                    <td className="px-4 py-3.5 text-right" style={{ color: '#DC2626' }}>−{fmt(row.turoFees)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold" style={{ color: '#1D9E75' }}>{fmt(row.netRevenue)}</td>
                    <td className="px-4 py-3.5 text-right" style={{ color: row.actualPayouts > 0 ? '#0F172A' : '#CBD5E1' }}>
                      {row.actualPayouts > 0 ? fmt(row.actualPayouts) : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-right" style={{ color: '#DC2626' }}>−{fmt(row.expenseTotal)}</td>
                    <td className="px-4 py-3.5 text-right font-bold" style={{ color: row.profit >= 0 ? '#1D9E75' : '#DC2626' }}>
                      {row.profit >= 0 ? '' : '−'}{fmt(Math.abs(row.profit))}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{ backgroundColor: row.margin >= 50 ? '#F0FDF4' : '#FFF5F5', color: row.margin >= 50 ? '#16A34A' : '#DC2626' }}>
                        {fmtPct(row.margin)}
                      </span>
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid #E2E8F0', backgroundColor: '#F8FAFC' }}>
                  <td className="px-4 py-3.5 font-bold" style={{ color: '#0F172A' }}>Total</td>
                  <td className="px-4 py-3.5 text-center font-bold" style={{ color: '#0F172A' }}>{totals.tripCount}</td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: '#0F172A' }}>{fmt(totals.gross)}</td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: '#DC2626' }}>−{fmt(totals.turoFees)}</td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: '#1D9E75' }}>{fmt(totals.netRevenue)}</td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: totals.actualPayouts > 0 ? '#0F172A' : '#CBD5E1' }}>
                    {totals.actualPayouts > 0 ? fmt(totals.actualPayouts) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: '#DC2626' }}>−{fmt(totals.expenseTotal)}</td>
                  <td className="px-4 py-3.5 text-right font-bold" style={{ color: totals.profit >= 0 ? '#1D9E75' : '#DC2626' }}>
                    {totals.profit >= 0 ? '' : '−'}{fmt(Math.abs(totals.profit))}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
                      style={{
                        backgroundColor: totals.gross > 0 && totals.profit / totals.gross * 100 >= 50 ? '#F0FDF4' : '#FFF5F5',
                        color: totals.gross > 0 && totals.profit / totals.gross * 100 >= 50 ? '#16A34A' : '#DC2626',
                      }}>
                      {totals.gross > 0 ? fmtPct(totals.profit / totals.gross * 100) : '—'}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expense breakdown by category */}
      {filteredExpenses.length > 0 && (
        <div className="mt-6">
          <h2 className="text-base font-semibold mb-4" style={{ color: '#0F172A' }}>Expense Breakdown by Category</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['maintenance','insurance','fuel','cleaning','registration','parking','other'] as const)
              .map(cat => {
                const amt = filteredExpenses.filter(e => e.category === cat).reduce((s, e) => s + Number(e.amount), 0)
                if (amt === 0) return null
                const pct = totals.expenseTotal > 0 ? (amt / totals.expenseTotal * 100) : 0
                return (
                  <div key={cat} className="bg-white rounded-xl p-4" style={{ border: '1px solid #E2E8F0' }}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1 capitalize" style={{ color: '#94A3B8' }}>{cat}</p>
                    <p className="text-lg font-bold" style={{ color: '#0F172A' }}>${amt.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{pct.toFixed(0)}% of expenses</p>
                  </div>
                )
              })
              .filter(Boolean)}
          </div>
        </div>
      )}

      {/* Schedule C Tax Prep */}
      {(filteredTrips.length > 0 || filteredExpenses.length > 0) && (
        <div className="mt-6 bg-white rounded-xl" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Schedule C Summary — {yearFilter}</h2>
              <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>IRS Schedule C (Profit or Loss from Business) — for personal review only</p>
            </div>
            <button onClick={exportScheduleC}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium hover:opacity-90"
              style={{ border: '1px solid #E2E8F0', color: '#374151', backgroundColor: 'white' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Export CSV
            </button>
          </div>
          <div className="p-5">
            {/* Income section */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Income</p>
            <div className="space-y-1 mb-4">
              {[
                { line: 'Line 1', label: 'Gross receipts (trip revenue)', amount: schedC.grossReceipts, color: '#0F172A' },
                { line: 'Line 2', label: 'Turo platform fees (returns & allowances)', amount: -schedC.turoFees, color: '#DC2626' },
                { line: 'Line 7', label: 'Gross income (net from Turo)', amount: schedC.netFromTuro, color: '#1D9E75', bold: true },
              ].map(r => (
                <div key={r.line} className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                  style={{ backgroundColor: r.bold ? '#F0FDF4' : '#F8FAFC' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E2E8F0', color: '#64748B', minWidth: 48, textAlign: 'center' }}>
                      {r.line}
                    </span>
                    <span className="text-sm" style={{ color: '#374151', fontWeight: r.bold ? 600 : 400 }}>{r.label}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: r.color }}>
                    {r.amount < 0 ? '−' : ''}{fmt(Math.abs(r.amount))}
                  </span>
                </div>
              ))}
            </div>

            {/* Deductions section */}
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Deductions</p>
            <div className="space-y-1 mb-4">
              {[
                { line: 'Line 9', label: 'Car & truck expenses (fuel, registration, parking)', amount: schedC.carTruck },
                { line: 'Line 15', label: 'Insurance', amount: schedC.insurance },
                { line: 'Line 22', label: 'Repairs & maintenance', amount: schedC.repairs },
                { line: 'Line 27a', label: 'Other expenses (cleaning, other)', amount: schedC.other },
                { line: 'Line 28', label: 'Total deductions', amount: schedC.totalDeductions, bold: true },
              ].map(r => (
                <div key={r.line} className="flex items-center justify-between py-1.5 px-3 rounded-lg"
                  style={{ backgroundColor: r.bold ? '#FFF5F5' : '#F8FAFC' }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E2E8F0', color: '#64748B', minWidth: 48, textAlign: 'center' }}>
                      {r.line}
                    </span>
                    <span className="text-sm" style={{ color: '#374151', fontWeight: r.bold ? 600 : 400 }}>{r.label}</span>
                  </div>
                  <span className="text-sm font-semibold" style={{ color: r.amount > 0 ? '#DC2626' : '#94A3B8' }}>
                    {r.amount > 0 ? `−${fmt(r.amount)}` : '—'}
                  </span>
                </div>
              ))}
            </div>

            {/* Net profit */}
            <div className="flex items-center justify-between py-3 px-4 rounded-xl"
              style={{
                backgroundColor: schedC.netProfit >= 0 ? '#F0FDF4' : '#FFF1F2',
                border: `1px solid ${schedC.netProfit >= 0 ? '#BBF7D0' : '#FECDD3'}`,
              }}>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded font-bold" style={{ backgroundColor: '#E2E8F0', color: '#64748B' }}>
                  Line 31
                </span>
                <span className="text-sm font-bold" style={{ color: schedC.netProfit >= 0 ? '#065F46' : '#991B1B' }}>
                  Net profit / loss
                </span>
              </div>
              <span className="text-lg font-bold" style={{ color: schedC.netProfit >= 0 ? '#16A34A' : '#DC2626' }}>
                {schedC.netProfit >= 0 ? '' : '−'}{fmt(Math.abs(schedC.netProfit))}
              </span>
            </div>

            <p className="text-xs mt-3" style={{ color: '#94A3B8' }}>
              Disclaimer: This is an estimate based on your logged data. Consult a tax professional before filing.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
