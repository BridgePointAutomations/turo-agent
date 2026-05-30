import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildDynamicFleetSection } from '@/lib/context'

const anthropic = new Anthropic()

export async function GET() {
  try {
    const ctx = await buildFleetContext()
    const fleetSection = buildDynamicFleetSection(ctx)

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: `You are a Turo fleet business advisor. Based on the host's fleet data, generate exactly 4 concise, actionable tips or insights.
Return ONLY a valid JSON array with no markdown, no code fences, no extra text. Each item must have:
- "category": one of "pricing", "maintenance", "tax", "bookings"
- "title": short title (4-6 words max)
- "tip": one sentence describing the insight or action (under 20 words)
- "prompt": a ready-to-send question for the AI advisor (under 15 words)`,
      messages: [
        {
          role: 'user',
          content: `Here is the current fleet data:\n\n${fleetSection}\n\nGenerate 4 tips as a JSON array.`,
        },
      ],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text.trim() : '[]'

    let tips
    try {
      tips = JSON.parse(raw)
    } catch {
      // Try to extract JSON array if model added extra text
      const match = raw.match(/\[[\s\S]*\]/)
      tips = match ? JSON.parse(match[0]) : []
    }

    return NextResponse.json(tips)
  } catch (err) {
    console.error('[tips]', err)
    return NextResponse.json([], { status: 500 })
  }
}
