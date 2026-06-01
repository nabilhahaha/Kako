'use client';

import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n/provider';
import { useFieldSync } from '@/lib/erp/use-field-sync';

/** Offline sync indicator (FE-2c): online state, pending count, the four sync
 *  states, and a manual "Sync now". Drop into the field header. */
export function FieldSyncStatus() {
  const { t } = useI18n();
  const { counts, pending, online, syncing, syncNow } = useFieldSync();

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Badge variant={online ? 'secondary' : 'outline'} className="gap-1">
        {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5 text-amber-600" />}
        {online ? t('field.sync.online') : t('field.sync.offline')}
      </Badge>

      {syncing ? (
        <span className="flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('field.sync.syncing')}</span>
      ) : pending === 0 ? (
        <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> {t('field.sync.allSynced')}</span>
      ) : (
        <span className="flex items-center gap-2">
          {counts.queued > 0 && <Badge variant="outline">{t('field.sync.queued')}: {counts.queued}</Badge>}
          {counts.failed > 0 && <Badge variant="outline" className="gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />{t('field.sync.failed')}: {counts.failed}</Badge>}
        </span>
      )}

      <Button size="sm" variant="outline" disabled={syncing} onClick={() => void syncNow()}>
        {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} {t('field.sync.syncNow')}
      </Button>
    </div>
  );
}
