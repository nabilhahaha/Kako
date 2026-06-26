"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  Building2,
  Truck,
  Upload,
  SlidersHorizontal,
  Database,
  Target,
  BarChart3,
  Users,
  Settings,
  PanelLeftClose,
  type LucideIcon,
} from "lucide-react";
import { Wordmark } from "@/components/brand/wordmark";
import type { NavItem } from "@/lib/roles";
import { cn } from "@/lib/cn";

const ICONS: Record<string, LucideIcon> = {
  Home,
  Building2,
  Truck,
  Upload,
  SlidersHorizontal,
  Database,
  Target,
  BarChart3,
  Users,
  Settings,
};

export function Sidebar({ nav, currentPath }: { nav: NavItem[]; currentPath?: string }) {
  const live = usePathname();
  const pathname = currentPath ?? live;
  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white lg:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Wordmark className="text-xl" />
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const Icon = ICONS[item.icon] ?? Home;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-burgundy text-cream shadow-sm"
                  : "text-ink/75 hover:bg-burgundy-soft hover:text-burgundy",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px]", active ? "text-gold-soft" : "text-muted")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button className="flex items-center gap-2 border-t border-line px-5 py-3 text-xs font-medium text-muted hover:text-burgundy">
        <PanelLeftClose className="h-4 w-4" />
        Collapse
      </button>
    </aside>
  );
}
