'use client';

// ============================================================================
// Offline UX layer (design §9). Renders/behaves only when KAKO_SYNC is enabled,
// so the current production app is byte-for-byte unchanged.
//
// - OfflineBanner: a slim, non-blocking notice when the connection drops. The
//   page content underneath stays rendered and usable — no takeover.
// - OfflineNavGuard: while offline, intercepts internal link navigations whose
//   destination would need a fresh server (RSC) fetch — those would fail and trip
//   the error boundary. Instead we keep the user on the current, already-loaded
//   page and explain why, so offline navigation degrades gracefully.
//
// Both read the shared SyncStatusStore (online/pending/syncing/synced/failed)
// that the orchestrator already maintains.
// ============================================================================

import { useEffect, useSyncExternalStore } from 'react';
import { CloudOff } from 'lucide-react';
import { toast } from 'sonner';
import { isSyncEnabledClient } from '@/lib/sync/flag';
import { syncStatusStore } from './sync-status-store';
import { useI18n } from '@/lib/i18n/provider';

function useSyncSnapshot() {
  return useSyncExternalStore(
    syncStatusStore.subscribe,
    syncStatusStore.getSnapshot,
    syncStatusStore.getSnapshot, // SSR-safe
  );
}

/** True when we should treat the app as offline (status store first, with a
 *  navigator fallback for the instant before the orchestrator reacts). */
function isOffline(): boolean {
  if (syncStatusStore.getSnapshot().online === false) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export function OfflineBanner() {
  const { t } = useI18n();
  const snap = useSyncSnapshot();
  if (!isSyncEnabledClient() || snap.status !== 'offline') return null;
  const pending = snap.pending > 0 ? ` · ${t('common.offlinePending', { count: snap.pending })}` : '';
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 border-b bg-warning/15 px-4 py-1.5 text-xs text-warning-foreground"
    >
      <CloudOff className="h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{t('common.offlineBanner')}{pending}</span>
    </div>
  );
}

export function OfflineNavGuard() {
  const { t } = useI18n();
  useEffect(() => {
    if (!isSyncEnabledClient()) return;

    function onClick(e: MouseEvent) {
      if (!isOffline()) return;
      // Respect modified clicks / non-primary buttons (new tab, etc.).
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a');
      if (!anchor) return;
      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#') || anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      let url: URL;
      try { url = new URL(href, window.location.href); } catch { return; }
      if (url.origin !== window.location.origin) return;                 // external
      if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;
      if (url.pathname === window.location.pathname) return;             // same page (query/hash)

      // The destination would fetch from the server and fail offline → keep the
      // current page rendered instead of letting it trip the error boundary.
      e.preventDefault();
      e.stopPropagation();
      toast.error(t('common.offlineNavBlocked'));
    }

    // Capture phase so we run before the App Router's click handler.
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [t]);

  return null;
}
