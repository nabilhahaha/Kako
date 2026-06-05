'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { visibleSections, type Module } from '@/lib/erp/navigation';
import type { Permission } from '@/lib/erp/permissions';
import { Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';

/** Global quick-jump (Ctrl/⌘ K). Searches the pages the current user can see and
 *  navigates on Enter/click. Also opens on a window `open-command-palette` event
 *  (dispatched by the top-bar search button). */
export function CommandPalette({
  permissions,
  isSuperAdmin,
  isPlatformOwner = false,
  modules = [],
  platformPermissions = [],
  isPlatformStaff = false,
  businessType = null,
}: {
  permissions: Permission[];
  isSuperAdmin: boolean;
  isPlatformOwner?: boolean;
  modules?: Module[];
  platformPermissions?: string[];
  isPlatformStaff?: boolean;
  businessType?: string | null;
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(
    () =>
      visibleSections(permissions, isSuperAdmin, isPlatformOwner, modules, platformPermissions, isPlatformStaff, businessType).flatMap((s) =>
        s.items.map((i) => ({ label: t(i.label), href: i.href, icon: i.icon, section: t(s.title) })),
      ),
    [permissions, isSuperAdmin, isPlatformOwner, modules, platformPermissions, isPlatformStaff, businessType, t],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return items;
    return items.filter(
      (i) => i.label.toLowerCase().includes(term) || i.section.toLowerCase().includes(term),
    );
  }, [q, items]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-command-palette', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  if (!open) return null;

  const go = (href: string) => { setOpen(false); router.push(href); };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter' && filtered[active]) { e.preventDefault(); go(filtered[active].href); }
            }}
            placeholder={t('common.searchPage')}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline" dir="ltr">Ctrl K</kbd>
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <li className="p-4 text-center text-sm text-muted-foreground">{t('common.noResults')}</li>
          ) : (
            filtered.map((i, idx) => {
              const Icon = i.icon;
              return (
                <li key={i.href}>
                  <button
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(i.href)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                      idx === active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-start">{i.label}</span>
                    <span className={cn('text-xs', idx === active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{i.section}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
