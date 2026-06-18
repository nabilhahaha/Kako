'use client';

import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';

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

/** EntityTabs — URL-wired tab bar for the center detail. */
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
    <div className="mb-3 flex flex-wrap gap-1 border-b">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${active === t.key ? 'border-primary font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
        >
          {t.label}
        </button>
      ))}
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
