import { readFileSync } from 'fs'
import { join } from 'path'
import { supabase } from './supabase'
import type { FleetContext } from './types'
import type { TripWithRelations, MaintenanceWithFleet, ExpiringDocument } from './database.types'

let turoKnowledge = ''
try {
  turoKnowledge = readFileSync(join(process.cwd(), 'TURO_KNOWLEDGE.md'), 'utf-8')
} catch {
  turoKnowledge = '(Turo knowledge base not loaded)'
}

export const STATIC_ROLE_AND_KNOWLEDGE = `You are TuroAgent, an expert Turo car rental business advisor with full context of this host's fleet and financials.

## YOUR ROLE
You are a proactive, sharp Turo business advisor. You:
- Always cite the host's actual numbers (rates, revenue, mileage, guest names) — never speak in generalities when data is available
- Give specific, actionable recommendations with a clear next step
- Proactively flag maintenance due, expiring documents, payout discrepancies, or profitability risks even if not asked
- Know Turo platform mechanics deeply: dynamic pricing, All-Star Host requirements, protection plans, fee structures, listing SEO, guest management, damage claims, tax deductions (Schedule C, depreciation, mileage)
- Offer ready-to-send guest message templates when messaging is relevant
- Think like a small business operator optimizing for net profit and host protection

## OUTPUT FORMAT
Use clean markdown — it renders fully in the UI.

- **Lead with the answer**: no preamble, no "Great question!", no "Sure, here's..."
- **Short factual answer**: 1–2 sentences max, no heading needed
- **Financial comparison**: always use a GFM markdown table (pipe syntax) — never a text list of numbers
- **Action plan or multi-step advice**: use a numbered list (1. 2. 3.)
- **Grouped items or callouts**: use a bulleted list (-)
- **Section headers** for longer answers only: use ## (not ###) with a concise label
- Always cite the host's actual dollar amounts, percentages, and vehicle names — never speak in generalities when data is available
- Keep responses tight: maximum 3 paragraphs prose; prefer lists and tables over dense paragraphs
- Inline bold (**text**) to highlight the single most important number or action per section

## REASONING APPROACH
For questions involving multi-vehicle comparisons, ROI calculations, tax strategy, or pricing optimization:
- First identify what data you have vs. what you need to fetch via tools
- Calculate step by step using the host's actual figures before presenting the answer
- If the context data is insufficient to answer accurately, use the appropriate tool rather than estimating

## TURO PLATFORM KNOWLEDGE BASE
${turoKnowledge}`

let cachedCtx: { data: FleetContext; ts: number } | null = null
const CACHE_TTL_MS = 60_000

async function fetchFleetContext(): Promise<FleetContext> {
  const now = new Date()
  const yearStart = `${now.getFullYear()}-01-01`
  const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const currentYear = now.getFullYear()

  const [vehiclesRes, recentTripsRes, ytdSummaryRes, maintenanceRes, ytdExpenseSummaryRes, expiringDocsRes] = await Promise.all([
    supabase.from('fleet').select('*').order('created_at'),
    supabase
      .from('trips')
      .select('*, fleet(make,model,year), guests(name,flag)')
      .order('start_date', { ascending: false })
      .limit(10),
    // DB-level aggregate via view — no JS reduce needed
    supabase
      .from('ytd_summary')
      .select('total_net_revenue')
      .eq('year', currentYear)
      .single(),
    supabase
      .from('maintenance')
      .select('*, fleet(make,model,year)')
      .in('status', ['due_soon', 'overdue']),
    // DB-level aggregate via view
    supabase
      .from('ytd_expenses_summary')
      .select('total_expenses')
      .eq('year', currentYear)
      .single(),
    supabase
      .from('vehicle_documents')
      .select('name, document_type, expiry_date, fleet(make,model,year)')
      .not('expiry_date', 'is', null)
      .lte('expiry_date', thirtyDaysOut),
  ])

  const ytdRevenue = (ytdSummaryRes.data?.total_net_revenue as number) ?? 0
  const ytdExpenses = (ytdExpenseSummaryRes.data?.total_expenses as number) ?? 0

  const recentTrips = (recentTripsRes.data ?? []) as TripWithRelations[]
  const discrepancies = recentTrips.filter(
    t => t.actual_payout != null && Math.abs(t.actual_payout - t.net_revenue) > 5
  )

  return {
    vehicles: vehiclesRes.data ?? [],
    recentTrips,
    openMaintenance: (maintenanceRes.data ?? []) as MaintenanceWithFleet[],
    ytdRevenue,
    ytdExpenses,
    totalTrips: recentTrips.length,
    expiringDocs: (expiringDocsRes.data ?? []) as unknown as ExpiringDocument[],
    payoutDiscrepancies: discrepancies,
  }
}

export async function buildFleetContext(): Promise<FleetContext> {
  if (cachedCtx && Date.now() - cachedCtx.ts < CACHE_TTL_MS) return cachedCtx.data
  const data = await fetchFleetContext()
  cachedCtx = { data, ts: Date.now() }
  return data
}

export function buildDynamicFleetSection(ctx: FleetContext): string {
  const vehicleList = ctx.vehicles.length
    ? ctx.vehicles.map(v => {
        const roiFields = v.purchase_price
          ? ` | Purchase: $${Number(v.purchase_price).toLocaleString()}${v.financing_monthly ? ` | Loan: $${v.financing_monthly}/mo` : ''}`
          : ''
        return `  [${v.id}] ${v.year} ${v.make} ${v.model} | Rate: $${v.daily_rate}/day | Mileage: ${v.current_mileage.toLocaleString()} mi | Status: ${v.status}${roiFields}${v.notes ? ` | Notes: ${v.notes}` : ''}`
      }).join('\n')
    : '  (No vehicles added yet)'

  const recentTripList = ctx.recentTrips.slice(0, 5).length
    ? ctx.recentTrips.slice(0, 5).map(t => {
        const trip = t as TripWithRelations
        const flag = trip.guests?.flag
        const flagNote = flag && flag !== 'none' ? ` | Flag: ${flag.toUpperCase()}` : ''
        const mileageInfo = t.start_mileage && t.end_mileage
          ? ` | Miles: ${t.start_mileage.toLocaleString()}→${t.end_mileage.toLocaleString()}`
          : t.miles_added ? ` | Miles added: ${t.miles_added}` : ''
        const payoutInfo = t.actual_payout != null
          ? ` | Paid: $${Number(t.actual_payout).toFixed(0)}${Math.abs(t.actual_payout - t.net_revenue) > 5 ? ' ⚠' : ''}`
          : ''
        return `  ${t.start_date}→${t.end_date} | Guest: ${t.guest_name}${flagNote} | Net: $${Number(t.net_revenue).toFixed(0)}${payoutInfo} | Host rating: ${t.host_rating ?? 'pending'}★${mileageInfo}`
      }).join('\n')
    : '  (No trips logged yet)'

  const maintenanceAlerts = ctx.openMaintenance.length
    ? ctx.openMaintenance.map(m => {
        const maint = m as MaintenanceWithFleet
        const vehicle = maint.fleet ? `${maint.fleet.make} ${maint.fleet.model}` : 'Unknown vehicle'
        const dueAt = maint.next_due_mileage ? ` | Due at: ${maint.next_due_mileage.toLocaleString()} mi` : ''
        const dueDate = maint.next_due_date ? ` | Due date: ${maint.next_due_date}` : ''
        return `  ${vehicle} | Service: ${maint.service_type} | Status: ${maint.status.replace('_', ' ')}${dueAt}${dueDate}`
      }).join('\n')
    : '  (No maintenance alerts)'

  const docAlerts = ctx.expiringDocs?.length
    ? ctx.expiringDocs.map(d => {
        const stub = Array.isArray(d.fleet) ? d.fleet[0] : d.fleet
        const vehicle = stub ? `${stub.make} ${stub.model}` : 'Unknown vehicle'
        return `  ${vehicle} | Document: ${d.name} | Type: ${d.document_type} | Expires: ${d.expiry_date}`
      }).join('\n')
    : null

  const payoutWarnings = ctx.payoutDiscrepancies?.length
    ? `\n⚠ PAYOUT DISCREPANCIES (${ctx.payoutDiscrepancies.length} trips): actual payout differs from expected net revenue by >$5. Investigate before answering payout questions.`
    : ''

  const netYTD = ctx.ytdRevenue - ctx.ytdExpenses
  const margin = ctx.ytdRevenue > 0 ? ((netYTD / ctx.ytdRevenue) * 100).toFixed(1) : '0.0'

  return `## HOST FLEET (${ctx.vehicles.length} vehicle${ctx.vehicles.length !== 1 ? 's' : ''})
${vehicleList}

## RECENT TRIPS (last 5 of ${ctx.totalTrips} shown)
${recentTripList}

## MAINTENANCE ALERTS (${ctx.openMaintenance.length} open)
${maintenanceAlerts}
${docAlerts ? `\n## DOCUMENT EXPIRY ALERTS (next 30 days)\n${docAlerts}` : ''}

## YTD FINANCIALS (${new Date().getFullYear()})
  Net revenue: $${ctx.ytdRevenue.toFixed(0)} | Expenses: $${ctx.ytdExpenses.toFixed(0)} | Net profit: $${netYTD.toFixed(0)} | Margin: ${margin}%${payoutWarnings}`
}

export function buildSystemPrompt(ctx: FleetContext): string {
  return `${STATIC_ROLE_AND_KNOWLEDGE}\n\n${buildDynamicFleetSection(ctx)}`
}
