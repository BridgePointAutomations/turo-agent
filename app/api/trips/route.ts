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

  // Auto-calculate miles_added from odometer readings when both are provided
  if (tripData.start_mileage != null && tripData.end_mileage != null) {
    tripData.miles_added = Math.max(0, tripData.end_mileage - tripData.start_mileage)
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

  // Update vehicle mileage — use end_mileage directly for accuracy when available
  if (tripData.end_mileage && tripData.vehicle_id) {
    await supabase.from('fleet').update({ current_mileage: tripData.end_mileage }).eq('id', tripData.vehicle_id)
  } else if (tripData.miles_added && tripData.vehicle_id) {
    const { data: vehicle } = await supabase.from('fleet').select('current_mileage').eq('id', tripData.vehicle_id).single()
    if (vehicle) {
      await supabase.from('fleet').update({
        current_mileage: (vehicle.current_mileage || 0) + tripData.miles_added
      }).eq('id', tripData.vehicle_id)
    }
  }

  // Sync guest stats
  if (tripData.guest_id) await syncGuestStats(tripData.guest_id)

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, line_items, ...updates } = await req.json()

  // Auto-calculate miles_added when both odometer readings are present
  if (updates.start_mileage != null && updates.end_mileage != null) {
    updates.miles_added = Math.max(0, updates.end_mileage - updates.start_mileage)
  } else if (updates.end_mileage != null && updates.start_mileage == null) {
    // Fetch existing start_mileage to compute the diff
    const { data: existing } = await supabase.from('trips').select('start_mileage').eq('id', id).single()
    if (existing?.start_mileage != null) {
      updates.miles_added = Math.max(0, updates.end_mileage - existing.start_mileage)
    }
  } else if (updates.start_mileage != null && updates.end_mileage == null) {
    const { data: existing } = await supabase.from('trips').select('end_mileage').eq('id', id).single()
    if (existing?.end_mileage != null) {
      updates.miles_added = Math.max(0, existing.end_mileage - updates.start_mileage)
    }
  }

  const { data, error } = await supabase.from('trips').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Replace line items when provided (delete all, re-insert)
  if (line_items !== undefined) {
    await supabase.from('trip_line_items').delete().eq('trip_id', id)
    if (line_items.length > 0) {
      await supabase.from('trip_line_items').insert(
        line_items.map((item: { label: string; amount: number; type: string }) => ({
          trip_id: id,
          label: item.label,
          amount: item.amount,
          type: item.type,
        }))
      )
    }
  }

  const guestId = updates.guest_id ?? data?.guest_id
  if (guestId) await syncGuestStats(guestId)

  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const { error } = await supabase.from('trips').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
