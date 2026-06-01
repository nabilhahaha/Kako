'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/empty-state';
import { FileText, Plus, Copy, Trash2, Loader2, Pencil } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { createForm, cloneForm, deleteForm } from './actions';

export interface FormRow {
  id: string; company_id: string | null; key: string;
  name_ar: string | null; name_en: string | null; status: string; version: number; workflow_key: string | null;
}

const STATUS_VARIANT: Record<string, 'secondary' | 'success' | 'warning'> = { draft: 'warning', active: 'success', archived: 'secondary' };

export function FormsList({ myForms, templates }: { myForms: FormRow[]; templates: FormRow[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const label = (f: FormRow) => (locale === 'ar' ? f.name_ar || f.name_en : f.name_en || f.name_ar) || f.key;

  function onCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createForm(fd);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.created'));
      router.push(`/settings/forms/${res.data.id}`);
    });
  }

  function onClone(id: string, name: string) {
    start(async () => {
      const res = await cloneForm(id, `${name} (copy)`);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.cloned'));
      router.push(`/settings/forms/${res.data.id}`);
    });
  }

  function onDelete(id: string) {
    start(async () => {
      const res = await deleteForm(id);
      if (!res.ok) { toast.error(res.error ?? t('forms.toast.error')); return; }
      toast.success(t('forms.toast.deleted'));
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        {!adding ? (
          <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> {t('forms.newForm')}</Button>
        ) : null}
      </div>

      {adding && (
        <Card><CardContent className="pt-6">
          <form onSubmit={onCreate} className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><label className="text-xs text-muted-foreground">{t('forms.nameEn')}</label><Input name="name" required /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">{t('forms.nameAr')}</label><Input name="name_ar" /></div>
            <div className="space-y-1"><label className="text-xs text-muted-foreground">{t('forms.keyOptional')}</label><Input name="key" dir="ltr" placeholder="new_customer" /></div>
            <Button type="submit" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('forms.create')}</Button>
            <Button type="button" variant="outline" onClick={() => setAdding(false)}>{t('forms.cancel')}</Button>
          </form>
        </CardContent></Card>
      )}

      <section className="space-y-2">
        <h3 className="font-semibold">{t('forms.myForms')}</h3>
        {myForms.length === 0 ? (
          <EmptyState icon={<FileText />} title={t('forms.emptyMine')} />
        ) : (
          <Card><CardContent className="p-0"><div className="divide-y">
            {myForms.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{label(f)}</span>
                  <span className="text-muted-foreground" dir="ltr">{f.key} · v{f.version}</span>
                  <Badge variant={STATUS_VARIANT[f.status] ?? 'secondary'}>{t(`forms.status.${f.status}`)}</Badge>
                  {f.workflow_key && <Badge variant="secondary" dir="ltr">{f.workflow_key}</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <Link href={`/settings/forms/${f.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}><Pencil className="h-3.5 w-3.5" /> {t('forms.design')}</Link>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => onDelete(f.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
                </div>
              </div>
            ))}
          </div></CardContent></Card>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t('forms.templates')}</h3>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('forms.emptyTemplates')}</p>
        ) : (
          <Card><CardContent className="p-0"><div className="divide-y">
            {templates.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="font-medium">{label(f)} <span className="text-muted-foreground" dir="ltr">({f.key})</span></span>
                <Button size="sm" variant="outline" disabled={pending} onClick={() => onClone(f.id, label(f))}><Copy className="h-3.5 w-3.5" /> {t('forms.clone')}</Button>
              </div>
            ))}
          </div></CardContent></Card>
        )}
      </section>
    </div>
  );
}
