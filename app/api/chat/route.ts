import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildDynamicFleetSection, STATIC_ROLE_AND_KNOWLEDGE } from '@/lib/context'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/lib/types'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// Max messages sent to Claude per turn — prevents quadratic token cost growth
const MAX_HISTORY = 20

// Tool definitions — read-only Supabase lookups Claude can invoke when context is insufficient
const FLEET_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_all_ytd_trips',
    description: 'Fetch every trip for the current year with full revenue details. Use when you need accurate YTD metrics that go beyond the 10 trips already shown in context.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_expense_breakdown',
    description: 'Fetch all year-to-date expenses by category. Use for tax analysis, profitability breakdown, or comparing expense categories.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_guest',
    description: 'Look up a guest by name and return their full trip history and flag status.',
    input_schema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Guest first and/or last name to search for' } },
      required: ['name'],
    },
  },
]

async function runTools(contentBlocks: Anthropic.ContentBlock[]): Promise<Anthropic.ToolResultBlockParam[]> {
  const results: Anthropic.ToolResultBlockParam[] = []
  const yearStart = `${new Date().getFullYear()}-01-01`

  for (const block of contentBlocks) {
    if (block.type !== 'tool_use') continue
    let output: string
    try {
      if (block.name === 'get_all_ytd_trips') {
        const { data } = await supabase
          .from('trips').select('*, fleet(make,model,year), guests(name,flag)')
          .gte('start_date', yearStart).order('start_date', { ascending: false })
        output = JSON.stringify(data ?? [])
      } else if (block.name === 'get_expense_breakdown') {
        const { data } = await supabase
          .from('expenses').select('*').gte('date', yearStart).order('category')
        output = JSON.stringify(data ?? [])
      } else if (block.name === 'search_guest') {
        const name = (block.input as { name: string }).name
        const { data } = await supabase
          .from('guests').select('*, trips(*)').ilike('name', `%${name}%`).limit(5)
        output = JSON.stringify(data ?? [])
      } else {
        output = 'Unknown tool'
      }
    } catch (err) {
      output = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({ type: 'tool_result', tool_use_id: block.id, content: output })
  }
  return results
}

// Routes simple factual queries to Haiku, complex analysis to Sonnet
function selectModel(message: string): string {
  const lower = message.toLowerCase().trim()
  const isSimple =
    lower.length < 100 &&
    /^(what|how much|how many|when|show|list|is |are |do i|does my)\b/.test(lower)
  return isSimple ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
}

// Retries on transient Anthropic API errors (429, 503, 529) with exponential backoff
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

export async function POST(req: NextRequest) {
  const enc = new TextEncoder()
  const { messages, conversation_id }: { messages: ChatMessage[]; conversation_id?: string } =
    await req.json()

  // Load full history from DB, append the new user message
  let messagesToSend: ChatMessage[] = messages
  if (conversation_id) {
    const { data: dbMessages } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
    if (dbMessages && dbMessages.length > 0) {
      const lastClientMsg = messages[messages.length - 1]
      messagesToSend = [...(dbMessages as ChatMessage[]), lastClientMsg]
    }
  }

  // Trim to last MAX_HISTORY messages to control token cost on long conversations
  const trimmedMessages = messagesToSend.slice(-MAX_HISTORY)

  const ctx = await buildFleetContext()
  const dynamicSection = buildDynamicFleetSection(ctx)
  const model = selectModel(messages[messages.length - 1].content)

  // System prompt split for prompt caching:
  // Block 0: static role + knowledge base — marked ephemeral so Anthropic caches it
  // Block 1: dynamic fleet data — changes each request, not cached
  const systemBlocks: Anthropic.TextBlockParam[] = [
    { type: 'text', text: STATIC_ROLE_AND_KNOWLEDGE, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: dynamicSection },
  ]

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      let fullText = ''

      try {
        // First streaming pass — Claude may respond with text or invoke a tool
        const stream1 = await withRetry(() =>
          Promise.resolve(
            anthropic.messages.stream({
              model,
              max_tokens: 4096,
              system: systemBlocks,
              messages: trimmedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
              tools: FLEET_TOOLS,
            })
          )
        )

        for await (const event of stream1) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            fullText += event.delta.text
            send({ delta: event.delta.text })
          }
        }

        const firstMsg = await stream1.finalMessage()

        if (firstMsg.stop_reason === 'tool_use') {
          // Execute tools and stream the tool-augmented answer
          const toolResults = await runTools(firstMsg.content)
          const messagesWithTool: Anthropic.MessageParam[] = [
            ...trimmedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'assistant', content: firstMsg.content },
            { role: 'user', content: toolResults },
          ]
          fullText = '' // discard any pre-tool preamble; the real answer follows

          const stream2 = await withRetry(() =>
            Promise.resolve(
              anthropic.messages.stream({
                model,
                max_tokens: 4096,
                system: systemBlocks,
                messages: messagesWithTool,
              })
            )
          )
          for await (const event of stream2) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              fullText += event.delta.text
              send({ delta: event.delta.text })
            }
          }
        }

        send({ done: true })

        // Persist after streaming — client already has the response
        if (conversation_id) {
          const userMsg = messages[messages.length - 1]
          await supabase.from('conversation_messages').insert([
            { conversation_id, role: 'user', content: userMsg.content },
            { conversation_id, role: 'assistant', content: fullText },
          ])

          const { data: conv } = await supabase
            .from('conversations')
            .select('title, conversation_messages(count)')
            .eq('id', conversation_id)
            .single()

          const msgCount = (conv?.conversation_messages as Record<string, number>[])?.[0]?.count ?? 0
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (conv?.title === 'New conversation' && msgCount <= 2) {
            updates.title = userMsg.content.slice(0, 60).trim()
          }
          await supabase.from('conversations').update(updates).eq('id', conversation_id)
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('Chat error:', msg)
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
