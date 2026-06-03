'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { HelpCircle, X } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { CopilotPanel } from './copilot-panel';

/** Global floating help button. Bottom-end (RTL-aware via `end-*`), mobile-first.
 *  Opens a slide-up panel anchored to the current route (via usePathname). Not
 *  shown on the auth screens. The app layout already keeps it clear of the fixed
 *  mobile bottom-nav. */
export function CopilotFab() {
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);

  // Close on route change.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // Hide on auth screens (defensive — this lives under the (app) layout).
  if (pathname.startsWith('/login') || pathname.startsWith('/auth')) return null;

  return (
    <>
      {/* Floating trigger — above the mobile bottom-nav (bottom-20) on small
          screens, normal corner on desktop. */}
      <button
        type="button"
        aria-label={t('copilot.openAria')}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-20 end-4 z-40 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95 lg:bottom-6 lg:end-6"
      >
        {open ? <X className="h-5 w-5" /> : <HelpCircle className="h-5 w-5" />}
        <span className="text-sm font-medium">{t('copilot.open')}</span>
      </button>

      {open && (
        <>
          {/* Scrim */}
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          {/* Panel — full-height sheet on mobile, anchored card on desktop. */}
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('copilot.title')}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl border bg-card shadow-2xl sm:inset-x-auto sm:bottom-6 sm:end-6 sm:max-h-[80vh] sm:w-[26rem] sm:rounded-2xl"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b p-4">
              <div>
                <h2 className="text-base font-bold">{t('copilot.title')}</h2>
                <p className="text-xs text-muted-foreground">{t('copilot.subtitle')}</p>
              </div>
              <button
                type="button"
                aria-label={t('copilot.close')}
                onClick={() => setOpen(false)}
                className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <CopilotPanel pathname={pathname} onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </>
      )}
    </>
  );
}
