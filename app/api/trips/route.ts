import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicle_id')
  let query = supabase.from('trips').select('*, fleet(make,model,year)').order('start_date', { ascending: false })
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('trips').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Update vehicle mileage if miles_added provided
  if (body.miles_added && body.vehicle_id) {
    const { data: vehicle } = await supabase.from('fleet').select('current_mileage').eq('id', body.vehicle_id).single()
    if (vehicle) {
      await supabase.from('fleet').update({
        current_mileage: (vehicle.current_mileage || 0) + body.miles_added
      }).eq('id', body.vehicle_id)
    }
  }

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase.from('trips').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
