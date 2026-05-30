import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

function computeStatus(item: {
  status: string
  next_due_date?: string | null
  next_due_mileage?: number | null
  fleet?: { current_mileage?: number | null } | null
}): 'ok' | 'due_soon' | 'overdue' | 'completed' {
  // Completed stays completed regardless of dates
  if (item.status === 'completed') return 'completed'

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const currentMileage = item.fleet?.current_mileage ?? null

  let overdueByDate = false
  let dueSoonByDate = false
  let overdueByMileage = false
  let dueSoonByMileage = false

  if (item.next_due_date) {
    const due = new Date(item.next_due_date)
    const daysUntilDue = Math.round((due.getTime() - today.getTime()) / 86400000)
    if (daysUntilDue < 0) overdueByDate = true
    else if (daysUntilDue <= 14) dueSoonByDate = true
  }

  if (item.next_due_mileage != null && currentMileage != null) {
    const milesLeft = item.next_due_mileage - currentMileage
    if (milesLeft < 0) overdueByMileage = true
    else if (milesLeft <= 500) dueSoonByMileage = true
  }

  if (overdueByDate || overdueByMileage) return 'overdue'
  if (dueSoonByDate || dueSoonByMileage) return 'due_soon'
  return 'ok'
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const vehicleId = searchParams.get('vehicle_id')
  let query = supabase.from('maintenance').select('*, fleet(make,model,year,current_mileage)').order('status')
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Compute live status from dates and mileage; persist changes back to DB in the background
  const now = Date.now()
  const updated: { id: string; status: string }[] = []
  const result = (data ?? []).map((item: any) => {
    const liveStatus = computeStatus(item)
    if (liveStatus !== item.status) updated.push({ id: item.id, status: liveStatus })
    return { ...item, status: liveStatus }
  })

  // Fire-and-forget: sync computed statuses back to the DB so the maintenance page stays accurate
  if (updated.length > 0) {
    Promise.all(
      updated.map(({ id, status }) =>
        supabase.from('maintenance').update({ status }).eq('id', id)
      )
    )
  }

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { data, error } = await supabase.from('maintenance').insert(body).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: NextRequest) {
  const { id, ...updates } = await req.json()
  const { data, error } = await supabase.from('maintenance').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  const { error } = await supabase.from('maintenance').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
