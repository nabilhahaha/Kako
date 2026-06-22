'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Fragment, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { visibleSections, type Module } from '@/lib/erp/navigation';
import { applyNavProfile } from '@/lib/erp/nav-profiles';
import type { Permission } from '@/lib/erp/permissions';
import type { BranchRole } from '@/lib/erp/types';
import { X, ChevronDown, PanelLeftClose, PanelLeftOpen, type LucideIcon } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { useI18n } from '@/lib/i18n/provider';
import { useMobileNav } from '@/lib/stores/mobile-nav';

const COLLAPSE_KEY = 'vantora.sidebar.collapsed';
const GROUPS_KEY = 'vantora.sidebar.openGroups';

export function Sidebar({
  permissions,
  isSuperAdmin,
  isPlatformOwner = false,
  modules = [],
  platformPermissions = [],
  isPlatformStaff = false,
  businessType = null,
  enabledFlags = [],
  roles = [],
}: {
  permissions: Permission[];
  isSuperAdmin: boolean;
  isPlatformOwner?: boolean;
  modules?: Module[];
  platformPermissions?: string[];
  isPlatformStaff?: boolean;
  businessType?: string | null;
  enabledFlags?: string[];
  /** The user's branch roles — drive the relevance-based navigation profile
   *  (primary menu + "More"). Permissions are unchanged. */
  roles?: BranchRole[];
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { open, setOpen } = useMobileNav();

  // Whole-sidebar collapse (desktop). Default expanded; restored from localStorage after
  // mount to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* ignore */ }
  }, []);
  const toggleCollapsed = () => setCollapsed((c) => {
    const next = !c;
    try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
    return next;
  });

  // Accordion: groups are CLOSED by default (only headers shown); opening one reveals its
  // children. Open groups are remembered across sessions (localStorage). The group containing
  // the active page is always force-shown + highlighted regardless (below).
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(GROUPS_KEY);
      if (raw) setOpenGroups(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, []);
  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });

  // Compute on the client so the icon components never cross the
  // server→client boundary (functions aren't serializable as props).
  const sections = applyNavProfile(
    visibleSections(permissions, isSuperAdmin, isPlatformOwner, modules, platformPermissions, isPlatformStaff, businessType, enabledFlags),
    roles,
    { isSuperAdmin, isPlatformOwner },
  );

  // Highlight only the most specific (longest) matching href, so a parent like
  // /platform doesn't stay active while on /platform/companies.
  const activeHref = sections
    .flatMap((s) => s.items.map((i) => i.href))
    .filter((href) => pathname === href || pathname.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0];

  /** One nav item row — icon + label (label hidden when collapsed, shown as a tooltip). */
  const itemLink = (href: string, label: string, Icon: LucideIcon, active: boolean, isCollapsed: boolean) => (
    <Link
      href={href}
      onClick={() => setOpen(false)}
      title={isCollapsed ? t(label) : undefined}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isCollapsed && 'justify-center px-0',
        active ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-secondary',
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && <span className="truncate">{t(label)}</span>}
    </Link>
  );

  const renderNav = (isCollapsed: boolean, showToggle: boolean) => (
    <nav className="flex h-full flex-col gap-0.5 overflow-y-auto p-2">
      <div className={cn('mb-3 flex items-center px-1 py-2', isCollapsed ? 'justify-center' : 'justify-between')}>
        {!isCollapsed && <Logo withWordmark />}
        {showToggle && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            title={isCollapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            {isCollapsed ? <PanelLeftOpen className="h-4 w-4 rtl:rotate-180" /> : <PanelLeftClose className="h-4 w-4 rtl:rotate-180" />}
          </button>
        )}
      </div>

      {sections.map((section) => {
        // Navigation Standard: the Settings hub collapses to a single rail entry — its pages
        // are navigated via the in-page Top Grouping (settings/layout.tsx).
        if (section.title === 'nav.sections.settings') {
          const home = section.items.find((i) => i.href === '/settings') ?? section.items[0];
          if (!home) return null;
          const active = pathname === '/settings' || pathname.startsWith('/settings/');
          return <div key={section.title} className="mt-1">{itemLink('/settings', 'nav.sections.settings', home.icon, active, isCollapsed)}</div>;
        }

        // Collapsed rail: a thin divider between sections, then icon-only items (with tooltips).
        if (isCollapsed) {
          return (
            <div key={section.title} className="mt-1 border-t border-border/60 pt-1">
              {section.items.map((item) => (
                <Fragment key={item.href}>{itemLink(item.href, item.label, item.icon, item.href === activeHref, true)}</Fragment>
              ))}
            </div>
          );
        }

        const hasGroups = section.items.some((i) => i.group);

        // Sections WITHOUT sub-groups keep the section-level accordion (one expandable parent).
        if (!hasGroups) {
          const sectionActive = section.items.some((i) => i.href === activeHref);
          const isOpen = openGroups.has(section.title) || sectionActive;
          return (
            <div key={section.title} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(section.title)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-secondary/60',
                  sectionActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground',
                )}
                aria-expanded={isOpen}
              >
                <span className="truncate">{t(section.title)}</span>
                <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen ? '' : '-rotate-90 rtl:rotate-90')} />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5 border-s border-border/60 ps-2">
                  {section.items.map((item) => itemLink(item.href, item.label, item.icon, item.href === activeHref, false))}
                </div>
              )}
            </div>
          );
        }

        // Sections WITH sub-groups: each sub-group with ≥2 real routes is an expandable parent;
        // a single-route sub-group (or ungrouped item) is a direct link. No fake routes/parents.
        const units: { key: string; label: string | null; items: typeof section.items }[] = [];
        for (const item of section.items) {
          const key = item.group ?? `__ungrouped:${section.title}`;
          const last = units[units.length - 1];
          if (last && last.key === key) last.items.push(item);
          else units.push({ key, label: item.group ?? null, items: [item] });
        }
        return (
          <div key={section.title} className="mb-2">
            <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/50">{t(section.title)}</p>
            {units.map((unit) => {
              // Expandable parent only when the sub-group has 2+ real child routes.
              if (unit.label && unit.items.length >= 2) {
                const groupActive = unit.items.some((i) => i.href === activeHref);
                const open = openGroups.has(unit.key) || groupActive;
                return (
                  <div key={unit.key} className="mb-0.5">
                    <button
                      type="button"
                      onClick={() => toggleGroup(unit.key)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-secondary',
                        groupActive ? 'bg-primary/10 text-primary' : 'text-foreground',
                      )}
                      aria-expanded={open}
                    >
                      <span className="truncate">{t(unit.label)}</span>
                      <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open ? '' : '-rotate-90 rtl:rotate-90')} />
                    </button>
                    {open && (
                      <div className="mt-0.5 space-y-0.5 border-s border-border/60 ps-3">
                        {unit.items.map((item) => itemLink(item.href, item.label, item.icon, item.href === activeHref, false))}
                      </div>
                    )}
                  </div>
                );
              }
              // Single-route sub-group / ungrouped → direct link(s).
              return <Fragment key={unit.key}>{unit.items.map((item) => itemLink(item.href, item.label, item.icon, item.href === activeHref, false))}</Fragment>;
            })}
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile drawer (opened from the bottom-nav "More" tab) — always full labels. */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 start-0 w-72 border-e bg-card shadow-xl">
            <button
              onClick={() => setOpen(false)}
              className="absolute end-3 top-3 flex h-8 w-8 items-center justify-center rounded-md hover:bg-secondary"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
            {renderNav(false, false)}
          </aside>
        </div>
      )}

      {/* Desktop sidebar — collapsible. Content reclaims the freed width via the layout flex. */}
      <aside className={cn('sticky top-0 hidden h-screen shrink-0 border-e bg-card transition-[width] duration-200 lg:block', collapsed ? 'w-16' : 'w-64')}>
        {renderNav(collapsed, true)}
      </aside>
    </>
  );
}
