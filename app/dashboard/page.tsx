'use client'
import { useEffect, useState } from 'react'
import AITipsPanel from '@/components/AITipsPanel'
import StatCard from '@/components/StatCard'
import type { Vehicle, Trip, Expense, MaintenanceItem } from '@/lib/types'

function fmt(n: number) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function DashboardPage() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [maintenance, setMaintenance] = useState<MaintenanceItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/fleet').then(r => r.json()),
      fetch('/api/trips').then(r => r.json()),
      fetch('/api/expenses').then(r => r.json()),
      fetch('/api/maintenance').then(r => r.json()),
    ]).then(([v, t, e, m]) => {
      setVehicles(Array.isArray(v) ? v : [])
      setTrips(Array.isArray(t) ? t : [])
      setExpenses(Array.isArray(e) ? e : [])
      setMaintenance(Array.isArray(m) ? m : [])
      setLoading(false)
    })
  }, [])

  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const ytdTrips = trips.filter(t => t.start_date >= yearStart)
  const ytdRevenue = ytdTrips.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
  const ytdExpenses = expenses.filter(e => e.date >= yearStart).reduce((s, e) => s + Number(e.amount || 0), 0)
  const ytdProfit = ytdRevenue - ytdExpenses
  const alerts = maintenance.filter(m => m.status === 'overdue' || m.status === 'due_soon')
  const activeVehicles = vehicles.filter(v => v.status === 'active').length

  const monthlyData: Record<string, number> = {}
  trips.forEach(t => {
    const month = t.start_date?.slice(0, 7)
    if (month) monthlyData[month] = (monthlyData[month] || 0) + Number(t.net_revenue || 0)
  })
  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    const key = d.toISOString().slice(0, 7)
    return { month: d.toLocaleString('default', { month: 'short' }), revenue: Math.round(monthlyData[key] || 0) }
  })
  const maxRev = Math.max(...last6Months.map(m => m.revenue), 1)

  if (loading) return (
    <div className="flex items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#1D9E75', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: '#64748B' }}>Loading fleet data…</p>
      </div>
    </div>
  )

  return (
    <div className="p-7 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0F172A' }}>Dashboard</h1>
          <p className="text-sm mt-1" style={{ color: '#64748B' }}>
            {now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
            {alerts.length > 0 && (
              <span className="ml-3 inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
                style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {alerts.length} maintenance alert{alerts.length > 1 ? 's' : ''}
              </span>
            )}
          </p>
        </div>
        <a href="/fleet"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add vehicle
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        <StatCard label="YTD Revenue" value={`$${fmt(ytdRevenue)}`} sub={`${ytdTrips.length} trips recorded`} color="green" />
        <StatCard label="YTD Expenses" value={`$${fmt(ytdExpenses)}`} sub="All categories" color="amber" />
        <StatCard label="YTD Profit" value={`$${fmt(ytdProfit)}`} sub={ytdProfit >= 0 ? 'Positive margin' : 'Net loss'} color={ytdProfit >= 0 ? 'green' : 'red'} />
        <StatCard label="Active Vehicles" value={activeVehicles} sub={`${vehicles.length - activeVehicles} inactive`} color="blue" />
      </div>

      {/* Main: fluid left + fixed-width tips panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 items-start">

        {/* Left column: data panels */}
        <div className="flex flex-col gap-5">

          {/* Revenue chart */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Net Revenue Trend</h2>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Last 6 months</p>
              </div>
              {ytdRevenue > 0 && (
                <div className="text-right">
                  <p className="text-sm font-bold" style={{ color: '#1D9E75' }}>${fmt(ytdRevenue)}</p>
                  <p className="text-xs" style={{ color: '#94A3B8' }}>YTD total</p>
                </div>
              )}
            </div>
            <div className="flex items-end gap-2" style={{ height: '120px' }}>
              {last6Months.map((m, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div
                    className="w-full rounded-t-md transition-all duration-300"
                    style={{
                      height: `${Math.max((m.revenue / maxRev) * 100, 3)}%`,
                      background: i === 5 ? 'linear-gradient(180deg, #1D9E75 0%, #0F6E56 100%)' : '#DCFCE7',
                    }}
                  />
                  <span className="text-xs font-medium" style={{ color: i === 5 ? '#0F172A' : '#94A3B8' }}>{m.month}</span>
                  {m.revenue > 0 && (
                    <span className="text-xs font-semibold" style={{ color: '#1D9E75' }}>${m.revenue >= 1000 ? (m.revenue/1000).toFixed(1)+'k' : m.revenue}</span>
                  )}
                </div>
              ))}
            </div>
            {ytdTrips.length === 0 && (
              <p className="text-xs text-center mt-4" style={{ color: '#94A3B8' }}>Log trips to see your revenue trend</p>
            )}
          </div>

          {/* Maintenance alerts */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Maintenance Alerts</h2>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>Items requiring attention</p>
              </div>
              {alerts.length > 0 && (
                <span className="badge" style={{ backgroundColor: '#FEF2F2', color: '#DC2626' }}>
                  {alerts.length} alert{alerts.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 rounded-lg" style={{ backgroundColor: '#F0FDF4' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center mb-2" style={{ backgroundColor: '#DCFCE7' }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: '#065F46' }}>All systems go</p>
                <p className="text-xs mt-0.5" style={{ color: '#059669' }}>No maintenance due</p>
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.slice(0, 4).map(m => (
                  <div key={m.id} className="flex items-center gap-3 px-3.5 py-2.5 rounded-lg"
                    style={{ backgroundColor: m.status === 'overdue' ? '#FFF1F2' : '#FFFBEB', border: `1px solid ${m.status === 'overdue' ? '#FECDD3' : '#FDE68A'}` }}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: m.status === 'overdue' ? '#EF4444' : '#F59E0B' }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: m.status === 'overdue' ? '#991B1B' : '#92400E' }}>
                        {m.service_type}
                      </p>
                      <p className="text-xs" style={{ color: '#64748B' }}>
                        {(m.fleet as any)?.make} {(m.fleet as any)?.model}
                        {m.next_due_mileage ? ` · Due at ${m.next_due_mileage.toLocaleString()} mi` : ''}
                      </p>
                    </div>
                    <span className="badge flex-shrink-0"
                      style={{ backgroundColor: m.status === 'overdue' ? '#FEE2E2' : '#FEF3C7', color: m.status === 'overdue' ? '#B91C1C' : '#B45309' }}>
                      {m.status.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Fleet Overview */}
          <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-sm font-semibold" style={{ color: '#0F172A' }}>Fleet Overview</h2>
                <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} total</p>
              </div>
              <a href="/fleet" className="text-xs font-medium hover:underline" style={{ color: '#1D9E75' }}>View all →</a>
            </div>
            {vehicles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '2px dashed #E2E8F0' }}>
                <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-3" style={{ backgroundColor: '#EFF6FF' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
                    <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
                  </svg>
                </div>
                <p className="text-sm font-medium" style={{ color: '#334155' }}>No vehicles yet</p>
                <a href="/fleet" className="text-xs mt-1 font-medium hover:underline" style={{ color: '#1D9E75' }}>Add your first car →</a>
              </div>
            ) : (
              <div className="space-y-2.5">
                {vehicles.map(v => {
                  const vTrips = trips.filter(t => t.vehicle_id === v.id)
                  const vRevenue = vTrips.reduce((s, t) => s + Number(t.net_revenue || 0), 0)
                  const statusColor = v.status === 'active' ? { bg: '#F0FDF4', text: '#16A34A' }
                    : v.status === 'maintenance' ? { bg: '#FFFBEB', text: '#D97706' }
                    : { bg: '#F1F5F9', text: '#64748B' }
                  return (
                    <div key={v.id} className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F8FAFC', border: '1px solid #F1F5F9' }}>
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EFF6FF' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v5"/>
                          <circle cx="16" cy="17" r="2"/><circle cx="7" cy="17" r="2"/>
                        </svg>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>{v.year} {v.make} {v.model}</p>
                        <p className="text-xs" style={{ color: '#64748B' }}>${v.daily_rate}/day · {v.current_mileage.toLocaleString()} mi</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold" style={{ color: '#1D9E75' }}>${fmt(vRevenue)}</p>
                        <span className="badge" style={{ backgroundColor: statusColor.bg, color: statusColor.text }}>{v.status}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right column: AI Recommendations */}
        <div className="hidden lg:block sticky top-7">
          <AITipsPanel />
        </div>
      </div>

      {/* Mobile: AI Recommendations below data panels */}
      <div className="lg:hidden mt-5">
        <AITipsPanel />
      </div>
    </div>
  )
}
