'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Loader2, Globe, Building2 } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { instantiateTemplate, type TemplateListItem } from '../actions';

export function TemplatesClient({ templates }: { templates: TemplateListItem[] }) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, start] = useTransition();

  function use(id: string) {
    setBusy(id);
    start(async () => {
      const res = await instantiateTemplate(id);
      setBusy(null);
      if (!res.ok || !res.data) { toast.error(res.error ?? t('workflowBuilder.useError')); return; }
      toast.success(t('workflowBuilder.useOk'));
      router.push('/settings/workflows');
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {templates.map((tpl) => (
        <Card key={tpl.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{locale === 'ar' ? tpl.nameAr : tpl.nameEn}</h3>
              <Badge variant="secondary" className="gap-1 whitespace-nowrap">
                {tpl.isGlobal ? <Globe className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {t(`workflowBuilder.category.${tpl.category}`)}
              </Badge>
            </div>
            <button
              onClick={() => use(tpl.id)}
              disabled={busy === tpl.id}
              className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            >
              {busy === tpl.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('workflowBuilder.useTemplate')}
            </button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
