'use client';

import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, MessageSquarePlus, Trash2, StickyNote } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { INTL_LOCALE } from '@/lib/i18n/config';
import { formatDate } from '@/lib/utils';
import { listEntityNotes, addEntityNote, deleteEntityNote, type EntityNote } from '@/lib/erp/entity-actions';

/** Entity Framework — reusable Notes panel. Drop on ANY entity detail screen:
 *  <EntityNotes entity="customer" recordId={id} />. Build once, reuse everywhere. */
export function EntityNotes({ entity, recordId }: { entity: string; recordId: string }) {
  const { t, locale } = useI18n();
  const intl = INTL_LOCALE[locale];
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    const res = await listEntityNotes(entity, recordId);
    if (res.ok && res.data) setNotes(res.data);
    setLoading(false);
  }
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [entity, recordId]);

  function add() {
    if (!body.trim()) return;
    startTransition(async () => {
      const res = await addEntityNote(entity, recordId, body);
      if (!res.ok) { toast.error(res.error ?? t('entity.notes.error')); return; }
      setBody('');
      await refresh();
    });
  }
  function remove(id: string) {
    startTransition(async () => {
      const res = await deleteEntityNote(id);
      if (!res.ok) { toast.error(res.error ?? t('entity.notes.error')); return; }
      await refresh();
    });
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 flex items-center gap-2 font-semibold">
          <StickyNote className="h-4 w-4 text-primary" /> {t('entity.notes.title')}
        </h3>

        <div className="flex items-start gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('entity.notes.placeholder')}
            rows={2}
            className="flex-1 rounded-md border border-input bg-background p-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <Button size="sm" onClick={add} disabled={pending || !body.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />}
            {t('entity.notes.add')}
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto h-4 w-4 animate-spin" /></p>
          ) : notes.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">{t('entity.notes.empty')}</p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="rounded-md border bg-secondary/20 p-2.5 text-sm">
                <p className="whitespace-pre-wrap">{n.body}</p>
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{n.author_name ?? t('common.user')} · <span dir="ltr">{formatDate(n.created_at, intl)}</span></span>
                  <button onClick={() => remove(n.id)} disabled={pending} className="rounded p-1 text-destructive hover:bg-destructive/10" aria-label={t('entity.notes.delete')}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
