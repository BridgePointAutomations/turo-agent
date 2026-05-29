import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const DEFAULT_MAINTENANCE = [
  { service_type: 'Oil Change', interval_miles: 5000, interval_days: 180 },
  { service_type: 'Tire Rotation', interval_miles: 7500, interval_days: 180 },
  { service_type: 'Air Filter', interval_miles: 15000, interval_days: 365 },
  { service_type: 'Brake Inspection', interval_miles: 20000, interval_days: 365 },
  { service_type: 'Registration Renewal', interval_days: 365 },
]

export async function GET() {
  const { data, error } = await supabase.from('fleet').select('*').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('fleet').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Seed default maintenance schedule for new vehicle
  const maintenanceSeeds = DEFAULT_MAINTENANCE.map(m => ({
    vehicle_id: data.id,
    ...m,
    status: 'ok',
  }))
  await supabase.from('maintenance').insert(maintenanceSeeds)

  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase.from('fleet').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  const { error } = await supabase.from('fleet').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
