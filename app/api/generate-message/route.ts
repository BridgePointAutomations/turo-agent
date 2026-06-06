import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

export const runtime = 'nodejs'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const FLAG_CONTEXT: Record<string, string> = {
  great: 'This is a great, trusted guest — be warm and appreciative.',
  caution: 'This guest requires some caution — be professional, clear, and firm.',
  blocked: 'This guest is blocked — keep the message formal and direct.',
  none: 'Standard guest interaction — be friendly and professional.',
}

export async function POST(req: NextRequest) {
  const enc = new TextEncoder()
  const { purpose, guestName, guestFlag, carName, tripDates } = await req.json()

  if (!purpose || !guestName) {
    return new Response('{"error":"purpose and guestName required"}', { status: 400 })
  }

  const userPrompt = [
    `Write a "${purpose}" message for guest ${guestName}.`,
    FLAG_CONTEXT[guestFlag] ?? FLAG_CONTEXT.none,
    carName ? `Car: ${carName}.` : '',
    tripDates ? `Trip dates: ${tripDates}.` : '',
  ].filter(Boolean).join(' ')

  const readable = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`))

      try {
        const stream = anthropic.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 512,
          system:
            'You are a professional Turo car-sharing host writing concise, friendly guest messages. ' +
            'Write a single ready-to-send message. No placeholders — use the actual guest name and car. ' +
            'No subject line. No preamble. Just the message text.',
          messages: [{ role: 'user', content: userPrompt }],
        })

        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            send({ delta: event.delta.text })
          }
        }

        send({ done: true })
      } catch (err) {
        send({ error: err instanceof Error ? err.message : String(err) })
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
