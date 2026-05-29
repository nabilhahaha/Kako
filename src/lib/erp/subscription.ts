import type { BusinessType, Company } from './types';

export const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  general: 'عام / متنوع',
  supermarket: 'سوبر ماركت',
  pharmacy: 'صيدلية',
  wholesale: 'تاجر جملة',
  clothing: 'محل ملابس',
  restaurant: 'مطعم',
  cafe: 'كافيه',
  delivery: 'توصيل / ديليفري',
  services: 'خدمات (بلايستيشن، صيانة…)',
  bakery: 'مخبز / حلواني',
  butchery: 'جزارة / أسماك / خضار',
  herbalist: 'عطارة / مستحضرات تجميل',
  auto_parts: 'قطع غيار / إكسسوار سيارات',
  bookstore: 'مكتبة / أدوات مكتبية',
  electronics: 'موبايلات / إلكترونيات',
  laundry: 'مغسلة ملابس',
  workshop: 'ورشة صيانة',
  clinic: 'عيادة / مركز طبي',
  salon: 'صالون / مركز تجميل',
  hotel: 'فندق / شقق مفروشة',
};

export const BUSINESS_TYPES = Object.keys(BUSINESS_TYPE_LABELS) as BusinessType[];

/** Days remaining on the subscription (null = no end date / open-ended). */
export function daysLeft(company: Pick<Company, 'subscription_end'>): number | null {
  if (!company.subscription_end) return null;
  const end = new Date(company.subscription_end + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** A company is locked when manually deactivated or its subscription expired. */
export function companyLocked(
  company: Pick<Company, 'is_active' | 'subscription_end'> | null,
): boolean {
  if (!company) return false;
  if (!company.is_active) return true;
  const left = daysLeft(company);
  return left !== null && left < 0;
}

export type SubscriptionState = 'active' | 'expiring' | 'expired' | 'suspended' | 'open';

export function subscriptionState(
  company: Pick<Company, 'is_active' | 'subscription_end'> | null,
): SubscriptionState {
  if (!company) return 'open';
  if (!company.is_active) return 'suspended';
  const left = daysLeft(company);
  if (left === null) return 'open';
  if (left < 0) return 'expired';
  if (left <= 14) return 'expiring';
  return 'active';
}
