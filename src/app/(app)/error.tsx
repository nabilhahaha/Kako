'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RotateCcw } from 'lucide-react';

// In-app error boundary — keeps the sidebar/top-bar, reports to Sentry, and
// offers a retry.
export default function AppError({
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
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold">حصل خطأ في هذه الصفحة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          نعتذر عن ذلك. تم تسجيل المشكلة تلقائياً. يمكنك إعادة المحاولة.
        </p>
        <Button className="mt-5" onClick={() => reset()}>
          <RotateCcw className="h-4 w-4" /> إعادة المحاولة
        </Button>
      </div>
    </div>
  );
}
