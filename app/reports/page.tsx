'use client'
import { useEffect, useState } from 'react'
import type { Trip, Expense, Vehicle } from '@/lib/types'
import { downloadCSV } from '@/lib/export'

const IRS_RATES: Record<number, number> = { 2023: 0.655, 2024: 0.670, 2025: 0.700, 2026: 0.700 }

export default function ReportsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())
  const [deductionMethod, setDeductionMethod] = useState<'standard' | 'actual'>('standard')

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
    const netRevenue = vTrips.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
    const turoFees = gross - netRevenue
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

  // Actual expense method buckets
  const carTruck = expByCat(['fuel', 'registration', 'parking'])
  const schedCInsurance = expByCat(['insurance'])
  const repairs = expByCat(['maintenance'])
  const otherExp = expByCat(['cleaning', 'other'])
  const actualDeductions = carTruck + schedCInsurance + repairs + otherExp

  // Standard mileage method — fall back to odometer diff when miles_added wasn't stored
  const totalMiles = filteredTrips.reduce((sum, t) => {
    const miles = (t.miles_added && t.miles_added > 0)
      ? t.miles_added
      : (t.start_mileage != null && t.end_mileage != null ? Math.max(0, t.end_mileage - t.start_mileage) : 0)
    return sum + miles
  }, 0)
  const irsRate = IRS_RATES[yearFilter] ?? 0.700
  const mileageDeduction = totalMiles * irsRate
  // Parking fees and cleaning are still separately deductible under standard mileage
  const otherPlusParking = expByCat(['cleaning', 'other', 'parking'])
  const standardDeductions = mileageDeduction + otherPlusParking

  const activeDeductions = deductionMethod === 'standard' ? standardDeductions : actualDeductions

  const schedC = {
    grossReceipts: totals.gross,
    turoFees: totals.turoFees,
    netFromTuro: totals.netRevenue,
    netProfit: totals.netRevenue - activeDeductions,
  }

  function exportScheduleC() {
    const incomeRows = [
      { line: 'Line 1', description: 'Gross receipts (trip revenue)', amount: schedC.grossReceipts.toFixed(2) },
      { line: 'Line 2', description: 'Returns & allowances (Turo platform fees)', amount: (-schedC.turoFees).toFixed(2) },
      { line: 'Line 7', description: 'Gross income (net from Turo)', amount: schedC.netFromTuro.toFixed(2) },
      { line: '', description: '--- DEDUCTIONS ---', amount: '' },
    ]

    const deductionRows = deductionMethod === 'standard'
      ? [
          { line: 'Line 9', description: `Standard mileage deduction (${totalMiles.toLocaleString()} mi × $${irsRate.toFixed(3)}/mi)`, amount: (-mileageDeduction).toFixed(2) },
          { line: 'Line 27a', description: 'Other expenses (parking, cleaning, other)', amount: (-otherPlusParking).toFixed(2) },
          { line: 'Line 28', description: 'Total deductions', amount: (-standardDeductions).toFixed(2) },
          { line: '', description: 'Note: Insurance and maintenance are included in the standard mileage rate', amount: '' },
        ]
      : [
          { line: 'Line 9', description: 'Car & truck (fuel, registration, parking)', amount: (-carTruck).toFixed(2) },
          { line: 'Line 15', description: 'Insurance', amount: (-schedCInsurance).toFixed(2) },
          { line: 'Line 22', description: 'Repairs & maintenance', amount: (-repairs).toFixed(2) },
          { line: 'Line 27a', description: 'Other expenses (cleaning, other)', amount: (-otherExp).toFixed(2) },
          { line: 'Line 28', description: 'Total deductions', amount: (-actualDeductions).toFixed(2) },
          { line: '', description: 'Note: Cannot combine actual expenses with standard mileage deduction', amount: '' },
        ]

    const profitRow = [
      { line: 'Line 31', description: 'Net profit / loss', amount: schedC.netProfit.toFixed(2) },
    ]

    downloadCSV([...incomeRows, ...deductionRows, ...profitRow], `turo-schedule-c-${yearFilter}.csv`)
  }

  const fmt = (n: number) => '$' + n.toLocaleString(undefined, { maximumFractionDigits: 0 })
  const fmtPct = (n: number) => n.toFixed(1) + '%'

  const standardSavings = standardDeductions - actualDeductions

  return (
    <div className="p-4 md:p-7 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Reports</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>Per-vehicle P&L and CSV exports</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-7">
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4" style={{ borderBottom: '1px solid #E2E8F0' }}>
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

            {/* Deduction method toggle */}
            <div className="mb-5">
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: '#94A3B8' }}>Vehicle Deduction Method</p>
              <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid #E2E8F0', width: 'fit-content' }}>
                <button
                  onClick={() => setDeductionMethod('standard')}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: deductionMethod === 'standard' ? '#1D9E75' : 'white',
                    color: deductionMethod === 'standard' ? 'white' : '#374151',
                    borderRight: '1px solid #E2E8F0',
                  }}>
                  Standard Mileage
                </button>
                <button
                  onClick={() => setDeductionMethod('actual')}
                  className="px-4 py-2 text-sm font-medium transition-colors"
                  style={{
                    backgroundColor: deductionMethod === 'actual' ? '#1D9E75' : 'white',
                    color: deductionMethod === 'actual' ? 'white' : '#374151',
                  }}>
                  Actual Expenses
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: '#94A3B8' }}>
                {deductionMethod === 'standard'
                  ? `IRS rate: $${irsRate.toFixed(3)}/mi for ${yearFilter}${!(yearFilter in IRS_RATES) ? ' (estimated — verify IRS announcement)' : ''}. Covers gas, oil, repairs, insurance & depreciation. Parking fees deducted separately.`
                  : 'Deduct actual fuel, insurance, maintenance, registration & parking costs. Cannot be combined with standard mileage.'}
              </p>
            </div>

            {/* Method comparison callout */}
            {totalMiles > 0 && (
              <div className="mb-5 px-4 py-3 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                style={{ backgroundColor: '#F0F9FF', border: '1px solid #BAE6FD' }}>
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                  </svg>
                  <span className="text-xs font-semibold" style={{ color: '#0284C7' }}>Method Comparison — {totalMiles.toLocaleString()} business miles logged</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span style={{ color: '#0369A1' }}>
                    Standard: <strong>{fmt(standardDeductions)}</strong>
                  </span>
                  <span style={{ color: '#0369A1' }}>
                    Actual: <strong>{fmt(actualDeductions)}</strong>
                  </span>
                  {standardSavings !== 0 && (
                    <span className="px-2 py-0.5 rounded-full font-semibold"
                      style={{
                        backgroundColor: standardSavings > 0 ? '#DCFCE7' : '#FEE2E2',
                        color: standardSavings > 0 ? '#16A34A' : '#DC2626',
                      }}>
                      {standardSavings > 0 ? `Standard saves ${fmt(standardSavings)}` : `Actual saves ${fmt(Math.abs(standardSavings))}`}
                    </span>
                  )}
                </div>
              </div>
            )}

            {totalMiles === 0 && deductionMethod === 'standard' && (
              <div className="mb-5 px-4 py-3 rounded-xl flex items-center gap-2"
                style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <span className="text-xs" style={{ color: '#92400E' }}>
                  No mileage recorded for {yearFilter} trips. Log start/end odometer readings in the Trips section to unlock this deduction.
                </span>
              </div>
            )}

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
              {deductionMethod === 'standard' ? (
                <>
                  <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ backgroundColor: '#F8FAFC' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E2E8F0', color: '#64748B', minWidth: 48, textAlign: 'center' }}>Line 9</span>
                      <span className="text-sm" style={{ color: '#374151' }}>
                        Standard mileage ({totalMiles.toLocaleString()} mi × ${irsRate.toFixed(3)})
                      </span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: mileageDeduction > 0 ? '#DC2626' : '#94A3B8' }}>
                      {mileageDeduction > 0 ? `−${fmt(mileageDeduction)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ backgroundColor: '#F8FAFC' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E2E8F0', color: '#64748B', minWidth: 48, textAlign: 'center' }}>Line 27a</span>
                      <span className="text-sm" style={{ color: '#374151' }}>Other expenses (parking, cleaning, other)</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: otherPlusParking > 0 ? '#DC2626' : '#94A3B8' }}>
                      {otherPlusParking > 0 ? `−${fmt(otherPlusParking)}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 px-3 rounded-lg" style={{ backgroundColor: '#FFF5F5' }}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E2E8F0', color: '#64748B', minWidth: 48, textAlign: 'center' }}>Line 28</span>
                      <span className="text-sm font-semibold" style={{ color: '#374151' }}>Total deductions</span>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: standardDeductions > 0 ? '#DC2626' : '#94A3B8' }}>
                      {standardDeductions > 0 ? `−${fmt(standardDeductions)}` : '—'}
                    </span>
                  </div>
                  <p className="text-xs px-1 pt-1" style={{ color: '#94A3B8' }}>
                    Gas, oil, repairs, insurance & depreciation are included in the standard rate.
                  </p>
                </>
              ) : (
                <>
                  {[
                    { line: 'Line 9', label: 'Car & truck (fuel, registration, parking)', amount: carTruck },
                    { line: 'Line 15', label: 'Insurance', amount: schedCInsurance },
                    { line: 'Line 22', label: 'Repairs & maintenance', amount: repairs },
                    { line: 'Line 27a', label: 'Other expenses (cleaning, other)', amount: otherExp },
                    { line: 'Line 28', label: 'Total deductions', amount: actualDeductions, bold: true },
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
                </>
              )}
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
