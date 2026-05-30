import { supabase } from './supabase'
import type { FleetContext } from './types'

export async function buildFleetContext(): Promise<FleetContext> {
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`

  const [vehiclesRes, tripsRes, maintenanceRes, expensesRes] = await Promise.all([
    supabase.from('fleet').select('*').order('created_at'),
    supabase.from('trips').select('*, fleet(make,model,year), guests(name,flag)').order('start_date', { ascending: false }).limit(10),
    supabase.from('maintenance').select('*, fleet(make,model,year)').in('status', ['due_soon', 'overdue']),
    supabase.from('expenses').select('amount').gte('date', yearStart),
  ])

  const ytdRevenue = (tripsRes.data || [])
    .filter(t => t.start_date >= yearStart)
    .reduce((sum, t) => sum + (t.net_revenue || 0), 0)

  const ytdExpenses = (expensesRes.data || [])
    .reduce((sum, e) => sum + (e.amount || 0), 0)

  return {
    vehicles: vehiclesRes.data || [],
    recentTrips: tripsRes.data || [],
    openMaintenance: maintenanceRes.data || [],
    ytdRevenue,
    ytdExpenses,
    totalTrips: tripsRes.data?.length || 0,
  }
}

export function buildSystemPrompt(ctx: FleetContext): string {
  const vehicleList = ctx.vehicles.length
    ? ctx.vehicles.map(v =>
      `  - ${v.year} ${v.make} ${v.model} | $${v.daily_rate}/day | ${v.current_mileage.toLocaleString()} mi | Status: ${v.status}${v.notes ? ` | Notes: ${v.notes}` : ''}`
    ).join('\n')
    : '  (No vehicles added yet)'

  const recentTripList = ctx.recentTrips.slice(0, 5).length
    ? ctx.recentTrips.slice(0, 5).map(t => {
        const flag = (t.guests as any)?.flag
        const flagNote = flag && flag !== 'none' ? ` [${flag.toUpperCase()}]` : ''
        return `  - ${t.start_date} → ${t.end_date} | Guest: ${t.guest_name}${flagNote} | Net: $${Number(t.net_revenue).toFixed(0)} | Rating: ${t.host_rating ?? 'pending'}★`
      }).join('\n')
    : '  (No trips logged yet)'

  const maintenanceAlerts = ctx.openMaintenance.length
    ? ctx.openMaintenance.map(m =>
      `  - ${(m.fleet as any)?.make} ${(m.fleet as any)?.model}: ${m.service_type} is ${m.status.replace('_', ' ')}${m.next_due_mileage ? ` (due at ${m.next_due_mileage.toLocaleString()} mi)` : ''}`
    ).join('\n')
    : '  (No maintenance alerts)'

  const netYTD = ctx.ytdRevenue - ctx.ytdExpenses

  return `You are TuroAgent, an expert Turo car rental business advisor with full context of this host's operation.

## HOST'S FLEET
${vehicleList}

## RECENT TRIPS (last 5)
${recentTripList}

## MAINTENANCE ALERTS
${maintenanceAlerts}

## FINANCIALS (YTD ${new Date().getFullYear()})
  - Gross revenue: $${ctx.ytdRevenue.toFixed(0)}
  - Expenses: $${ctx.ytdExpenses.toFixed(0)}
  - Net profit: $${netYTD.toFixed(0)}

## YOUR ROLE
You are a proactive, knowledgeable Turo business advisor. You:
- Always reference the host's actual vehicles, rates, and data above when giving advice
- Give specific, actionable recommendations — not generic tips
- Flag maintenance issues or profitability concerns proactively
- Know Turo platform mechanics deeply: dynamic pricing, All-Star Host program, protection plans, fee structures, listing SEO, guest management, damage claims, tax deductions
- Suggest message templates for guests when relevant
- Think like a small business operator focused on ROI and host protection

Keep responses concise and practical. Use bullet points for lists. When relevant, cite specific dollar amounts or percentages from the host's own data above.`
}
