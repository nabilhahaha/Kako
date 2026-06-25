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
  field_verification_only: { en: 'Field Verification Only', ar: 'التحقق الميداني فقط' },
  route_planner: { en: 'Route Planner / Field Sales', ar: 'مخطط الخطوط / المبيعات الميدانية' },
  fast_food: { en: 'Fast Food / Restaurant POS', ar: 'مطعم وجبات سريعة / نقطة بيع' },
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

/** A trial date may or may not be present on the partial company shapes passed in. */
type WithTrial = { trial_ends_at?: string | null };

/** Days remaining on a trial (null = no trial set). */
export function trialDaysLeft(company: WithTrial): number | null {
  if (!company.trial_ends_at) return null;
  const end = new Date(company.trial_ends_at + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((end.getTime() - today.getTime()) / 86_400_000);
}

/** True while a company is inside an active (non-expired) trial window. */
export function onActiveTrial(company: WithTrial): boolean {
  const left = trialDaysLeft(company);
  return left !== null && left >= 0;
}

/** A company is locked when manually deactivated, or its subscription expired
 *  AND it is not inside an active trial window. */
export function companyLocked(
  company: (Pick<Company, 'is_active' | 'subscription_end'> & WithTrial) | null,
): boolean {
  if (!company) return false;
  if (!company.is_active) return true;
  if (onActiveTrial(company)) return false;
  const left = daysLeft(company);
  return left !== null && left < 0;
}

export type SubscriptionState = 'active' | 'expiring' | 'expired' | 'suspended' | 'trial' | 'open';

export function subscriptionState(
  company: (Pick<Company, 'is_active' | 'subscription_end'> & WithTrial) | null,
): SubscriptionState {
  if (!company) return 'open';
  if (!company.is_active) return 'suspended';
  if (onActiveTrial(company)) return 'trial';
  const left = daysLeft(company);
  if (left === null) return 'open';
  if (left < 0) return 'expired';
  if (left <= 14) return 'expiring';
  return 'active';
}
