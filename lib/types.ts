export type VehicleStatus = 'active' | 'inactive' | 'maintenance'
export type GuestFlag = 'none' | 'great' | 'caution' | 'blocked'
export type TripStatus = 'upcoming' | 'active' | 'completed' | 'cancelled'
export type MaintenanceStatus = 'ok' | 'due_soon' | 'overdue' | 'completed'
export type ExpenseCategory = 'maintenance' | 'insurance' | 'fuel' | 'cleaning' | 'registration' | 'parking' | 'other'
export type LineItemType = 'fee' | 'discount' | 'deposit' | 'delivery' | 'other'

export interface Vehicle {
  id: string
  created_at: string
  make: string
  model: string
  year: number
  color?: string
  license_plate?: string
  vin?: string
  daily_rate: number
  current_mileage: number
  status: VehicleStatus
  turo_listing_id?: string
  notes?: string
  purchase_price?: number
  purchase_date?: string
  financing_monthly?: number
  financing_months?: number
  depreciation_annual?: number
}

export interface Trip {
  id: string
  created_at: string
  vehicle_id: string
  guest_name: string
  guest_id?: string
  start_date: string
  end_date: string
  daily_rate: number
  gross_revenue: number
  turo_fee_pct: number
  net_revenue: number
  guest_rating?: number
  host_rating?: number
  miles_added?: number
  start_mileage?: number
  end_mileage?: number
  receipt_url?: string
  actual_payout?: number
  notes?: string
  status: TripStatus
  fleet?: Vehicle
  guests?: Guest
  line_items?: TripLineItem[]
}

export interface TripLineItem {
  id: string
  trip_id: string
  label: string
  amount: number
  type: LineItemType
}

export type DocumentType = 'insurance' | 'registration' | 'title' | 'inspection' | 'other'

export interface VehicleDocument {
  id: string
  created_at: string
  vehicle_id: string
  name: string
  document_type: DocumentType
  storage_path: string
  public_url: string
  expiry_date?: string
  notes?: string
}

export interface Expense {
  id: string
  created_at: string
  vehicle_id: string
  date: string
  category: ExpenseCategory
  description: string
  amount: number
  mileage_at_service?: number
  receipt_url?: string
  notes?: string
  fleet?: Vehicle
}

export interface Guest {
  id: string
  created_at: string
  name: string
  turo_profile_url?: string
  total_trips: number
  avg_rating?: number
  flag: GuestFlag
  notes?: string
  last_trip_date?: string
}

export interface MaintenanceItem {
  id: string
  created_at: string
  vehicle_id: string
  service_type: string
  last_service_date?: string
  last_service_mileage?: number
  interval_miles?: number
  interval_days?: number
  next_due_date?: string
  next_due_mileage?: number
  status: MaintenanceStatus
  notes?: string
  cost?: number
  fleet?: Vehicle
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Conversation {
  id: string
  created_at: string
  updated_at: string
  title: string
  message_count?: number
}

export interface ConversationMessage {
  id: string
  created_at: string
  conversation_id: string
  role: 'user' | 'assistant'
  content: string
}

import type { ExpiringDocument, TripWithRelations, MaintenanceWithFleet } from './database.types'
export type { ExpiringDocument, TripWithRelations, MaintenanceWithFleet }

export interface FleetContext {
  vehicles: Vehicle[]
  recentTrips: TripWithRelations[]
  openMaintenance: MaintenanceWithFleet[]
  ytdRevenue: number
  ytdExpenses: number
  totalTrips: number
  expiringDocs?: ExpiringDocument[]
  payoutDiscrepancies?: TripWithRelations[]
}
