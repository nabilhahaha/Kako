'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { checkDeviceLicense } from '@/app/activate/actions';

// ----------------------------------------------------------------------------
// Launch-time license enforcement for the offline desktop edition (AU-1).
//
// Mounted once in the (app) layout. When running inside the Tauri shell it reads
// the device fingerprint (device_fingerprint IPC), asks the server whether a
// valid license is bound to this device, and redirects to /activate if not.
//
// Fail-closed: a missing / tampered / unbound license, or an unreadable
// fingerprint, redirects to activation. In a plain browser (web build) there is
// no Tauri global, so this is inert and the cloud app is unaffected.
//
// NOTE: this is the chosen enforcement model — an on-device check (the license
// file and its verification already live on the device). Hardening it to a
// server-side gate is a follow-up decision; see docs/qa/RC-REVIEW.md (AU-1).
// ----------------------------------------------------------------------------

interface TauriInvoke {
  __TAURI__?: { core?: { invoke?: <T>(cmd: string) => Promise<T> } };
}

export function LicenseGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (pathname?.startsWith('/activate')) return;
    let cancelled = false;
    let tries = 0;

    const run = () => {
      if (cancelled) return;
      const invoke = (window as unknown as TauriInvoke).__TAURI__?.core?.invoke;
      if (typeof invoke !== 'function') {
        // Bridge not ready yet? Retry briefly. If it never appears we're in the
        // browser (web build) → not gated.
        if (tries++ < 25) setTimeout(run, 200);
        return;
      }
      invoke<string>('device_fingerprint')
        .then((fp) => checkDeviceLicense(fp))
        .then((res) => { if (!cancelled && !res.ok) router.replace('/activate'); })
        .catch(() => { if (!cancelled) router.replace('/activate'); });
    };

    run();
    return () => { cancelled = true; };
  }, [pathname, router]);

  return null;
}
