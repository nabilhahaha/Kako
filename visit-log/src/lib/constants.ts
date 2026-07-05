import {
  LayoutGrid,
  Megaphone,
  Rows3,
  PackageCheck,
  Sparkles,
  Repeat,
  Banknote,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react'
import type { VisitStatus, VisitType } from '@/types'

export const STORAGE_BUCKET = 'visit-images'
export const MIN_PHOTOS = 1
export const MAX_PHOTOS = 20

export const VISIT_TYPE_META: Record<VisitType, { label: string; icon: LucideIcon }> = {
  display_check: { label: 'Display Check', icon: LayoutGrid },
  promotion: { label: 'Promotion', icon: Megaphone },
  shelf_check: { label: 'Shelf Check', icon: Rows3 },
  availability: { label: 'Availability', icon: PackageCheck },
  new_product: { label: 'New Product', icon: Sparkles },
  follow_up: { label: 'Follow Up', icon: Repeat },
  collection: { label: 'Collection', icon: Banknote },
  general_visit: { label: 'General Visit', icon: ClipboardList },
}

export const VISIT_STATUS_META: Record<
  VisitStatus,
  { label: string; dot: string; badge: string }
> = {
  excellent: {
    label: 'Excellent',
    dot: 'bg-ios-green',
    badge: 'bg-ios-green/15 text-ios-green',
  },
  good: {
    label: 'Good',
    dot: 'bg-ios-blue',
    badge: 'bg-ios-blue/15 text-ios-blue',
  },
  needs_follow_up: {
    label: 'Needs Follow Up',
    dot: 'bg-ios-orange',
    badge: 'bg-ios-orange/15 text-ios-orange',
  },
  urgent: {
    label: 'Urgent',
    dot: 'bg-accent',
    badge: 'bg-accent/12 text-accent',
  },
}

export const visitTypeLabel = (type: VisitType) => VISIT_TYPE_META[type].label
export const visitStatusLabel = (status: VisitStatus) => VISIT_STATUS_META[status].label
