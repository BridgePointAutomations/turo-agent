import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildDynamicFleetSection } from '@/lib/context'

const anthropic = new Anthropic()

function buildSystemPrompt(excludeTitles: string[]): string {
  const dedupeClause = excludeTitles.length
    ? `\n\nDO NOT REPEAT:\nThe following tip titles were already shown to this host in a previous refresh this session:\n${excludeTitles.map(t => `- ${t}`).join('\n')}\nDo not repeat these titles or restate the same underlying fact (same vehicle/metric) in different words. Surface a DIFFERENT grounded fact from the data below — a different vehicle, a different metric (e.g. if you last flagged the most-overdue maintenance item, this time surface the next most urgent, or a document expiring soon, or a payout discrepancy, or a low-margin vehicle, or a guest flag). If, after excluding the above, there genuinely are no other meaningful grounded facts to surface, return FEWER than 4 tips — including an empty array [] — rather than repeating, paraphrasing, or inventing content. Never fabricate a number or trend that isn't in the data below.`
    : ''

  return `You are a Turo fleet business advisor generating personalized daily insights.

RULES:
- Generate exactly 4 tips as a JSON array (unless the DO NOT REPEAT section below tells you to return fewer). Return ONLY the array — no markdown, no code fences, no other text.
- Each tip MUST reference specific data from the fleet context: use actual vehicle names (make/model), dollar amounts, mileage numbers, guest names, or dates from the data below.
- If a vehicle needs maintenance, name it. If YTD profit margin is low, state the actual margin. If a document expires soon, name the vehicle and document.
- Generic tips like "consider raising your prices" are forbidden. Every tip must be grounded in the host's actual numbers.
- If no fleet data exists yet, generate onboarding tips to help the host get started.

Each JSON object must have:
- "category": one of "pricing", "maintenance", "tax", "bookings"
- "title": 4-6 words, specific (e.g. "Accord Oil Change Overdue" not "Maintenance Needed")
- "tip": one sentence under 25 words citing a real data point from the fleet context
- "prompt": a ready-to-send question for the AI advisor referencing the specific vehicle/issue (under 18 words)${dedupeClause}`
}

function parseTipsResponse(raw: string) {
  try {
    return JSON.parse(raw)
  } catch {
    const match = raw.match(/\[[\s\S]*\]/)
    return match ? JSON.parse(match[0]) : []
  }
}

export async function GET() {
  try {
    const ctx = await buildFleetContext()
    const fleetSection = buildDynamicFleetSection(ctx)

    const hasData = ctx.vehicles.length > 0 || ctx.recentTrips.length > 0

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: buildSystemPrompt([]),
      messages: [
        {
          role: 'user',
          content: `Fleet context (${new Date().toLocaleDateString()}):\n\n${fleetSection}\n\n${hasData ? 'Generate 4 personalized tips grounded in the data above.' : 'No fleet data yet — generate 4 onboarding tips to help the host get set up.'}`,
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const tips = parseTipsResponse(raw)

    return NextResponse.json(tips)
  } catch (err) {
    console.error('[tips]', err)
    return NextResponse.json([], { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const { excludeTitles = [] } = await req.json().catch(() => ({ excludeTitles: [] as string[] }))

    const ctx = await buildFleetContext()
    const fleetSection = buildDynamicFleetSection(ctx)
    const hasData = ctx.vehicles.length > 0 || ctx.recentTrips.length > 0

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      temperature: 1,
      system: buildSystemPrompt(excludeTitles),
      messages: [
        {
          role: 'user',
          content: `Fleet context (${new Date().toLocaleDateString()}):\n\n${fleetSection}\n\n${hasData ? 'Generate up to 4 personalized tips grounded in the data above, avoiding anything already shown.' : 'No fleet data yet — generate 4 onboarding tips to help the host get set up.'}`,
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'
    const tips = parseTipsResponse(raw)

    const noNewInsights = excludeTitles.length > 0 && Array.isArray(tips) && tips.length === 0

    return NextResponse.json({ tips, noNewInsights })
  } catch (err) {
    console.error('[tips][POST]', err)
    return NextResponse.json({ tips: [], noNewInsights: false }, { status: 500 })
  }
}
