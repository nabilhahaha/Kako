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

  // Per-group collapse — groups are OPEN by default; users may close them (session-only).
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (title: string) =>
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
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
        const sectionActive = section.items.some((i) => i.href === activeHref);

        // Navigation Standard: the Settings hub collapses to a single rail entry — its pages
        // are navigated via the in-page Top Grouping (settings/layout.tsx).
        if (section.title === 'nav.sections.settings') {
          const home = section.items.find((i) => i.href === '/settings') ?? section.items[0];
          if (!home) return null;
          const active = pathname === '/settings' || pathname.startsWith('/settings/');
          return <div key={section.title} className="mt-1">{itemLink('/settings', 'nav.sections.settings', home.icon, active, isCollapsed)}</div>;
        }

        // Collapsed rail: a thin divider between groups, then icon-only items.
        if (isCollapsed) {
          return (
            <div key={section.title} className="mt-1 border-t border-border/60 pt-1">
              {section.items.map((item) => (
                <Fragment key={item.href}>{itemLink(item.href, item.label, item.icon, item.href === activeHref, true)}</Fragment>
              ))}
            </div>
          );
        }

        // Expanded: a clickable group header (chevron) + items. Active group is forced open.
        const isOpen = !closedGroups.has(section.title) || sectionActive;
        return (
          <div key={section.title} className="mb-1">
            <button
              type="button"
              onClick={() => toggleGroup(section.title)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-secondary/60',
                sectionActive ? 'text-primary' : 'text-muted-foreground',
              )}
              aria-expanded={isOpen}
            >
              <span className="truncate">{t(section.title)}</span>
              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isOpen ? '' : '-rotate-90 rtl:rotate-90')} />
            </button>
            {isOpen && (
              <div className="mt-0.5 space-y-0.5">
                {section.items.map((item, idx) => {
                  const showGroup = item.group && item.group !== section.items[idx - 1]?.group;
                  return (
                    <Fragment key={item.href}>
                      {showGroup && (
                        <p className="px-3 pb-0.5 pt-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">{t(item.group!)}</p>
                      )}
                      {itemLink(item.href, item.label, item.icon, item.href === activeHref, false)}
                    </Fragment>
                  );
                })}
              </div>
            )}
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
