'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { Toaster } from 'sonner';
import { I18nProvider, useI18n } from '@/lib/i18n/provider';
import type { Locale } from '@/lib/i18n/config';

function DirectionalToaster() {
  const { dir } = useI18n();
  return <Toaster position="top-center" richColors dir={dir} />;
}

export function Providers({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <I18nProvider initialLocale={locale}>
      <QueryClientProvider client={queryClient}>
        {children}
        <DirectionalToaster />
      </QueryClientProvider>
    </I18nProvider>
  );
}
