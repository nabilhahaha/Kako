'use client';
import { I18nProvider } from '@/state/i18n';
import { AppProvider } from '@/state/app';
import { AppShell } from '@/components/AppShell';

export default function Page() {
  return (
    <I18nProvider>
      <AppProvider theme="light">
        <AppShell />
      </AppProvider>
    </I18nProvider>
  );
}
