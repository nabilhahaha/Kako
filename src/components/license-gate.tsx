'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { checkDeviceLicense } from '@/app/activate/actions';

// ----------------------------------------------------------------------------
// Launch-time license enforcement for the offline desktop edition (AU-1).
//
// Mounted once in the ROOT layout so it runs BEFORE login (the product rule:
// activation precedes login). When running inside the Tauri shell it reads the
// device fingerprint (device_fingerprint IPC), asks the server whether a valid
// license is bound to this device, and redirects to /activate if not.
//
// Enforcement is vendor-opt-in: if the build has no KAKO_LICENSE_PUBLIC_KEY the
// server returns ok (see checkDeviceLicense), so login stays accessible. In a
// plain browser there is no Tauri global, so this is inert and the cloud app is
// unaffected. A fingerprint hiccup or a server error never hard-locks: we let
// the server decide (empty fingerprint) and swallow transient failures.
// ----------------------------------------------------------------------------

interface TauriInvoke {
  __TAURI__?: { core?: { invoke?: <T>(cmd: string) => Promise<T> } };
}

export function LicenseGate() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // /activate must never gate itself (avoids a redirect loop).
    if (pathname?.startsWith('/activate')) return;
    let cancelled = false;
    let tries = 0;

    const run = () => {
      if (cancelled) return;
      const invoke = (window as unknown as TauriInvoke).__TAURI__?.core?.invoke;
      if (typeof invoke !== 'function') {
        // Bridge not ready yet? Retry briefly. If it never appears we're in the
        // browser (web build) → never gated.
        if (tries++ < 25) setTimeout(run, 200);
        return;
      }
      invoke<string>('device_fingerprint')
        .catch(() => '') // fingerprint unavailable → let the server decide
        .then((fp) => checkDeviceLicense(fp))
        .then((res) => { if (!cancelled && !res.ok) router.replace('/activate'); })
        .catch(() => { /* transient server-action failure → do not hard-lock */ });
    };

    run();
    return () => { cancelled = true; };
  }, [pathname, router]);

  return null;
}
