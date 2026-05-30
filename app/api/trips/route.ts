import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function syncGuestStats(guestId: string) {
  const { data: trips } = await supabase
    .from('trips')
    .select('host_rating, end_date')
    .eq('guest_id', guestId)

  if (!trips) return

  const total_trips = trips.length
  const ratings = trips.map(t => t.host_rating).filter(r => r != null)
  const avg_rating = ratings.length > 0
    ? Math.round((ratings.reduce((s, r) => s + r, 0) / ratings.length) * 10) / 10
    : null
  const last_trip_date = trips
    .map(t => t.end_date)
    .filter(Boolean)
    .sort()
    .reverse()[0] ?? null

  await supabase.from('guests').update({ total_trips, avg_rating, last_trip_date }).eq('id', guestId)
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicle_id')
  const guestId = searchParams.get('guest_id')

  let query = supabase
    .from('trips')
    .select('*, fleet(make,model,year), guests(id,name,flag), trip_line_items(*)')
    .order('start_date', { ascending: false })

  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  if (guestId) query = query.eq('guest_id', guestId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { line_items, ...tripData } = body

  // Compute gross_revenue from base + line items if line items provided
  if (line_items && line_items.length > 0) {
    const adjustments = line_items.reduce((sum: number, item: { type: string; amount: number }) => {
      return item.type === 'discount' ? sum - item.amount : sum + item.amount
    }, 0)
    tripData.gross_revenue = (tripData.gross_revenue || 0) + adjustments
  }

  const { data, error } = await supabase.from('trips').insert(tripData).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert line items
  if (line_items && line_items.length > 0) {
    await supabase.from('trip_line_items').insert(
      line_items.map((item: { label: string; amount: number; type: string }) => ({
        trip_id: data.id,
        label: item.label,
        amount: item.amount,
        type: item.type,
      }))
    )
  }

  // Update vehicle mileage if miles_added provided
  if (body.miles_added && body.vehicle_id) {
    const { data: vehicle } = await supabase.from('fleet').select('current_mileage').eq('id', body.vehicle_id).single()
    if (vehicle) {
      await supabase.from('fleet').update({
        current_mileage: (vehicle.current_mileage || 0) + body.miles_added
      }).eq('id', body.vehicle_id)
    }
  }

  // Sync guest stats
  if (tripData.guest_id) await syncGuestStats(tripData.guest_id)

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase.from('trips').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sync guest stats if guest_id is set on the updated trip
  const guestId = updates.guest_id ?? data?.guest_id
  if (guestId) await syncGuestStats(guestId)

  return NextResponse.json(data)
}
