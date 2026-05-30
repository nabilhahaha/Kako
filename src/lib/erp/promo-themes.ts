import {
  Stethoscope, UtensilsCrossed, Scissors, Pill, WashingMachine, Boxes,
  BedDouble, ShoppingCart, type LucideIcon,
} from 'lucide-react';

/** A per-business-type marketing theme for the promo page — same professional
 *  layout, different identity (colour, icon, copy, features) per vertical. */
export interface PromoTheme {
  vertical: string;   // "العيادات"
  headline: string;
  subline: string;
  features: string[];
  icon: LucideIcon;
  gradient: string;   // full CSS background
  accent: string;     // hex for the ambient blob + price highlight
}

export const PROMO_THEMES: Record<string, PromoTheme> = {
  clinic: {
    vertical: 'العيادات والمراكز الطبية',
    headline: 'عيادتك بالكامل\nمن مكان واحد',
    subline: 'استقبال وحجوزات، كشوفات، روشتة ذكية بأكثر من ٢٤ ألف دواء مصري، وتحصيل ومحاسبة تلقائية.',
    features: ['استقبال وحجوزات المرضى', 'روشتة ذكية + تحاليل وأشعة', 'فصل شاشة السكرتير عن الطبيب', 'تحصيل ومحاسبة وتقارير'],
    icon: Stethoscope,
    gradient: 'linear-gradient(135deg, #0b5566 0%, #0e7490 45%, #06303b 100%)',
    accent: 'rgba(45,212,191,0.35)',
  },
  restaurant: {
    vertical: 'المطاعم والكافيهات',
    headline: 'مطعمك يشتغل\nبسلاسة',
    subline: 'طاولات وأوردرات، شاشة مطبخ، دليفري وتيك أواي، وتقفيل يومي دقيق بالمحاسبة.',
    features: ['طاولات وأوردرات', 'شاشة المطبخ المباشرة', 'دليفري وتيك أواي', 'تقارير ومحاسبة'],
    icon: UtensilsCrossed,
    gradient: 'linear-gradient(135deg, #7c2d12 0%, #c2410c 45%, #5a1e0a 100%)',
    accent: 'rgba(251,191,36,0.40)',
  },
  salon: {
    vertical: 'الصالونات ومراكز التجميل',
    headline: 'صالونك منظّم\nواحترافي',
    subline: 'حجوزات ومواعيد، تذاكر خدمات، عمولات المصففين، وتحصيل وتقارير لحظية.',
    features: ['حجوزات ومواعيد', 'تذاكر الخدمات', 'عمولات المصففين', 'تحصيل وتقارير'],
    icon: Scissors,
    gradient: 'linear-gradient(135deg, #581c87 0%, #7c3aed 45%, #3b0764 100%)',
    accent: 'rgba(236,72,153,0.35)',
  },
  pharmacy: {
    vertical: 'الصيدليات',
    headline: 'صيدليتك\nأسرع وأدق',
    subline: 'كتالوج ٢٤ ألف دواء جاهز، صرف وفواتير سريعة، تتبّع صلاحية (FEFO)، ومخزون ومحاسبة.',
    features: ['كتالوج ٢٤ ألف دواء جاهز', 'صرف وفواتير سريعة', 'تتبّع الصلاحية FEFO', 'مخزون ومحاسبة'],
    icon: Pill,
    gradient: 'linear-gradient(135deg, #064e3b 0%, #047857 45%, #03301f 100%)',
    accent: 'rgba(52,211,153,0.38)',
  },
  laundry: {
    vertical: 'المغاسل',
    headline: 'مغسلتك\nتحت السيطرة',
    subline: 'استلام وتسليم الطلبات، أسعار الأصناف، دليفري، وتحصيل وتقارير.',
    features: ['استلام وتسليم الطلبات', 'أسعار الأصناف', 'دليفري', 'تحصيل وتقارير'],
    icon: WashingMachine,
    gradient: 'linear-gradient(135deg, #0c4a6e 0%, #0369a1 45%, #06283b 100%)',
    accent: 'rgba(56,189,248,0.38)',
  },
  wholesale: {
    vertical: 'تجارة الجملة',
    headline: 'جملتك بأسعار\nومستويات',
    subline: 'مستويات أسعار للعملاء، فواتير جملة سريعة، مخزون وموردين، ومحاسبة متكاملة.',
    features: ['مستويات أسعار للعملاء', 'فواتير جملة سريعة', 'مخزون وموردين', 'محاسبة متكاملة'],
    icon: Boxes,
    gradient: 'linear-gradient(135deg, #1e293b 0%, #334155 45%, #0f172a 100%)',
    accent: 'rgba(148,163,184,0.35)',
  },
  hotel: {
    vertical: 'الفنادق',
    headline: 'فندقك من\nلوحة واحدة',
    subline: 'غرف وحجوزات، تسجيل دخول وخروج، فواتير، وتقارير إشغال.',
    features: ['غرف وحجوزات', 'تسجيل دخول/خروج', 'فواتير', 'تقارير الإشغال'],
    icon: BedDouble,
    gradient: 'linear-gradient(135deg, #312e81 0%, #4338ca 45%, #1e1b4b 100%)',
    accent: 'rgba(129,140,248,0.38)',
  },
  general: {
    vertical: 'المحلات والشركات',
    headline: 'أعمالك كلها\nفي نظام واحد',
    subline: 'مبيعات وفواتير، مخزون ومشتريات، عملاء وموردين، ومحاسبة وتقارير — أيًّا كان نشاطك.',
    features: ['مبيعات وفواتير', 'مخزون ومشتريات', 'عملاء وموردين', 'محاسبة وتقارير'],
    icon: ShoppingCart,
    gradient: 'linear-gradient(135deg, #6f1624 0%, #8f1d2e 45%, #4d0f1c 100%)',
    accent: 'rgba(232,176,75,0.35)',
  },
};

export function getPromoTheme(key?: string): PromoTheme {
  return (key && PROMO_THEMES[key]) || PROMO_THEMES.general;
}
