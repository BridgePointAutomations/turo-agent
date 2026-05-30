import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function recalcGrossRevenue(tripId: string) {
  const { data: trip } = await supabase
    .from('trips')
    .select('start_date, end_date, daily_rate')
    .eq('id', tripId)
    .single()

  if (!trip) return

  const days = Math.ceil(
    (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
  )
  const base = days * trip.daily_rate

  const { data: items } = await supabase
    .from('trip_line_items')
    .select('amount, type')
    .eq('trip_id', tripId)

  const adjustments = (items ?? []).reduce((sum, item) => {
    return item.type === 'discount' ? sum - item.amount : sum + item.amount
  }, 0)

  await supabase.from('trips').update({ gross_revenue: base + adjustments }).eq('id', tripId)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tripId = searchParams.get('trip_id')
  if (!tripId) return NextResponse.json({ error: 'trip_id required' }, { status: 400 })
  const { data, error } = await supabase.from('trip_line_items').select('*').eq('trip_id', tripId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('trip_line_items').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await recalcGrossRevenue(body.trip_id)
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const { data: item } = await supabase.from('trip_line_items').select('trip_id').eq('id', id).single()
  const { error } = await supabase.from('trip_line_items').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (item?.trip_id) await recalcGrossRevenue(item.trip_id)
  return NextResponse.json({ success: true })
}
