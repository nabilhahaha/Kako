'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { SETTINGS_SECTIONS } from '@/lib/erp/settings-sections';

/**
 * Persistent, searchable, permission-aware Settings navigation (Azure/Salesforce-
 * Setup style). Stays fixed in the settings layout while the selected settings
 * page renders in the center. Reuses the shared SETTINGS_SECTIONS catalog;
 * `allowedHrefs` is computed server-side (permission-aware). No logic change.
 */
export function SettingsNav({ allowedHrefs }: { allowedHrefs: string[] }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [q, setQ] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const allow = useMemo(() => new Set(allowedHrefs), [allowedHrefs]);

  const sections = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return SETTINGS_SECTIONS
      .map((s) => ({
        title: s.title,
        items: s.items.filter((i) =>
          allow.has(i.href) && (!needle || `${t(i.label)} ${t(i.desc)}`.toLowerCase().includes(needle)),
        ),
      }))
      .filter((s) => s.items.length > 0);
  }, [allow, q, t]);

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        aria-label={t('adminWb.settingsTitle')}
        className="sticky top-4 flex h-9 w-9 items-center justify-center rounded-md border hover:bg-secondary"
      >
        <PanelLeftOpen className="h-4 w-4" />
      </button>
    );
  }

  return (
    <Card className="lg:sticky lg:top-4 lg:self-start">
      <CardContent className="space-y-2 p-3">
        <div className="flex items-center gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('adminWb.settingsTitle')} aria-label={t('adminWb.settingsTitle')} />
          <button onClick={() => setCollapsed(true)} aria-label="collapse" className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <nav className="max-h-[calc(100vh-8rem)] space-y-3 overflow-auto">
          {sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <p className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t(s.title)}</p>
              {s.items.map((i) => {
                const active = pathname === i.href || pathname.startsWith(`${i.href}/`);
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'}`}
                  >
                    <i.icon className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 truncate">{t(i.label)}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </CardContent>
    </Card>
  );
}
