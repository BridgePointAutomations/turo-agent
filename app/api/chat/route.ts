import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildSystemPrompt } from '@/lib/context'
import type { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages }: { messages: ChatMessage[] } = await req.json()

    // Build live fleet context from DB on every request
    const ctx = await buildFleetContext()
    const systemPrompt = buildSystemPrompt(ctx)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    })

    const reply = response.content.find(b => b.type === 'text')?.text || 'No response.'
    return NextResponse.json({ reply })
  } catch (error: any) {
    console.error('Chat error:', error)
    return NextResponse.json({ reply: 'Error: ' + error.message }, { status: 500 })
  }
}
