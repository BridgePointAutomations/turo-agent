import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('message_templates')
    .select('key, body')

  if (error) return NextResponse.json({}, { status: 500 })

  const map: Record<string, string> = {}
  for (const row of data ?? []) {
    map[row.key] = row.body
  }
  return NextResponse.json(map)
}

export async function PATCH(req: NextRequest) {
  const { key, body } = await req.json()
  if (!key || typeof body !== 'string') {
    return NextResponse.json({ error: 'key and body required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('message_templates')
    .upsert({ key, body, updated_at: new Date().toISOString() })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
