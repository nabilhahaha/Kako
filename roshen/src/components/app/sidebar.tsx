"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  Home, Building2, Truck, Upload, SlidersHorizontal, Database, Target, BarChart3,
  Users, Settings, CheckSquare, CalendarDays, ClipboardList, ChevronDown, Menu, X,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  Home, Building2, Truck, Upload, SlidersHorizontal, Database, Target, BarChart3,
  Users, Settings, CheckSquare, CalendarDays, ClipboardList,
};

export type NavChildView = { href: string; key: string; label: string };
export type NavItemView = { href: string; key: string; icon: string; label: string; children: NavChildView[] };
export type NavGroupView = { key: string; label: string; items: NavItemView[] };

export function Sidebar({ groups, currentPath }: { groups: NavGroupView[]; currentPath?: string }) {
  const live = usePathname();
  const search = useSearchParams();
  const pathname = currentPath ?? live;
  const tab = search.get("tab");
  const [mobileOpen, setMobileOpen] = useState(false);

  const hrefActive = (href: string) => {
    const [path, query] = href.split("?");
    const qtab = query ? new URLSearchParams(query).get("tab") : null;
    if (path === "/") return pathname === "/";
    if (path === "/organization") {
      if (pathname !== "/organization") return false;
      return qtab ? tab === "distributors" : tab !== "distributors";
    }
    if (path === "/workspace") {
      if (pathname !== "/workspace" && !pathname.startsWith("/workspace/")) return false;
      return qtab ? tab === qtab : true;
    }
    if (qtab) return pathname === path && tab === qtab;
    return pathname === path || pathname.startsWith(path + "/");
  };
  const itemActive = (i: NavItemView) => hrefActive(i.href) || i.children.some((c) => hrefActive(c.href));

  const tree = (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <Group key={g.key} group={g} hrefActive={hrefActive} itemActive={itemActive} onNavigate={() => setMobileOpen(false)} />
      ))}
    </nav>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Menu"
        className="fixed start-3 top-3.5 z-30 rounded-lg border border-line bg-white p-2 text-ink/70 shadow-sm lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-e border-line bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-line px-5">
          <Wordmark className="text-xl" />
        </div>
        {tree}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 start-0 flex w-72 max-w-[85vw] flex-col border-e border-line bg-white shadow-xl">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <Wordmark className="text-xl" />
              <button onClick={() => setMobileOpen(false)} className="text-muted hover:text-ink"><X className="h-5 w-5" /></button>
            </div>
            {tree}
          </aside>
        </div>
      )}
    </>
  );
}

function Group({
  group, hrefActive, itemActive, onNavigate,
}: {
  group: NavGroupView;
  hrefActive: (h: string) => boolean;
  itemActive: (i: NavItemView) => boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  const groupActive = group.items.some(itemActive);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider hover:text-burgundy",
          groupActive ? "text-burgundy" : "text-muted/80",
        )}
      >
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && (
        <div className="space-y-0.5">
          {group.items.map((i) => (
            <Item key={i.key} item={i} hrefActive={hrefActive} active={itemActive(i)} onNavigate={onNavigate} />
          ))}
        </div>
      )}
    </div>
  );
}

function Item({
  item, hrefActive, active, onNavigate,
}: {
  item: NavItemView;
  hrefActive: (h: string) => boolean;
  active: boolean;
  onNavigate: () => void;
}) {
  const Icon = ICONS[item.icon] ?? Home;
  const hasChildren = item.children.length > 0;
  const [open, setOpen] = useState(active);
  const selfActive = hrefActive(item.href);

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1 rounded-xl pe-1.5 text-sm font-medium transition-colors",
          selfActive ? "bg-burgundy text-cream shadow-sm" : active ? "text-burgundy" : "text-ink/75 hover:bg-burgundy-soft hover:text-burgundy",
        )}
      >
        <Link href={item.href} onClick={onNavigate} className="flex flex-1 items-center gap-3 px-3 py-2.5">
          <Icon className={cn("h-[18px] w-[18px]", selfActive ? "text-gold-soft" : "text-muted")} />
          {item.label}
        </Link>
        {hasChildren && (
          <button onClick={() => setOpen((o) => !o)} aria-label="Toggle" className={cn("rounded-lg p-1", selfActive ? "text-cream/80" : "text-muted hover:text-burgundy")}>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open ? "" : "-rotate-90")} />
          </button>
        )}
      </div>
      {hasChildren && open && (
        <div className="ms-4 mt-0.5 space-y-0.5 border-s border-line ps-2">
          {item.children.map((c) => {
            const ca = hrefActive(c.href);
            return (
              <Link
                key={c.key}
                href={c.href}
                onClick={onNavigate}
                className={cn(
                  "block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
                  ca ? "bg-burgundy-soft text-burgundy" : "text-ink/65 hover:bg-burgundy-soft hover:text-burgundy",
                )}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
