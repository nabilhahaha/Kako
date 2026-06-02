'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, BellOff, CheckCheck, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate, cn } from '@/lib/utils';
import { markNotificationRead, markAllNotificationsRead } from './actions';

export interface NotificationRow {
  id: string; type: string; title_ar: string | null; title_en: string | null;
  body: string | null; link: string | null; is_read: boolean; created_at: string;
}

export function NotificationsManager({ notifications }: { notifications: NotificationRow[] }) {
  const { t, locale } = useI18n();
  const [busy, setBusy] = useState(false);
  const title = (n: NotificationRow) => (locale === 'ar' ? n.title_ar : n.title_en) || n.title_en || n.title_ar || n.type;
  const unread = notifications.filter((n) => !n.is_read).length;

  async function readOne(id: string) {
    setBusy(true);
    try { const r = await markNotificationRead(id); if (!r.ok) toast.error(r.error ?? t('notifications.toast.error')); }
    finally { setBusy(false); }
  }
  async function readAll() {
    setBusy(true);
    try {
      const r = await markAllNotificationsRead();
      if (!r.ok) return toast.error(r.error ?? t('notifications.toast.error'));
      toast.success(t('notifications.toast.allRead'));
    } finally { setBusy(false); }
  }

  if (notifications.length === 0) {
    return (
      <Card><CardContent className="flex flex-col items-center gap-2 p-10 text-center text-muted-foreground">
        <BellOff className="h-8 w-8" /><p>{t('notifications.empty')}</p>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-6 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{t('notifications.unreadCount', { count: unread })}</span>
          <Button size="sm" variant="outline" disabled={busy || unread === 0} onClick={readAll}>
            <CheckCheck className="h-4 w-4" /> {t('notifications.markAllRead')}
          </Button>
        </div>
        <div className="space-y-2">
          {notifications.map((n) => {
            const inner = (
              <div className={cn('flex items-start justify-between gap-3 rounded-lg border p-3', !n.is_read && 'border-primary/40 bg-primary/5')}>
                <div className="flex items-start gap-2">
                  <Bell className={cn('mt-0.5 h-4 w-4', n.is_read ? 'text-muted-foreground' : 'text-primary')} />
                  <div>
                    <div className="text-sm font-medium">{title(n)}</div>
                    {n.body && <div className="text-xs text-muted-foreground">{n.body}</div>}
                    <div className="text-xs text-muted-foreground">{formatDate(n.created_at, INTL_LOCALE[locale])}</div>
                  </div>
                </div>
                {!n.is_read && (
                  <Button size="sm" variant="ghost" disabled={busy}
                    onClick={(e) => { e.preventDefault(); readOne(n.id); }}>
                    <Check className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
            return n.link ? <Link key={n.id} href={n.link} onClick={() => !n.is_read && readOne(n.id)}>{inner}</Link> : <div key={n.id}>{inner}</div>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}
