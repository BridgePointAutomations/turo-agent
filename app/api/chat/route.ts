import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildSystemPrompt } from '@/lib/context'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { messages, conversation_id }: { messages: ChatMessage[]; conversation_id?: string } = await req.json()

    let messagesToSend: ChatMessage[] = messages

    // If conversation_id provided, load full history from DB and use that instead
    if (conversation_id) {
      const { data: dbMessages } = await supabase
        .from('conversation_messages')
        .select('role, content')
        .eq('conversation_id', conversation_id)
        .order('created_at', { ascending: true })

      if (dbMessages && dbMessages.length > 0) {
        // Append the new user message to the DB history
        const lastClientMsg = messages[messages.length - 1]
        messagesToSend = [...(dbMessages as ChatMessage[]), lastClientMsg]
      }
    }

    const ctx = await buildFleetContext()
    const systemPrompt = buildSystemPrompt(ctx)

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: messagesToSend.map(m => ({ role: m.role, content: m.content })),
    })

    const reply = response.content.find(b => b.type === 'text')?.text || 'No response.'

    // Persist to DB if conversation_id provided
    if (conversation_id) {
      const userMsg = messages[messages.length - 1]
      await supabase.from('conversation_messages').insert([
        { conversation_id, role: 'user', content: userMsg.content },
        { conversation_id, role: 'assistant', content: reply },
      ])

      // Auto-title on first exchange if still default
      const { data: conv } = await supabase
        .from('conversations')
        .select('title, conversation_messages(count)')
        .eq('id', conversation_id)
        .single()

      const msgCount = (conv?.conversation_messages as any)?.[0]?.count ?? 0
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }

      if (conv?.title === 'New conversation' && msgCount <= 2) {
        updates.title = userMsg.content.slice(0, 60).trim()
      }

      await supabase.from('conversations').update(updates).eq('id', conversation_id)
    }

    return NextResponse.json({ reply })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Chat error:', msg)
    return NextResponse.json({ reply: 'Error: ' + msg }, { status: 500 })
  }
}
