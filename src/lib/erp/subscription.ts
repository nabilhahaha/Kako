import type { BusinessType, Company } from './types';

export const BUSINESS_TYPE_LABELS: Record<BusinessType, { en: string; ar: string }> = {
  general: { en: 'General / Mixed', ar: 'عام / متنوع' },
  supermarket: { en: 'Supermarket', ar: 'سوبر ماركت' },
  pharmacy: { en: 'Pharmacy', ar: 'صيدلية' },
  wholesale: { en: 'Wholesaler', ar: 'تاجر جملة' },
  clothing: { en: 'Clothing Store', ar: 'محل ملابس' },
  restaurant: { en: 'Restaurant', ar: 'مطعم' },
  cafe: { en: 'Café', ar: 'كافيه' },
  delivery: { en: 'Delivery', ar: 'توصيل / ديليفري' },
  services: { en: 'Services (gaming, repairs…)', ar: 'خدمات (بلايستيشن، صيانة…)' },
  bakery: { en: 'Bakery / Confectionery', ar: 'مخبز / حلواني' },
  butchery: { en: 'Butcher / Fish / Produce', ar: 'جزارة / أسماك / خضار' },
  herbalist: { en: 'Herbalist / Cosmetics', ar: 'عطارة / مستحضرات تجميل' },
  auto_parts: { en: 'Auto Parts / Accessories', ar: 'قطع غيار / إكسسوار سيارات' },
  bookstore: { en: 'Bookstore / Stationery', ar: 'مكتبة / أدوات مكتبية' },
  electronics: { en: 'Mobiles / Electronics', ar: 'موبايلات / إلكترونيات' },
  laundry: { en: 'Laundry', ar: 'مغسلة ملابس' },
  workshop: { en: 'Repair Workshop', ar: 'ورشة صيانة' },
  clinic: { en: 'Clinic / Medical Center', ar: 'عيادة / مركز طبي' },
  salon: { en: 'Salon / Beauty Center', ar: 'صالون / مركز تجميل' },
  hotel: { en: 'Hotel / Furnished Apartments', ar: 'فندق / شقق مفروشة' },
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
