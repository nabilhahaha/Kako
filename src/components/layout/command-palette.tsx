'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { visibleSections, type Module } from '@/lib/erp/navigation';
import type { Permission } from '@/lib/erp/permissions';
import {
  Search, Users, Package, Truck, ShoppingCart, FileText, Undo2, MapPin, GitBranch, Paperclip, User, Loader2,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import { inputModeFor } from '@/lib/search/classify';
import type { SearchCategory, SearchEntityType, SearchResult } from '@/lib/search/types';

const ENTITY_ICON: Record<SearchEntityType, typeof Search> = {
  customer: Users, product: Package, supplier: Truck, order: ShoppingCart, invoice: FileText,
  return: Undo2, visit: MapPin, workflow: GitBranch, attachment: Paperclip, user: User,
};

/** Global quick-jump (Ctrl/⌘ K). Navigates pages the user can see; when records
 *  search is enabled (KAKO_SEARCH) it ALSO searches business records via /api/search
 *  and deep-links to them. Opens on a window `open-command-palette` event too. */
export function CommandPalette({
  permissions,
  isSuperAdmin,
  isPlatformOwner = false,
  modules = [],
  platformPermissions = [],
  isPlatformStaff = false,
  businessType = null,
  recordsSearch = false,
  enabledFlags = [],
}: {
  permissions: Permission[];
  isSuperAdmin: boolean;
  isPlatformOwner?: boolean;
  modules?: Module[];
  platformPermissions?: string[];
  isPlatformStaff?: boolean;
  businessType?: string | null;
  recordsSearch?: boolean;
  enabledFlags?: string[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [cats, setCats] = useState<SearchCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Navigation items the user can see (instant, local).
  const navItems = useMemo(
    () =>
      visibleSections(permissions, isSuperAdmin, isPlatformOwner, modules, platformPermissions, isPlatformStaff, businessType, enabledFlags).flatMap((s) =>
        s.items.map((i) => ({ label: t(i.label), href: i.href, icon: i.icon, section: t(s.title) })),
      ),
    [permissions, isSuperAdmin, isPlatformOwner, modules, platformPermissions, isPlatformStaff, businessType, enabledFlags, t],
  );

  const filteredNav = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return navItems;
    return navItems.filter((i) => i.label.toLowerCase().includes(term) || i.section.toLowerCase().includes(term));
  }, [q, navItems]);

  // Records search (flag-gated): debounced /api/search call.
  useEffect(() => {
    if (!recordsSearch || !open) { setCats([]); return; }
    const term = q.trim();
    if (term.length < 2) { setCats([]); setLoading(false); return; }
    const ctrl = new AbortController();
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const data = (await res.json()) as SearchResult;
        setCats(data.categories ?? []);
      } catch { /* aborted or unavailable — leave nav-only */ }
      finally { setLoading(false); }
    }, 200);
    return () => { clearTimeout(id); ctrl.abort(); };
  }, [q, open, recordsSearch]);

  // Combined, keyboard-navigable selectable list: record hits first, then pages.
  const recordItems = useMemo(
    () => cats.flatMap((c) => c.hits.map((h) => ({ label: h.title, href: h.href }))),
    [cats],
  );
  const selectable = useMemo(
    () => [...recordItems, ...filteredNav.map((n) => ({ label: n.label, href: n.href }))],
    [recordItems, filteredNav],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); }
      else if (e.key === 'Escape') { setOpen(false); }
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-command-palette', onOpen);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('open-command-palette', onOpen); };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setActive(0); setCats([]); setTimeout(() => inputRef.current?.focus(), 0); }
  }, [open]);
  useEffect(() => { setActive(0); }, [q]);

  const go = useCallback((href: string) => { setOpen(false); router.push(href); }, [router]);

  if (!open) return null;

  const empty = selectable.length === 0 && !loading;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-xl border bg-popover shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b px-3">
          {loading ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" /> : <Search className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <input
            ref={inputRef}
            value={q}
            inputMode={recordsSearch ? inputModeFor(q) : 'text'}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, selectable.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter' && selectable[active]) { e.preventDefault(); go(selectable[active].href); }
            }}
            placeholder={recordsSearch ? t('search.placeholder') : t('common.searchPage')}
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden rounded border bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline" dir="ltr">Ctrl K</kbd>
        </div>
        <ul className="max-h-[60vh] overflow-y-auto p-2">
          {empty && <li className="p-4 text-center text-sm text-muted-foreground">{t('common.noResults')}</li>}

          {/* Records — categorized */}
          {cats.map((c) => {
            const Icon = ENTITY_ICON[c.entityType] ?? Search;
            return (
              <li key={`cat-${c.entityType}`} className="mb-1">
                <div className="flex items-center justify-between px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span>{t(`search.entity.${c.entityType}`)}</span>
                  <span>{c.count}</span>
                </div>
                <ul>
                  {c.hits.map((h) => {
                    const idx = selectable.findIndex((sl) => sl.href === h.href && sl.label === h.title);
                    return (
                      <li key={`${h.entityType}-${h.entityId}`}>
                        <button
                          onMouseEnter={() => idx >= 0 && setActive(idx)}
                          onClick={() => go(h.href)}
                          className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                            idx === active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate text-start">{h.title}</span>
                          {h.subtitle && <span className={cn('truncate text-xs', idx === active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{h.subtitle}</span>}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}

          {/* Pages */}
          {filteredNav.length > 0 && (
            <li className="mb-1">
              {cats.length > 0 && (
                <div className="px-3 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('search.pages')}</div>
              )}
              <ul>
                {filteredNav.map((i) => {
                  const Icon = i.icon;
                  const idx = selectable.findIndex((sl) => sl.href === i.href && sl.label === i.label);
                  return (
                    <li key={i.href}>
                      <button
                        onMouseEnter={() => idx >= 0 && setActive(idx)}
                        onClick={() => go(i.href)}
                        className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                          idx === active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 text-start">{i.label}</span>
                        <span className={cn('text-xs', idx === active ? 'text-primary-foreground/70' : 'text-muted-foreground')}>{i.section}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
