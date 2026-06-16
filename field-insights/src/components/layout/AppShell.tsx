import type { ReactNode } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useSyncEngine } from '@/lib/sync';
import { env } from '@/lib/env';
import { BottomNav } from './BottomNav';

export function AppShell({ children }: { children: ReactNode }) {
  const online = useOnlineStatus();
  const { pending } = useSyncEngine();
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex min-h-dvh max-w-screen-sm flex-col bg-background">
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-card/95 px-4 py-3 backdrop-blur safe-top">
        <span className="text-base font-semibold text-primary">{env.appName}</span>
        <span className="flex items-center gap-2">
          {pending > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md bg-info/15 px-2 py-1 text-[11px] font-semibold text-info">
              <RefreshCw className="size-3.5" /> {pending}
            </span>
          )}
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-md bg-warning/15 px-2 py-1 text-[11px] font-semibold text-warning-foreground">
              <WifiOff className="size-3.5" /> {t('common.offline')}
            </span>
          )}
        </span>
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{children}</main>

      <BottomNav />
    </div>
  );
}
