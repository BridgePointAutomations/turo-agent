import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { buildFleetContext, buildDynamicFleetSection, STATIC_ROLE_AND_KNOWLEDGE } from '@/lib/context'
import { supabase } from '@/lib/supabase'
import type { ChatMessage } from '@/lib/types'
import type { ConversationWithCount } from '@/lib/database.types'

export const runtime = 'nodejs'

type ToolName = 'get_all_ytd_trips' | 'get_expense_breakdown' | 'search_guest' | 'get_vehicle_trip_history' | 'get_upcoming_trips'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAX_HISTORY = 20

const FLEET_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_all_ytd_trips' satisfies ToolName,
    description: `Fetch every trip for the current year with full revenue details.
Use when: the host asks about YTD totals, annual summaries, or trends across more trips than shown in context.
Do NOT use when: YTD revenue/expenses are already present in the ## FINANCIALS section and the host is asking a simple lookup question.`,
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_expense_breakdown' satisfies ToolName,
    description: `Fetch all year-to-date expenses grouped by category with full details.
Use when: the host asks about specific expense categories, tax deductions, Schedule C prep, or wants to compare spending areas.
Do NOT use when: total expenses are already shown in ## FINANCIALS and no category breakdown is needed.`,
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'search_guest' satisfies ToolName,
    description: `Look up a guest by name and return their full profile, flag status, and complete trip history.
Use when: the host mentions a guest by name and needs their history, rating, or flag context.
Do NOT use when: guest data is already present in ## RECENT TRIPS context.`,
    input_schema: {
      type: 'object' as const,
      properties: { name: { type: 'string', description: 'Guest first and/or last name' } },
      required: ['name'],
    },
  },
  {
    name: 'get_vehicle_trip_history' satisfies ToolName,
    description: `Fetch the complete trip history and revenue stats for a specific vehicle.
Use when: the host asks about a specific car's performance, ROI, utilization rate, or wants to compare vehicles.
Do NOT use when: the question is about the overall fleet rather than one specific vehicle.`,
    input_schema: {
      type: 'object' as const,
      properties: { vehicle_id: { type: 'string', description: 'UUID of the vehicle from the fleet list' } },
      required: ['vehicle_id'],
    },
  },
  {
    name: 'get_upcoming_trips' satisfies ToolName,
    description: `Fetch all upcoming and active trips sorted by start date.
Use when: the host asks about their schedule, upcoming bookings, gaps in calendar, or availability.
Do NOT use when: the question is about past trips or historical revenue.`,
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
]

type ToolHandler = (input: Record<string, string>) => Promise<string>

async function buildToolHandlers(): Promise<Record<ToolName, ToolHandler>> {
  const yearStart = `${new Date().getFullYear()}-01-01`
  const today = new Date().toISOString().slice(0, 10)

  return {
    get_all_ytd_trips: async () => {
      const { data } = await supabase
        .from('trips')
        .select('*, fleet(make,model,year), guests(name,flag)')
        .gte('start_date', yearStart)
        .order('start_date', { ascending: false })
      return JSON.stringify(data ?? [])
    },
    get_expense_breakdown: async () => {
      const { data } = await supabase
        .from('expenses')
        .select('*')
        .gte('date', yearStart)
        .order('category')
      return JSON.stringify(data ?? [])
    },
    search_guest: async ({ name }) => {
      const { data } = await supabase
        .from('guests')
        .select('*, trips(*)')
        .ilike('name', `%${name}%`)
        .limit(5)
      return JSON.stringify(data ?? [])
    },
    get_vehicle_trip_history: async ({ vehicle_id }) => {
      const { data } = await supabase
        .from('trips')
        .select('*, guests(name,flag)')
        .eq('vehicle_id', vehicle_id)
        .order('start_date', { ascending: false })
      return JSON.stringify(data ?? [])
    },
    get_upcoming_trips: async () => {
      const { data } = await supabase
        .from('trips')
        .select('*, fleet(make,model,year), guests(name,flag)')
        .in('status', ['upcoming', 'active'])
        .gte('start_date', today)
        .order('start_date', { ascending: true })
      return JSON.stringify(data ?? [])
    },
  }
}

async function runTools(contentBlocks: Anthropic.ContentBlock[]): Promise<Anthropic.ToolResultBlockParam[]> {
  const handlers = await buildToolHandlers()
  const results: Anthropic.ToolResultBlockParam[] = []

  for (const block of contentBlocks) {
    if (block.type !== 'tool_use') continue
    let output: string
    try {
      const handler = handlers[block.name as ToolName]
      if (handler) {
        output = await handler(block.input as Record<string, string>)
      } else {
        output = `Unknown tool: ${block.name}`
      }
    } catch (err) {
      output = `Error: ${err instanceof Error ? err.message : String(err)}`
    }
    results.push({ type: 'tool_result', tool_use_id: block.id, content: output })
  }
  return results
}

function selectModel(message: string): string {
  const lower = message.toLowerCase().trim()
  const isSimple =
    lower.length < 100 &&
    /^(what|how much|how many|when|show|list|is |are |do i|does my)\b/.test(lower)
  return isSimple ? 'claude-haiku-4-5-20251001' : 'claude-sonnet-4-6'
}

function logTokenUsage(label: string, usage: Anthropic.Usage) {
  const u = usage as unknown as Record<string, unknown>
  console.log(`[tokens:${label}] input=${usage.input_tokens} output=${usage.output_tokens} cache_read=${u.cache_read_input_tokens ?? 0} cache_write=${u.cache_creation_input_tokens ?? 0}`)
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

export async function POST(req: NextRequest) {
  const enc = new TextEncoder()
  const { messages, conversation_id }: { messages: ChatMessage[]; conversation_id?: string } =
    await req.json()

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

  const trimmedMessages = messagesToSend.slice(-MAX_HISTORY)

  const ctx = await buildFleetContext()
  const dynamicSection = buildDynamicFleetSection(ctx)
  const firstPassModel = selectModel(messages[messages.length - 1].content)

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
        const stream1 = await withRetry(() =>
          Promise.resolve(
            anthropic.messages.stream({
              model: firstPassModel,
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
        logTokenUsage(`pass1:${firstPassModel}`, firstMsg.usage)

        if (firstMsg.stop_reason === 'tool_use') {
          const toolResults = await runTools(firstMsg.content)
          const messagesWithTool: Anthropic.MessageParam[] = [
            ...trimmedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
            { role: 'assistant', content: firstMsg.content },
            { role: 'user', content: toolResults },
          ]
          fullText = ''

          // Tool-augmented answers always use Sonnet — complexity is guaranteed
          const stream2 = await withRetry(() =>
            Promise.resolve(
              anthropic.messages.stream({
                model: 'claude-sonnet-4-6',
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
          const secondMsg = await stream2.finalMessage()
          logTokenUsage('pass2:sonnet', secondMsg.usage)
        }

        send({ done: true })

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

          const msgCount = (conv as ConversationWithCount | null)?.conversation_messages?.[0]?.count ?? 0
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
