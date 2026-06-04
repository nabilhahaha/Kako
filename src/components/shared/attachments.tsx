'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Paperclip, Upload, Trash2, Download, Loader2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { ALLOWED_EXTENSIONS } from '@/lib/erp/attachments';
import { listAttachments, uploadAttachment, softDeleteAttachment, type AttachmentView } from '@/app/(app)/attachments/actions';

/** Reusable attachments panel for any entity record (customer, invoice, order,
 *  customer_change_request, workflow…). Tenant isolation + manage rights are
 *  enforced server-side; this just lists + uploads + soft-deletes. */
export function Attachments({
  entity,
  recordId,
  canManage = true,
}: {
  entity: string;
  recordId: string;
  canManage?: boolean;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<AttachmentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, startTransition] = useTransition();

  const refresh = useCallback(() => {
    setLoading(true);
    listAttachments(entity, recordId).then((r) => { setItems(r); setLoading(false); });
  }, [entity, recordId]);
  useEffect(() => { refresh(); }, [refresh]);

  function uploadErr(code: string): string {
    if (code.startsWith('too_large')) return t('attachments.errTooLarge');
    if (code === 'type_not_allowed') return t('attachments.errType');
    if (code === 'forbidden') return t('attachments.errForbidden');
    return t('attachments.errUpload');
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const fd = new FormData();
    fd.set('entity', entity);
    fd.set('record_id', recordId);
    fd.set('file', file);
    startTransition(async () => {
      const res = await uploadAttachment(fd);
      if (!res.ok) { toast.error(uploadErr(res.error ?? '')); return; }
      toast.success(t('attachments.uploaded'));
      refresh();
    });
  }

  function onDelete(id: string) {
    startTransition(async () => {
      const res = await softDeleteAttachment(id);
      if (!res.ok) { toast.error(t('attachments.errDelete')); return; }
      toast.success(t('attachments.deleted'));
      refresh();
    });
  }

  const fmtSize = (b: number | null) => (b == null ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / (1024 * 1024)).toFixed(1)} MB`);

  return (
    <section className="space-y-2 rounded-lg border p-3">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <Paperclip className="h-4 w-4" /> {t('attachments.title')}
        </h4>
        {canManage && (
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs hover:bg-secondary">
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} {t('attachments.addFile')}
            <input type="file" className="hidden" accept={ALLOWED_EXTENSIONS.map((x) => `.${x}`).join(',')} onChange={onFile} disabled={pending} />
          </label>
        )}
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground">{t('attachments.loading')}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t('attachments.empty')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 p-2 text-sm">
              <span className="min-w-0 truncate">
                {a.file_name}
                <span className="ms-2 text-xs text-muted-foreground" dir="ltr">{fmtSize(a.size_bytes)} · {new Date(a.created_at).toLocaleDateString()}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {a.url && (
                  <a href={a.url} target="_blank" rel="noopener noreferrer" className="rounded-md p-1.5 hover:bg-secondary" aria-label={t('attachments.download')}>
                    <Download className="h-4 w-4" />
                  </a>
                )}
                {canManage && (
                  <button onClick={() => onDelete(a.id)} disabled={pending} className="rounded-md p-1.5 text-destructive hover:bg-destructive/10" aria-label={t('attachments.delete')}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
