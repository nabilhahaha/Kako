'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

// Catches errors that escape the root layout. Reports to Sentry (when enabled)
// and shows a minimal, self-styled fallback (the app CSS may not be loaded here).
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f5f5f5' }}>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ maxWidth: 420, width: '100%', background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#0f2c521a', color: '#0f2c52', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>حصل خطأ غير متوقع</h1>
            <p style={{ color: '#666', fontSize: 14, marginTop: 8 }}>نعتذر عن ذلك. تم تسجيل المشكلة وسنعمل على حلّها. جرّب مرة أخرى.</p>
            <p style={{ color: '#999', fontSize: 12, marginTop: 4 }}>Something went wrong. The issue was logged — please try again.</p>
            <button
              onClick={() => reset()}
              style={{ marginTop: 20, height: 44, padding: '0 24px', border: 'none', borderRadius: 8, background: '#0f2c52', color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
            >
              إعادة المحاولة
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
