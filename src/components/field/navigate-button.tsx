'use client';

import { useState } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { googleMapsUrl, appleMapsUrl, wazeUrl, hasValidCoords } from '@/lib/van-sales/map-links';
import { logFieldUxEvent } from '@/lib/van-sales/ux-metrics-server';
import { Navigation } from 'lucide-react';

// External turn-by-turn navigation. Opens a sheet with Google / Apple / Waze; the
// device opens the installed app. Disabled when the customer has no coordinates.
// Shared by the Smart Next screen and the My Day hero.
export function NavigateButton({
  lat,
  lng,
  size = 'sm',
  variant = 'outline',
  className,
}: {
  lat: number | null;
  lng: number | null;
  size?: 'sm' | 'lg' | 'default';
  variant?: 'outline' | 'default' | 'secondary';
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!hasValidCoords(lat, lng)) {
    return (
      <Button size={size} variant={variant} className={className} disabled>
        <Navigation className="h-4 w-4" /> {t('vanSales.smartNext.navigate')}
      </Button>
    );
  }
  const la = lat as number;
  const ln = lng as number;
  const provider = (p: 'google' | 'apple' | 'waze') => () => {
    void logFieldUxEvent({ eventType: 'navigate_clicked', meta: { provider: p } });
    setOpen(false);
  };
  return (
    <>
      <Button size={size} variant={variant} className={className} onClick={() => setOpen(true)}>
        <Navigation className="h-4 w-4" /> {t('vanSales.smartNext.navigate')}
      </Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md space-y-2 rounded-t-2xl bg-background p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <p className="mb-1 text-sm font-semibold text-muted-foreground">{t('vanSales.smartNext.navigate')}</p>
            <a href={googleMapsUrl(la, ln)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={provider('google')}>{t('vanSales.smartNext.navGoogle')}</a>
            <a href={appleMapsUrl(la, ln)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={provider('apple')}>{t('vanSales.smartNext.navApple')}</a>
            <a href={wazeUrl(la, ln)} target="_blank" rel="noopener noreferrer" className={`w-full ${buttonVariants({ variant: 'outline' })}`} onClick={provider('waze')}>{t('vanSales.smartNext.navWaze')}</a>
          </div>
        </div>
      )}
    </>
  );
}
