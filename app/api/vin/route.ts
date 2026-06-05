import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

interface NHTSADecodeResult {
  Variable: string
  Value: string | null
}

interface NHTSARecall {
  NHTSACampaignNumber: string
  Component: string
  Summary: string
  Consequence: string
  Remedy: string
}

interface NHTSAComplaint {
  components: string
  summary: string
}

interface NHTSAInvestigation {
  InvestigationNumber: string
  Component: string
  Summary: string
  OpeningDate: string
  InvestigationStatus: string
}

interface NHTSASafetyRating {
  OverallRating: string
  OverallFrontCrashRating: string
  OverallSideCrashRating: string
  RolloverRating: string
  RolloverPossibility: string
  VehicleDescription: string
}

function extractField(results: NHTSADecodeResult[], name: string): string {
  return results.find(r => r.Variable === name)?.Value?.trim() || 'Unknown'
}

function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(id))
}

async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try { return await fn() }
    catch (err: unknown) {
      const status = (err as Record<string, unknown>)?.status as number | undefined
      const isRetryable = status === 429 || status === 503 || status === 529
      if (!isRetryable || attempt === maxAttempts) throw err
      await new Promise(r => setTimeout(r, 2 ** (attempt - 1) * 1000))
    }
  }
  throw new Error('unreachable')
}

const SYSTEM_PROMPT = `You are VINAnalyst, an expert automotive advisor for Turo fleet hosts evaluating used car purchases. You generate structured pre-purchase analysis reports in clean Markdown. You have deep knowledge of:
- Used car reliability by make/model/year and common failure patterns
- Turo-specific vehicle suitability: guest appeal, damage claim risk, cleaning time, insurance cost, listing competitiveness
- Turo earnings math: host payouts (~67-75% of gross at standard protection), dynamic pricing seasonality, daily rate benchmarks by vehicle class in the Midwest market
- Depreciation curves, breakeven analysis, and ROI for fleet vehicles
- Pre-purchase inspection priorities by mileage bracket and model reputation

OUTPUT RULES:
- Respond with markdown sections using ## headers in exactly this order
- For the Turo Fleet Verdict section, the first line must be exactly one of: **BUY**, **PASS**, or **NEGOTIATE** followed by a single sentence reason on the same line
- For the Earnings Estimate section, show all earnings math in a GFM pipe table
- For the Vehicle History section, present accident/ownership data in a GFM table when data is available
- For the Safety & Recall Summary section, present crash test ratings in a GFM table
- Be direct and specific — use the actual numbers provided (purchase price, mileage, recall counts, crash test ratings)
- Never hedge with "I'm not sure" — give your best expert estimate; flag uncertainty inline with "(est.)"
- Markdown renders fully — use tables, bold, bullet lists throughout`

export async function POST(req: NextRequest) {
  const enc = new TextEncoder()

  let body: { vin: string; purchasePrice: number; mileage: number }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const vin = (body.vin ?? '').toString().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17)
  const purchasePrice = Number(body.purchasePrice) || 0
  const mileage = Number(body.mileage) || 0

  if (vin.length !== 17) {
    return NextResponse.json({ error: 'VIN must be exactly 17 alphanumeric characters.' }, { status: 400 })
  }

  // Step 1: VIN decode
  let decodeResults: NHTSADecodeResult[] = []
  try {
    const decodeRes = await fetchWithTimeout(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
    )
    const decodeData = await decodeRes.json()
    decodeResults = decodeData.Results ?? []
  } catch {
    return NextResponse.json({ error: 'Failed to reach NHTSA VIN decode service. Try again.' }, { status: 502 })
  }

  const make = extractField(decodeResults, 'Make')
  const model = extractField(decodeResults, 'Model')
  const year = extractField(decodeResults, 'Model Year')
  const errorCode = extractField(decodeResults, 'Error Code')

  if (make === 'Unknown' || make === '' || (errorCode && errorCode !== '0' && errorCode !== '')) {
    return NextResponse.json({ error: 'VIN not recognized. Check for typos and ensure the VIN is 17 characters.' }, { status: 400 })
  }

  const trim = extractField(decodeResults, 'Trim')
  const bodyClass = extractField(decodeResults, 'Body Class')
  const cylinders = extractField(decodeResults, 'Engine Number of Cylinders')
  const displacement = extractField(decodeResults, 'Displacement (L)')
  const fuelType = extractField(decodeResults, 'Fuel Type - Primary')
  const driveType = extractField(decodeResults, 'Drive Type')
  const transmissionStyle = extractField(decodeResults, 'Transmission Style')
  const plantCountry = extractField(decodeResults, 'Plant Country')

  // Step 2: Fetch secondary data in parallel
  const makeSafe = encodeURIComponent(make)
  const modelSafe = encodeURIComponent(model)
  const vinAuditKey = process.env.VINAUDIT_API_KEY

  const [recallsResult, complaintsResult, ratingsResult, investigationsResult, vinAuditResult] =
    await Promise.allSettled([
      fetchWithTimeout(`https://api.nhtsa.gov/recalls/recallsByVehicle?make=${makeSafe}&model=${modelSafe}&modelYear=${year}`)
        .then(r => r.json()),
      fetchWithTimeout(`https://api.nhtsa.gov/complaints/complaintsByVehicle?make=${makeSafe}&model=${modelSafe}&modelYear=${year}`)
        .then(r => r.json()),
      fetchWithTimeout(`https://api.nhtsa.gov/SafetyRatings/modelyear/${year}/make/${makeSafe}/model/${modelSafe}`)
        .then(r => r.json()),
      fetchWithTimeout(`https://api.nhtsa.gov/investigations/?make=${makeSafe}&model=${modelSafe}&modelYear=${year}`)
        .then(r => r.json()),
      vinAuditKey
        ? fetchWithTimeout(`https://www.vinaudit.com/api/v2/vehicle_history/?format=json&key=${vinAuditKey}&vin=${vin}`)
            .then(r => r.json())
        : Promise.resolve(null),
    ])

  // Parse recalls
  let recallsText = 'No open recalls found.'
  if (recallsResult.status === 'fulfilled') {
    const recalls: NHTSARecall[] = recallsResult.value?.results ?? []
    if (recalls.length > 0) {
      const top = recalls.slice(0, 5)
      recallsText = `${recalls.length} recall(s) on record:\n` +
        top.map(r => `- [${r.NHTSACampaignNumber}] **${r.Component}**: ${r.Summary}`).join('\n') +
        (recalls.length > 5 ? `\n- …and ${recalls.length - 5} more` : '')
    }
  } else {
    recallsText = '(Recalls data unavailable — NHTSA API timeout)'
  }

  // Parse complaints — group by component category
  let complaintsText = 'No complaints data available.'
  if (complaintsResult.status === 'fulfilled') {
    const complaints: NHTSAComplaint[] = complaintsResult.value?.results ?? []
    if (complaints.length > 0) {
      const counts: Record<string, number> = {}
      for (const c of complaints) {
        const cat = c.components || 'Other'
        counts[cat] = (counts[cat] ?? 0) + 1
      }
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
      complaintsText = `${complaints.length} complaint(s) on record. Top categories:\n` +
        sorted.map(([cat, count]) => `- ${cat}: ${count} complaint(s)`).join('\n')
    } else {
      complaintsText = 'No complaints on record.'
    }
  } else {
    complaintsText = '(Complaints data unavailable — NHTSA API timeout)'
  }

  // Parse safety ratings
  let ratingsText = 'Crash test ratings not available for this vehicle.'
  if (ratingsResult.status === 'fulfilled') {
    const ratings: NHTSASafetyRating[] = ratingsResult.value?.Results ?? []
    if (ratings.length > 0) {
      const r = ratings[0]
      ratingsText = `Government crash test ratings (NHTSA):
| Category | Rating |
|---|---|
| Overall | ${r.OverallRating ?? 'N/A'} / 5 stars |
| Frontal Crash | ${r.OverallFrontCrashRating ?? 'N/A'} / 5 stars |
| Side Crash | ${r.OverallSideCrashRating ?? 'N/A'} / 5 stars |
| Rollover | ${r.RolloverRating ?? 'N/A'} / 5 stars |
| Rollover Probability | ${r.RolloverPossibility ?? 'N/A'} |`
    }
  }

  // Parse investigations
  let investigationsText = 'No active safety investigations.'
  if (investigationsResult.status === 'fulfilled') {
    const investigations: NHTSAInvestigation[] = investigationsResult.value?.results ?? []
    if (investigations.length > 0) {
      investigationsText = `${investigations.length} active/recent investigation(s):\n` +
        investigations.slice(0, 3).map(i =>
          `- [${i.InvestigationNumber}] ${i.Component} — ${i.Summary} (${i.InvestigationStatus})`
        ).join('\n')
    }
  }

  // Parse VinAudit history
  let historyText: string
  if (!vinAuditKey) {
    historyText = '(Vehicle history data not available — set VINAUDIT_API_KEY in .env.local to enable accident/ownership history from VinAudit)'
  } else if (vinAuditResult.status === 'rejected' || !vinAuditResult.value?.success) {
    console.warn('[vin] VinAudit fetch failed:', vinAuditResult.status === 'rejected' ? vinAuditResult.reason : vinAuditResult.value)
    historyText = '(Vehicle history data unavailable — VinAudit API error)'
  } else {
    const d = vinAuditResult.value.data ?? {}
    const accidents = d.accidents ?? []
    const owners = d.owners ?? 'Unknown'
    const titleEvents = d.title_events ?? []
    const mileageRecords = d.mileage_records ?? []
    const theftRecords = d.theft_records ?? []

    historyText = `Owners: ${owners}
Accidents: ${accidents.length === 0 ? 'None reported' : accidents.length + ' accident(s)'}
${accidents.length > 0 ? accidents.slice(0, 5).map((a: Record<string, string>) => `  - ${a.date ?? ''} — ${a.type ?? ''} (${a.severity ?? 'unknown severity'})`).join('\n') : ''}
Title Events: ${titleEvents.length === 0 ? 'Clean title' : titleEvents.map((t: Record<string, string>) => t.brand ?? t.type ?? '').join(', ')}
Mileage Records: ${mileageRecords.length} odometer readings on file
Theft Records: ${theftRecords.length === 0 ? 'None' : theftRecords.length + ' record(s)'}`
  }

  // Build the Claude user message
  const userMessage = `Analyze this vehicle for Turo fleet acquisition:

## VEHICLE DATA (from NHTSA VIN Decode)
VIN: ${vin}
Year: ${year} | Make: ${make} | Model: ${model} | Trim: ${trim}
Body: ${bodyClass} | Engine: ${cylinders}-cyl ${displacement}L ${fuelType}
Drive: ${driveType} | Transmission: ${transmissionStyle}
Country of Assembly: ${plantCountry}

## PURCHASE INPUTS
Purchase Price: $${purchasePrice.toLocaleString()}
Current Mileage: ${mileage.toLocaleString()} miles

## SAFETY RATINGS
${ratingsText}

## ACTIVE INVESTIGATIONS
${investigationsText}

## SAFETY RECALLS
${recallsText}

## COMPLAINT PATTERNS
${complaintsText}

## VEHICLE HISTORY
${historyText}

---

Generate a complete Turo Pre-Purchase Analysis Report with these sections in order:

## 1. Vehicle Decode
## 2. Vehicle History
## 3. Safety & Recall Summary
## 4. Known Issues
## 5. Turo Fleet Verdict
## 6. Earnings Estimate
## 7. Turo Pros
## 8. Turo Cons
## 9. Maintenance Watchlist
## 10. Negotiation Guidance
## 11. Pre-Purchase Checklist`

  // Step 3: Stream Claude response
  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const stream = await withRetry(() =>
          Promise.resolve(
            anthropic.messages.stream({
              model: 'claude-sonnet-4-6',
              max_tokens: 2500,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMessage }],
            })
          )
        )

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ delta: event.delta.text })
          }
        }

        send({ done: true })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[vin] Claude error:', msg)
        send({ error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
