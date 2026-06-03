'use client';

import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { CommandPalette } from '@/components/shared/command-palette';

/**
 * Platform-area global-search trigger + palette mount. The button dispatches
 * `open-platform-search`; the palette also opens on ⌘K / Ctrl+K (captured so it
 * wins over the app shell's nav jumper while inside /platform/*).
 *
 * Desktop: a "Search… ⌘K" pill. Mobile (<sm): a compact icon button.
 */
export function PlatformSearchBar() {
  const { t } = useI18n();
  const open = () => window.dispatchEvent(new Event('open-platform-search'));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={open}
          aria-label={t('platform.search.placeholder')}
          className="inline-flex h-9 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">{t('platform.search.trigger')}</span>
          <kbd
            dir="ltr"
            className="hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] sm:inline"
          >
            ⌘K
          </kbd>
        </button>
      </div>
      <CommandPalette />
    </>
  );
}
