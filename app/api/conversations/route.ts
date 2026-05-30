import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at, updated_at, conversation_messages(count)')
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const formatted = (data ?? []).map(c => ({
    id: c.id,
    title: c.title,
    created_at: c.created_at,
    updated_at: c.updated_at,
    message_count: (c.conversation_messages as any)?.[0]?.count ?? 0,
  }))

  return NextResponse.json(formatted)
}

export async function POST() {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ title: 'New conversation' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('conversations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
