'use client';

import { PageHeader } from './page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Construction } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { t } = useI18n();
  return (
    <div>
      <PageHeader title={title} description={description} />
      <Card>
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center text-muted-foreground">
          <Construction className="h-10 w-10" />
          <p className="font-medium">{t('shared.comingSoon.title')}</p>
          <p className="text-sm">{t('shared.comingSoon.body')}</p>
        </CardContent>
      </Card>
    </div>
  );
}
