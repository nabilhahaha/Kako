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
import type { Customer, CustomerCategory, CustomerRef, VisitStatus, VisitType } from '@/types'

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

export const CUSTOMER_CATEGORY_LABELS: Record<CustomerCategory, string> = {
  wholesale: 'Wholesale',
  grocery: 'Grocery',
  sweets: 'Sweets',
  roastery: 'Roastery',
  discounter: 'Discounter',
  shop_5_115: '5 / 11.5 Shop',
  mini_market: 'Mini Market',
  supermarket: 'Supermarket',
  hypermarket: 'Hypermarket',
  convenience: 'Convenience Store',
  bakery: 'Bakery',
  pharmacy: 'Pharmacy',
  other: 'Other',
}

export const CATEGORY_NOT_SET_LABEL = 'Category Not Set'

/** Display label for a customer's category — the custom text when "Other". */
export function categoryLabel(
  customer: Pick<Customer, 'customer_category' | 'custom_category'> | CustomerRef | null | undefined,
): string {
  if (!customer || !customer.customer_category) return CATEGORY_NOT_SET_LABEL
  if (customer.customer_category === 'other' && customer.custom_category) {
    return customer.custom_category
  }
  return CUSTOMER_CATEGORY_LABELS[customer.customer_category]
}

/** True when the customer has no category selected yet. */
export function isCategorySet(
  customer: Pick<Customer, 'customer_category'> | CustomerRef | null | undefined,
): boolean {
  return !!customer && !!customer.customer_category
}
