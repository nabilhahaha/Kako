import type { Metadata } from 'next';
import { PromoHero } from '@/components/promo/promo-hero';
import { PROMO_THEMES, getPromoTheme } from '@/lib/erp/promo-themes';

export function generateStaticParams() {
  return Object.keys(PROMO_THEMES).map((type) => ({ type }));
}

export async function generateMetadata({ params }: { params: Promise<{ type: string }> }): Promise<Metadata> {
  const { type } = await params;
  const theme = getPromoTheme(type);
  return {
    title: `AMS · نظام ${theme.vertical}`,
    description: theme.subline,
  };
}

export default async function PromoPage({ params }: { params: Promise<{ type: string }> }) {
  const { type } = await params;
  return <PromoHero theme={getPromoTheme(type)} />;
}
