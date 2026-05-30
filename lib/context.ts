import { readFileSync } from 'fs'
import { join } from 'path'
import { supabase } from './supabase'
import type { FleetContext } from './types'

// Read once at module load time — server-side only (this file is only imported by API routes)
let turoKnowledge = ''
try {
  turoKnowledge = readFileSync(join(process.cwd(), 'TURO_KNOWLEDGE.md'), 'utf-8')
} catch {
  turoKnowledge = '(Turo knowledge base not loaded)'
}

export async function buildFleetContext(): Promise<FleetContext> {
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const [vehiclesRes, tripsRes, maintenanceRes, expensesRes, expiringDocsRes] = await Promise.all([
    supabase.from('fleet').select('*').order('created_at'),
    supabase.from('trips').select('*, fleet(make,model,year), guests(name,flag)').order('start_date', { ascending: false }).limit(10),
    supabase.from('maintenance').select('*, fleet(make,model,year)').in('status', ['due_soon', 'overdue']),
    supabase.from('expenses').select('amount').gte('date', yearStart),
    supabase.from('vehicle_documents').select('name, document_type, expiry_date, fleet(make,model,year)')
      .not('expiry_date', 'is', null).lte('expiry_date', thirtyDaysOut),
  ])

  const ytdRevenue = (tripsRes.data || [])
    .filter(t => t.start_date >= yearStart)
    .reduce((sum, t) => sum + (t.net_revenue || 0), 0)

  const ytdExpenses = (expensesRes.data || [])
    .reduce((sum, e) => sum + (e.amount || 0), 0)

  // Payout discrepancy detection
  const recentTrips = tripsRes.data || []
  const discrepancies = recentTrips.filter(t =>
    t.actual_payout != null && Math.abs(t.actual_payout - t.net_revenue) > 5
  )

  return {
    vehicles: vehiclesRes.data || [],
    recentTrips,
    openMaintenance: maintenanceRes.data || [],
    ytdRevenue,
    ytdExpenses,
    totalTrips: recentTrips.length,
    expiringDocs: expiringDocsRes.data || [],
    payoutDiscrepancies: discrepancies,
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
        const mileageInfo = t.start_mileage && t.end_mileage
          ? ` | Odometer: ${t.start_mileage.toLocaleString()}→${t.end_mileage.toLocaleString()} mi`
          : t.miles_added ? ` | +${t.miles_added} mi` : ''
        const payoutInfo = t.actual_payout != null
          ? ` | Paid: $${Number(t.actual_payout).toFixed(0)}${Math.abs(t.actual_payout - t.net_revenue) > 5 ? ' ⚠ discrepancy' : ''}`
          : ''
        return `  - ${t.start_date} → ${t.end_date} | Guest: ${t.guest_name}${flagNote} | Net: $${Number(t.net_revenue).toFixed(0)}${payoutInfo} | Rating: ${t.host_rating ?? 'pending'}★${mileageInfo}`
      }).join('\n')
    : '  (No trips logged yet)'

  const maintenanceAlerts = ctx.openMaintenance.length
    ? ctx.openMaintenance.map(m =>
      `  - ${(m.fleet as any)?.make} ${(m.fleet as any)?.model}: ${m.service_type} is ${m.status.replace('_', ' ')}${m.next_due_mileage ? ` (due at ${m.next_due_mileage.toLocaleString()} mi)` : ''}`
    ).join('\n')
    : '  (No maintenance alerts)'

  const docAlerts = ctx.expiringDocs?.length
    ? ctx.expiringDocs.map((d: any) =>
      `  - ${(d.fleet as any)?.make} ${(d.fleet as any)?.model}: ${d.name} (${d.document_type}) expires ${d.expiry_date}`
    ).join('\n')
    : null

  const payoutWarnings = ctx.payoutDiscrepancies?.length
    ? `\n⚠ PAYOUT DISCREPANCIES: ${ctx.payoutDiscrepancies.length} recent trip(s) where actual payout differed from expected net revenue by more than $5. Review with host.`
    : ''

  const netYTD = ctx.ytdRevenue - ctx.ytdExpenses

  return `You are TuroAgent, an expert Turo car rental business advisor with full context of this host's operation.

## HOST'S FLEET
${vehicleList}

## RECENT TRIPS (last 5)
${recentTripList}

## MAINTENANCE ALERTS
${maintenanceAlerts}
${docAlerts ? `\n## DOCUMENT EXPIRY ALERTS\n${docAlerts}` : ''}

## FINANCIALS (YTD ${new Date().getFullYear()})
  - Gross revenue: $${ctx.ytdRevenue.toFixed(0)}
  - Expenses: $${ctx.ytdExpenses.toFixed(0)}
  - Net profit: $${netYTD.toFixed(0)}${payoutWarnings}

## YOUR ROLE
You are a proactive, knowledgeable Turo business advisor. You:
- Always reference the host's actual vehicles, rates, and data above when giving advice
- Give specific, actionable recommendations — not generic tips
- Flag maintenance issues, document expiry, or profitability concerns proactively
- Know Turo platform mechanics deeply: dynamic pricing, All-Star Host program, protection plans, fee structures, listing SEO, guest management, damage claims, tax deductions
- Suggest ready-to-send message templates for guests when relevant
- Think like a small business operator focused on ROI and host protection

Keep responses concise and practical. Use bullet points for lists. When relevant, cite specific dollar amounts or percentages from the host's own data above.

## TURO PLATFORM KNOWLEDGE BASE
${turoKnowledge}`
}
