'use client';

import { Languages } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { LOCALE_LABEL } from '@/lib/i18n/config';
import { cn } from '@/lib/utils';

/** One-tap Arabic ⇄ English switch. Shows the language it will switch TO. */
export function LanguageToggle({ className }: { className?: string }) {
  const { locale, toggleLocale } = useI18n();
  const next = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      onClick={toggleLocale}
      aria-label={LOCALE_LABEL[next]}
      title={LOCALE_LABEL[next]}
      className={cn(
        'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary',
        className,
      )}
    >
      <Languages className="h-4 w-4" />
      <span>{LOCALE_LABEL[next]}</span>
    </button>
  );
}
