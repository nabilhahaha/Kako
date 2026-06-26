'use client';

import { useEffect, useState } from 'react';

/** Live online/offline state for the POS. Used to warn the cashier and BLOCK invoice
 *  submission while offline (no offline-sync strategy yet — online-first by design). */
export function usePosOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  return online;
}

/** Toggle browser fullscreen (kiosk-style POS). Safe no-op where unsupported. */
export async function toggleFullscreen(): Promise<void> {
  if (typeof document === 'undefined') return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch { /* unsupported / denied — ignore */ }
}
