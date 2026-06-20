'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { TopGroupingNav } from './top-grouping-nav';

/** EntityHeader — center header: title, optional status badge, actions. */
export function EntityHeader({
  title,
  subtitle,
  status,
  actions,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-3 border-b bg-background/95 pb-3 backdrop-blur">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-lg font-semibold">{title}</h2>
          {status}
        </div>
        {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** EntityTabs — record-facet tabs for the center detail. A thin wrapper over the
 *  platform TopGroupingNav primitive (button mode) so every record's facets use
 *  the same horizontal grouping as module sections. API unchanged. */
export function EntityTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-3">
      <TopGroupingNav
        items={tabs.map((t) => ({ key: t.key, label: t.label, active: active === t.key, onClick: () => onChange(t.key) }))}
      />
    </div>
  );
}

/** DetailPlaceholder — shown in the center when nothing is selected. */
export function DetailPlaceholder({ text }: { text: string }) {
  return (
    <Card>
      <CardContent className="p-10 text-center text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}
