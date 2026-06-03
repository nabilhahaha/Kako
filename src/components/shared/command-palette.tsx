'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useI18n } from '@/lib/i18n/provider';
import {
  searchPlatform,
  type CompanyHit,
  type UserHit,
  type AuditHit,
  type ApprovalHit,
} from '@/app/(app)/platform/search-actions';
import { describeAuditEvent } from '@/lib/erp/audit';
import { CORE_MODULES, INDUSTRY_PACKS } from '@/lib/erp/licensing-catalog';
import {
  Search,
  Building2,
  User as UserIcon,
  Plus,
  UserPlus,
  ScrollText,
  CreditCard,
  LayoutDashboard,
  CheckSquare,
  Boxes,
  Package,
  X,
  CornerDownLeft,
  Loader2,
} from 'lucide-react';

/* ── types ─────────────────────────────────────────────────────────────── */

type Kind = 'company' | 'user' | 'audit' | 'approval' | 'module' | 'pack' | 'action';

interface FlatItem {
  key: string;
  kind: Kind;
  label: string;
  sub?: string | null;
  href: string;
  icon: typeof Search;
  /** stored for the "recent" list */
  recentLabel: string;
}

interface RecentEntry {
  key: string;
  kind: Kind;
  label: string;
  sub?: string | null;
  href: string;
}

/** A company the user opened from the palette (id + name), for "Recently opened". */
interface OpenedCompany {
  id: string;
  name: string;
}

/** A company's open frequency, for the "Frequent" group. */
interface FrequentCompany {
  id: string;
  name: string;
  count: number;
  /** epoch ms of the most recent open — tiebreaker after count. */
  last: number;
}

const RECENT_KEY = 'platform-command-palette-recent-v1';
const OPENED_KEY = 'platform-command-palette-opened-companies-v1';
const FREQUENT_KEY = 'platform-command-palette-frequent-companies-v1';
const RECENT_MAX = 5;
const DEBOUNCE_MS = 200;

/**
 * Relevance rank for a static-catalog row (modules/packs). Lower = better:
 * 0 exact (full label/key equals query), 1 startsWith, 2 contains. Mirrors the
 * server-side ranking so exact matches surface above partial ones.
 */
function staticRank(term: string, fields: string[]): number {
  const q = term.toLowerCase();
  let best = 2;
  for (const f of fields) {
    const v = f.toLowerCase();
    if (v === q) return 0;
    if (v.startsWith(q)) best = Math.min(best, 1);
  }
  return best;
}

/** Relative time ("3 hours ago"), bilingual — mirrors the audit page helper. */
function relativeTime(iso: string, locale: 'en' | 'ar'): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const sec = Math.round((Date.now() - then) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar-EG' : 'en', { numeric: 'auto' });
  const abs = Math.abs(sec);
  if (abs < 60) return rtf.format(-sec, 'second');
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(-min, 'minute');
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(-hr, 'hour');
  const day = Math.round(hr / 24);
  if (Math.abs(day) < 30) return rtf.format(-day, 'day');
  const month = Math.round(day / 30);
  if (Math.abs(month) < 12) return rtf.format(-month, 'month');
  return rtf.format(-Math.round(month / 12), 'year');
}

/* ── recent (localStorage) ─────────────────────────────────────────────── */

function readRecent(): RecentEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RecentEntry[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushRecent(entry: RecentEntry) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readRecent().filter((e) => e.key !== entry.key);
    const next = [entry, ...existing].slice(0, RECENT_MAX);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* ── recently opened companies (localStorage) ──────────────────────────── */

function readOpenedCompanies(): OpenedCompany[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(OPENED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as OpenedCompany[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function pushOpenedCompany(entry: OpenedCompany) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readOpenedCompanies().filter((e) => e.id !== entry.id);
    const next = [entry, ...existing].slice(0, RECENT_MAX);
    window.localStorage.setItem(OPENED_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/* ── frequent companies (localStorage) ─────────────────────────────────── */

function readFrequentCompanies(): FrequentCompany[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(FREQUENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return (parsed as FrequentCompany[]).filter(
      (e) => e && typeof e.id === 'string' && typeof e.count === 'number',
    );
  } catch {
    return [];
  }
}

/** Increment a company's open-frequency counter (and refresh its name + last). */
function bumpFrequentCompany(entry: OpenedCompany) {
  if (typeof window === 'undefined') return;
  try {
    const existing = readFrequentCompanies();
    const found = existing.find((e) => e.id === entry.id);
    if (found) {
      found.count += 1;
      found.name = entry.name;
      found.last = Date.now();
    } else {
      existing.push({ id: entry.id, name: entry.name, count: 1, last: Date.now() });
    }
    // Keep the store bounded; sort by count then recency.
    existing.sort((a, b) => b.count - a.count || b.last - a.last);
    window.localStorage.setItem(FREQUENT_KEY, JSON.stringify(existing.slice(0, 20)));
  } catch {
    /* ignore quota / disabled storage */
  }
}

/** Top-N frequent companies (by count, then recency). */
function topFrequentCompanies(n: number): FrequentCompany[] {
  return [...readFrequentCompanies()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, n);
}

/* ── highlighting ──────────────────────────────────────────────────────── */

function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (!q) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-transparent font-semibold text-foreground">
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/* ── icons per kind ────────────────────────────────────────────────────── */

const ICON_BY_KIND: Record<Kind, typeof Search> = {
  company: Building2,
  user: UserIcon,
  audit: ScrollText,
  approval: CheckSquare,
  module: Boxes,
  pack: Package,
  action: Search,
};

/* ── component ─────────────────────────────────────────────────────────── */

/**
 * Global search command palette for the platform-owner area (⌘K / Ctrl+K).
 * Read-only: searches companies, users, audit events and pending approvals via
 * the `searchPlatform` server action (RLS scopes rows to the session), plus
 * static in-memory catalogs for modules and industry packs. Quick actions are
 * always shown and filterable. When the query is empty it surfaces recent
 * searches and recently-opened companies. Mobile = full-screen sheet; desktop
 * = centered dialog.
 */
export function CommandPalette() {
  const router = useRouter();
  const { t, locale } = useI18n();

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<CompanyHit[]>([]);
  const [users, setUsers] = useState<UserHit[]>([]);
  const [audit, setAudit] = useState<AuditHit[]>([]);
  const [approvals, setApprovals] = useState<ApprovalHit[]>([]);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [opened, setOpened] = useState<OpenedCompany[]>([]);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const reqId = useRef(0);

  /* quick actions — always present, filtered by label */
  const quickActions = useMemo<FlatItem[]>(
    () => ([
      { kind: 'action' as const, label: t('platform.search.qaNewCompany'), href: '/platform/companies?new=1', icon: Plus },
      { kind: 'action' as const, label: t('platform.search.qaInviteStaff'), href: '/platform/staff?invite=1', icon: UserPlus },
      { kind: 'action' as const, label: t('platform.search.qaViewAudit'), href: '/platform/audit', icon: ScrollText },
      { kind: 'action' as const, label: t('platform.search.qaBilling'), href: '/platform/billing', icon: CreditCard },
      { kind: 'action' as const, label: t('platform.search.qaOverview'), href: '/platform', icon: LayoutDashboard },
    ]).map((a) => ({
      ...a,
      key: `action:${a.href}`,
      recentLabel: a.label,
    })),
    [t],
  );

  /* ── open / close ──────────────────────────────────────────────────── */

  // ⌘K / Ctrl+K toggles; capture phase so this palette wins over any other
  // window-level ⌘K handler on platform routes. Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setOpen((o) => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    function onTrigger() {
      setOpen(true);
    }
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('open-platform-search', onTrigger);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('open-platform-search', onTrigger);
    };
  }, []);

  // Lock body scroll + reset state + focus input while open.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setDebounced('');
    setCompanies([]);
    setUsers([]);
    setAudit([]);
    setApprovals([]);
    setActive(0);
    setRecent(readRecent());
    setOpened(readOpenedCompanies());
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(id);
    };
  }, [open]);

  /* ── debounce query ────────────────────────────────────────────────── */

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(q.trim()), DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [q]);

  useEffect(() => setActive(0), [debounced]);

  /* ── run search ────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!open) return;
    if (debounced.length < 1) {
      setCompanies([]);
      setUsers([]);
      setAudit([]);
      setApprovals([]);
      setLoading(false);
      return;
    }
    const myId = ++reqId.current;
    setLoading(true);
    searchPlatform(debounced)
      .then((res) => {
        if (myId !== reqId.current) return; // stale response
        setCompanies(res.companies);
        setUsers(res.users);
        setAudit(res.audit);
        setApprovals(res.approvals);
      })
      .catch(() => {
        if (myId !== reqId.current) return;
        setCompanies([]);
        setUsers([]);
        setAudit([]);
        setApprovals([]);
      })
      .finally(() => {
        if (myId === reqId.current) setLoading(false);
      });
  }, [debounced, open]);

  /* ── build flat result list (for keyboard nav) ─────────────────────── */

  const companyItems = useMemo<FlatItem[]>(
    () =>
      companies.map((c) => {
        const label = (locale === 'ar' && c.name_ar) || c.name;
        return {
          key: `company:${c.id}`,
          kind: 'company',
          label,
          sub: c.slug,
          href: `/platform/companies/${c.id}`,
          icon: Building2,
          recentLabel: label,
        };
      }),
    [companies, locale],
  );

  const userItems = useMemo<FlatItem[]>(
    () =>
      users.map((u) => {
        const label = u.full_name || u.email || u.id;
        const href = u.companyId
          ? `/platform/companies/${u.companyId}#section-users`
          : '/platform/staff';
        return {
          key: `user:${u.id}`,
          kind: 'user',
          label,
          sub: u.email,
          href,
          icon: UserIcon,
          recentLabel: label,
        };
      }),
    [users],
  );

  // Audit events — rendered via describeAuditEvent() + relative time. Deep-links
  // to /platform/audit?event={id}, which the audit log reads to auto-expand /
  // highlight / scroll to the row (read-only; no new fetches — see audit-log.tsx).
  const auditItems = useMemo<FlatItem[]>(
    () =>
      audit.map((a) => {
        const label = describeAuditEvent(
          {
            actor_email: a.actor_email,
            action: a.action,
            entity: a.entity,
            entity_id: a.entity_id,
            details: a.details,
            company_id: a.company_id,
          },
          { locale, companyName: a.companyName },
        );
        return {
          key: `audit:${a.id}`,
          kind: 'audit' as const,
          label,
          sub: relativeTime(a.created_at, locale),
          href: `/platform/audit?event=${encodeURIComponent(a.id)}`,
          icon: ScrollText,
          recentLabel: label,
        };
      }),
    [audit, locale],
  );

  // Pending approvals — deep-link to the related company's Company 360 (no
  // per-record approval screen exists on the platform side; /approvals is the
  // tenant inbox). Falls back to the companies list when company is unknown.
  const approvalItems = useMemo<FlatItem[]>(
    () =>
      approvals.map((a) => {
        const label = a.recordLabel || a.entity;
        const href = a.companyId
          ? `/platform/companies/${a.companyId}#section-users`
          : '/platform/companies';
        return {
          key: `approval:${a.id}`,
          kind: 'approval' as const,
          label,
          sub: `${a.entity} · ${t('platform.search.approvalPending')}`,
          href,
          icon: CheckSquare,
          recentLabel: label,
        };
      }),
    [approvals, t],
  );

  // Modules — STATIC catalog (CORE_MODULES), filtered in-memory.
  const moduleItems = useMemo<FlatItem[]>(() => {
    const term = debounced.toLowerCase();
    if (!term) return [];
    return CORE_MODULES.filter(
      (m) =>
        m.labelEn.toLowerCase().includes(term) ||
        m.labelAr.includes(debounced) ||
        m.key.toLowerCase().includes(term),
    )
      // exact → startsWith → contains, then catalog (alphabetical) order.
      .map((m, i) => ({ m, i, rank: staticRank(debounced, [m.labelEn, m.labelAr, m.key]) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.m)
      .slice(0, 5)
      .map((m) => {
        const label = locale === 'ar' ? m.labelAr : m.labelEn;
        return {
          key: `module:${m.key}`,
          kind: 'module' as const,
          label,
          sub: m.key,
          // Modules are per-company; route to the marketplace surface.
          href: '/settings/marketplace',
          icon: Boxes,
          recentLabel: label,
        };
      });
  }, [debounced, locale]);

  // Industry Packs — STATIC catalog (INDUSTRY_PACKS), filtered in-memory.
  const packItems = useMemo<FlatItem[]>(() => {
    const term = debounced.toLowerCase();
    if (!term) return [];
    return INDUSTRY_PACKS.filter(
      (p) =>
        p.labelEn.toLowerCase().includes(term) ||
        p.labelAr.includes(debounced) ||
        p.key.toLowerCase().includes(term),
    )
      // exact → startsWith → contains, then catalog (alphabetical) order.
      .map((p, i) => ({ p, i, rank: staticRank(debounced, [p.labelEn, p.labelAr, p.key]) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map((x) => x.p)
      .slice(0, 5)
      .map((p) => {
        const label = locale === 'ar' ? p.labelAr : p.labelEn;
        return {
          key: `pack:${p.key}`,
          kind: 'pack' as const,
          label,
          sub: p.key,
          // Packs are per-company; route to the marketplace surface.
          href: '/settings/marketplace',
          icon: Package,
          recentLabel: label,
        };
      });
  }, [debounced, locale]);

  const filteredActions = useMemo<FlatItem[]>(() => {
    const term = debounced.toLowerCase();
    if (!term) return quickActions;
    return quickActions.filter((a) => a.label.toLowerCase().includes(term));
  }, [quickActions, debounced]);

  const hasQuery = debounced.length > 0;

  // Ordered groups → flat array for arrow-key navigation.
  const groups = useMemo(() => {
    const g: { title: string; items: FlatItem[] }[] = [];
    if (companyItems.length) g.push({ title: t('platform.search.groupCompanies'), items: companyItems });
    if (userItems.length) g.push({ title: t('platform.search.groupUsers'), items: userItems });
    if (auditItems.length) g.push({ title: t('platform.search.groupAudit'), items: auditItems });
    if (approvalItems.length) g.push({ title: t('platform.search.groupApprovals'), items: approvalItems });
    if (moduleItems.length) g.push({ title: t('platform.search.groupModules'), items: moduleItems });
    if (packItems.length) g.push({ title: t('platform.search.groupPacks'), items: packItems });
    if (filteredActions.length) g.push({ title: t('platform.search.groupActions'), items: filteredActions });
    return g;
  }, [companyItems, userItems, auditItems, approvalItems, moduleItems, packItems, filteredActions, t]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  // Keep the active row in view.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  /* ── selection ─────────────────────────────────────────────────────── */

  const select = useCallback(
    (item: FlatItem) => {
      pushRecent({
        key: item.key,
        kind: item.kind,
        label: item.recentLabel,
        sub: item.sub,
        href: item.href,
      });
      // Record companies separately for the "Recently opened" group.
      if (item.kind === 'company') {
        const id = item.key.slice('company:'.length);
        pushOpenedCompany({ id, name: item.recentLabel });
      }
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  const selectRecent = useCallback(
    (entry: RecentEntry) => {
      pushRecent(entry);
      setOpen(false);
      router.push(entry.href);
    },
    [router],
  );

  const selectOpenedCompany = useCallback(
    (c: OpenedCompany) => {
      pushOpenedCompany(c);
      setOpen(false);
      router.push(`/platform/companies/${c.id}`);
    },
    [router],
  );

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, Math.max(flat.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = flat[active];
      if (item) select(item);
    }
  }

  if (!open) return null;

  const showRecent = !hasQuery && recent.length > 0;
  const showOpened = !hasQuery && opened.length > 0;
  const showHint = !hasQuery && recent.length === 0 && opened.length === 0;
  const noResults = hasQuery && !loading && flat.length === 0;

  /* ── render ────────────────────────────────────────────────────────── */

  let runningIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/40 sm:items-start sm:p-4 sm:pt-[12vh]"
      onMouseDown={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('platform.search.placeholder')}
        className={cn(
          'flex w-full flex-col overflow-hidden bg-popover shadow-2xl',
          // full-screen sheet on mobile, centered dialog on >= sm
          'h-full sm:h-auto sm:max-h-[70vh] sm:max-w-lg sm:rounded-xl sm:border',
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* search input row */}
        <div className="flex items-center gap-2 border-b px-3">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder={t('platform.search.placeholder')}
            aria-label={t('platform.search.placeholder')}
            className="h-14 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground sm:h-12 sm:text-sm"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t('platform.search.close')}
            className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* results */}
        <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2 sm:max-h-[calc(70vh-3.5rem)]">
          {loading && flat.length === 0 ? (
            <li className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('platform.search.loading')}
            </li>
          ) : showHint ? (
            <li className="p-6 text-center text-sm text-muted-foreground">
              {t('platform.search.hintType')}
            </li>
          ) : null}

          {/* recent (query empty) */}
          {showRecent && (
            <li>
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {t('platform.search.recent')}
              </p>
              <ul>
                {recent.map((r) => {
                  const Icon = ICON_BY_KIND[r.kind];
                  return (
                    <li key={`recent:${r.key}`}>
                      <button
                        type="button"
                        onClick={() => selectRecent(r)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none sm:py-2"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="flex-1 truncate">{r.label}</span>
                        {r.sub && (
                          <span dir="ltr" className="truncate text-xs text-muted-foreground">
                            {r.sub}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          )}

          {/* recently opened companies (query empty) */}
          {showOpened && (
            <li>
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {t('platform.search.recentOpened')}
              </p>
              <ul>
                {opened.map((c) => (
                  <li key={`opened:${c.id}`}>
                    <button
                      type="button"
                      onClick={() => selectOpenedCompany(c)}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start text-sm hover:bg-secondary focus-visible:bg-secondary focus-visible:outline-none sm:py-2"
                    >
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1 truncate">{c.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          )}

          {/* grouped results */}
          {groups.map((group) => (
            <li key={group.title}>
              <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
                {group.title}
              </p>
              <ul>
                {group.items.map((item) => {
                  runningIdx += 1;
                  const idx = runningIdx;
                  const Icon = item.icon;
                  const isActive = idx === active;
                  return (
                    <li key={item.key}>
                      <button
                        type="button"
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        onMouseEnter={() => setActive(idx)}
                        onClick={() => select(item)}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-lg px-3 py-3 text-start text-sm transition-colors focus-visible:outline-none sm:py-2',
                          isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 shrink-0',
                            isActive ? 'text-primary-foreground' : 'text-muted-foreground',
                          )}
                        />
                        <span className="flex-1 truncate">
                          <Highlight text={item.label} term={debounced} />
                        </span>
                        {item.sub && (
                          <span
                            dir="ltr"
                            className={cn(
                              'truncate text-xs',
                              isActive ? 'text-primary-foreground/70' : 'text-muted-foreground',
                            )}
                          >
                            {item.sub}
                          </span>
                        )}
                        {isActive && <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-70" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          ))}

          {/* empty state */}
          {noResults && (
            <li className="flex flex-col items-center gap-1 p-8 text-center">
              <Search className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium">{t('platform.search.empty')}</p>
              <p className="text-xs text-muted-foreground">{t('platform.search.emptyHint')}</p>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
