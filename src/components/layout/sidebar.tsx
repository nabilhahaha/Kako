'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { visibleSections, type Module } from '@/lib/erp/navigation';
import type { Permission } from '@/lib/erp/permissions';
import { Menu, X } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { useI18n } from '@/lib/i18n/provider';

export function Sidebar({
  permissions,
  isSuperAdmin,
  isPlatformOwner = false,
  modules = [],
}: {
  permissions: Permission[];
  isSuperAdmin: boolean;
  isPlatformOwner?: boolean;
  modules?: Module[];
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // Compute on the client so the icon components never cross the
  // server→client boundary (functions aren't serializable as props).
  const sections = visibleSections(permissions, isSuperAdmin, isPlatformOwner, modules);

  // Highlight only the most specific (longest) matching href, so a parent like
  // /platform doesn't stay active while on /platform/companies.
  const activeHref = sections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  const content = (
    <nav className="flex h-full flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-4 px-2 py-2">
        <Logo withWordmark />
      </div>

      {sections.map((section) => (
        <div key={section.title} className="mb-2">
          <p className="px-3 py-1 text-xs font-medium text-muted-foreground">
            {t(section.title)}
          </p>
          {section.items.map((item) => {
            const active = item.href === activeHref;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-secondary',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 left-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg lg:hidden"
        aria-label={t('common.menu')}
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 right-0 w-72 border-l bg-card shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute left-3 top-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            {content}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-l bg-card lg:block">
        {content}
      </aside>
    </>
  );
}
