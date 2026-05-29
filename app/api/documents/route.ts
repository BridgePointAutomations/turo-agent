import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicle_id')
  let query = supabase.from('vehicle_documents').select('*').order('created_at', { ascending: false })
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('vehicle_documents').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id, storage_path, bucket } = await req.json()
  if (storage_path && bucket) {
    await supabase.storage.from(bucket).remove([storage_path])
  }
  const { error } = await supabase.from('vehicle_documents').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
