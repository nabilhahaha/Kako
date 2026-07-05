export const VISIT_TYPES = [
  'display_check',
  'promotion',
  'shelf_check',
  'availability',
  'new_product',
  'follow_up',
  'collection',
  'general_visit',
] as const

export const VISIT_STATUSES = ['excellent', 'good', 'needs_follow_up', 'urgent'] as const

export const CUSTOMER_CATEGORIES = [
  'grocery',
  'sweet_shop',
  'roastery',
  'discounter',
  'wholesale',
  'store_5',
  'store_11_5',
  'other',
] as const

export const DISTRIBUTORS = ['gcc', 'relia', 'tofla', 'tala', 'other'] as const

export type VisitType = (typeof VISIT_TYPES)[number]
export type VisitStatus = (typeof VISIT_STATUSES)[number]
export type CustomerCategory = (typeof CUSTOMER_CATEGORIES)[number]
export type Distributor = (typeof DISTRIBUTORS)[number]

export interface Customer {
  id: string
  name: string
  code: string | null
  city: string | null
  area: string | null
  address: string | null
  phone: string | null
  notes: string | null
  latitude: number | null
  longitude: number | null
  customer_category: CustomerCategory | null
  custom_category: string | null
  roshen_available: boolean
  distributor: Distributor
  created_at: string
  updated_at: string
}

export interface Visit {
  id: string
  customer_id: string
  visited_at: string
  visit_type: VisitType
  status: VisitStatus
  notes: string | null
  latitude: number | null
  longitude: number | null
  storefront_photo_url: string | null
  storefront_thumbnail_url: string | null
  storefront_taken_at: string | null
  created_at: string
  updated_at: string
}

export interface VisitPhoto {
  id: string
  visit_id: string
  storage_path: string
  position: number
  type: 'visit' | 'storefront'
  created_at: string
}

export interface CustomerRef {
  id: string
  name: string
  code: string | null
  city: string | null
  customer_category: CustomerCategory | null
  custom_category: string | null
  roshen_available: boolean
  distributor: Distributor
}

export interface VisitWithMeta extends Visit {
  customer: CustomerRef | null
  photos: VisitPhoto[]
}

export interface CustomerInput {
  name: string
  code?: string | null
  city?: string | null
  area?: string | null
  address?: string | null
  phone?: string | null
  notes?: string | null
  latitude?: number | null
  longitude?: number | null
  customer_category: CustomerCategory | null
  custom_category?: string | null
  roshen_available: boolean
  distributor: Distributor
}

export interface VisitInput {
  customer_id: string
  visited_at: string
  visit_type: VisitType
  status: VisitStatus
  notes: string | null
  latitude: number | null
  longitude: number | null
}

/** A visit captured while offline, waiting in the IndexedDB outbox. */
export interface PendingVisit extends VisitInput {
  localId: string
  storefront: Blob
  storefront_taken_at: string
  photos: Blob[]
  queued_at: string
}

export interface GalleryPhoto extends VisitPhoto {
  visit: {
    id: string
    visited_at: string
    visit_type: VisitType
    status: VisitStatus
    customer: CustomerRef | null
  }
}
