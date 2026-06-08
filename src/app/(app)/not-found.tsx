'use client';

import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';

// In-app 404 — keeps the shell, gives a clear message + a way home, and avoids
// falling through to the generic error boundary (so bad/typo URLs don't spam
// Sentry). Bilingual via the active locale; additive (new file only).
export default function AppNotFound() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <FileQuestion className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">{ar ? 'الصفحة غير موجودة' : 'Page not found'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {ar ? 'العنصر المطلوب غير موجود أو تم نقله.' : "The page or record you’re looking for doesn’t exist or was moved."}
        </p>
        <Link href="/" className={buttonVariants({ className: 'mt-5' })}>
          {ar ? 'العودة للرئيسية' : 'Go home'}
        </Link>
      </div>
    </div>
  );
}
