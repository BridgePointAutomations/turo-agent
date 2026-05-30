// Hand-crafted from supabase/schema.sql — replace with `supabase gen types typescript` once CLI is wired up

export interface DbFleet {
  id: string
  created_at: string
  make: string
  model: string
  year: number
  color: string | null
  license_plate: string | null
  vin: string | null
  daily_rate: number
  current_mileage: number
  status: 'active' | 'inactive' | 'maintenance'
  turo_listing_id: string | null
  notes: string | null
  purchase_price: number | null
  purchase_date: string | null
  financing_monthly: number | null
  financing_months: number | null
  depreciation_annual: number | null
}

export interface DbTrip {
  id: string
  created_at: string
  vehicle_id: string | null
  guest_name: string
  guest_id: string | null
  start_date: string
  end_date: string
  daily_rate: number
  gross_revenue: number
  turo_fee_pct: number
  net_revenue: number
  guest_rating: number | null
  host_rating: number | null
  miles_added: number | null
  start_mileage: number | null
  end_mileage: number | null
  receipt_url: string | null
  actual_payout: number | null
  notes: string | null
  status: 'upcoming' | 'active' | 'completed' | 'cancelled'
}

export interface DbExpense {
  id: string
  created_at: string
  vehicle_id: string | null
  date: string
  category: 'maintenance' | 'insurance' | 'fuel' | 'cleaning' | 'registration' | 'parking' | 'other'
  description: string
  amount: number
  mileage_at_service: number | null
  receipt_url: string | null
  notes: string | null
}

export interface DbGuest {
  id: string
  created_at: string
  name: string
  turo_profile_url: string | null
  total_trips: number
  avg_rating: number | null
  flag: 'none' | 'great' | 'caution' | 'blocked'
  notes: string | null
  last_trip_date: string | null
}

export interface DbMaintenance {
  id: string
  created_at: string
  vehicle_id: string | null
  service_type: string
  last_service_date: string | null
  last_service_mileage: number | null
  interval_miles: number | null
  interval_days: number | null
  next_due_date: string | null
  next_due_mileage: number | null
  status: 'ok' | 'due_soon' | 'overdue' | 'completed'
  notes: string | null
  cost: number | null
}

export interface DbVehicleDocument {
  id: string
  created_at: string
  vehicle_id: string
  name: string
  document_type: 'insurance' | 'registration' | 'title' | 'inspection' | 'other'
  storage_path: string
  public_url: string
  expiry_date: string | null
  notes: string | null
}

export interface DbConversation {
  id: string
  created_at: string
  updated_at: string
  title: string
}

export interface DbConversationMessage {
  id: string
  created_at: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
}

// Joined shapes returned by specific Supabase queries

export interface FleetStub {
  make: string
  model: string
  year: number
}

export interface GuestStub {
  name: string
  flag: DbGuest['flag']
}

export type TripWithRelations = DbTrip & {
  fleet: FleetStub | null
  guests: GuestStub | null
}

export type MaintenanceWithFleet = DbMaintenance & {
  fleet: FleetStub | null
}

// Supabase returns joined rows as an array when generated types are not present.
// Access the first element: doc.fleet?.[0]
export type ExpiringDocument = Pick<DbVehicleDocument, 'name' | 'document_type' | 'expiry_date'> & {
  fleet: FleetStub[] | null
}

export interface ConversationWithCount extends DbConversation {
  conversation_messages: [{ count: number }]
}
