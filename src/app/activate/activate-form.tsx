'use client';

import { useState, useEffect, useTransition } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { installLicenseAction, type ActivateResult } from './actions';

// Minimal offline activation gate. The device fingerprint comes from the Tauri
// shell (device_fingerprint command, src-tauri/src/fingerprint.rs) when running
// inside the app; otherwise it shows "—". The user takes the request to the
// licensing server and pastes the signed license back.
declare global {
  interface Window { __TAURI__?: { core?: { invoke<T>(cmd: string): Promise<T> } } }
}

export function ActivateForm() {
  const [fingerprint, setFingerprint] = useState<string>('—');
  const [license, setLicense] = useState('');
  const [result, setResult] = useState<ActivateResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    // AU-6: the Tauri IPC bridge may not be injected at first paint in WKWebView.
    // Poll briefly for `window.__TAURI__` instead of giving up after one read.
    let cancelled = false;
    let tries = 0;
    const tryFetch = () => {
      if (cancelled) return;
      const inv = window.__TAURI__?.core?.invoke;
      if (inv) {
        inv<string>('device_fingerprint')
          .then((fp) => { if (!cancelled) setFingerprint(fp); })
          .catch(() => { if (!cancelled) setFingerprint('unavailable'); });
        return;
      }
      if (tries++ < 25) setTimeout(tryFetch, 200); // ~5s of readiness polling
    };
    tryFetch();
    return () => { cancelled = true; };
  }, []);

  function onActivate() {
    start(async () => setResult(await installLicenseAction(license, fingerprint)));
  }

  return (
    <div className="mx-auto max-w-xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Activate this device</h1>

      <Card>
        <CardContent className="space-y-2 p-4">
          <p className="text-sm text-muted-foreground">Device fingerprint (give this to support / the licensing portal):</p>
          <code className="block break-all rounded bg-muted p-2 text-xs" dir="ltr">{fingerprint}</code>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-4">
          <p className="text-sm text-muted-foreground">Paste the signed license you received:</p>
          <textarea
            value={license}
            onChange={(e) => setLicense(e.target.value)}
            rows={8}
            dir="ltr"
            className="w-full rounded-md border bg-background p-2 font-mono text-xs"
            placeholder='{ "payload": { ... }, "signature": "..." }'
          />
          <Button onClick={onActivate} disabled={pending || !license.trim()}>
            {pending ? 'Activating…' : 'Activate'}
          </Button>

          {result && (
            result.ok
              ? <p className="text-sm text-success">Activated — edition {result.summary?.edition}, seats {result.summary?.seats}{result.summary?.validUntil ? `, valid until ${result.summary.validUntil}` : ''}.</p>
              : <p className="text-sm text-destructive">Activation failed: {result.error}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
