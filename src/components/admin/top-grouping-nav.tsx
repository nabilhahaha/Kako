'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface TopGroupingItem {
  key: string;
  label: string;
  icon?: ReactNode;
  /** Link mode — navigate to a route. */
  href?: string;
  /** Button mode — switch in place (e.g. record facets). */
  onClick?: () => void;
  active?: boolean;
}

/**
 * TopGroupingNav — the platform's horizontal grouping primitive ("One rail, then
 * rise"). A width-preserving segmented tab strip used for in-module section
 * grouping and for record facets. Supports link mode (href, for routed groups)
 * and button mode (onClick, for in-place tabs). Inline items scroll horizontally;
 * when more than `maxInline` are supplied the remainder fold into an overflow
 * menu (the 8–12 rule). Presentation-only — adds no business logic.
 */
export function TopGroupingNav({
  items,
  ariaLabel,
  size = 'md',
  maxInline = 12,
}: {
  items: TopGroupingItem[];
  ariaLabel?: string;
  size?: 'sm' | 'md';
  maxInline?: number;
}) {
  const [menu, setMenu] = useState(false);
  if (items.length === 0) return null;

  const inline = items.slice(0, maxInline);
  const extra = items.slice(maxInline);
  const pad = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3 py-2 text-sm';

  const cls = (active?: boolean) =>
    `-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 ${pad} ${
      active
        ? 'border-primary font-medium text-foreground'
        : 'border-transparent text-muted-foreground hover:text-foreground'
    }`;

  return (
    <nav aria-label={ariaLabel} className="flex items-stretch gap-1 overflow-x-auto border-b">
      {inline.map((it) =>
        it.href ? (
          <Link key={it.key} href={it.href} className={cls(it.active)}>
            {it.icon}
            {it.label}
          </Link>
        ) : (
          <button key={it.key} type="button" onClick={it.onClick} className={cls(it.active)}>
            {it.icon}
            {it.label}
          </button>
        ),
      )}
      {extra.length > 0 && (
        <div className="relative flex items-stretch">
          <button
            type="button"
            aria-label="more"
            onClick={() => setMenu((m) => !m)}
            className={cls(extra.some((e) => e.active))}
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute end-0 top-full z-50 mt-1 min-w-[12rem] overflow-hidden rounded-md border bg-background p-1 shadow-md">
                {extra.map((it) => {
                  const inner = (
                    <>
                      {it.icon}
                      <span className="truncate">{it.label}</span>
                    </>
                  );
                  const c = `flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm ${
                    it.active ? 'bg-secondary font-medium' : 'hover:bg-secondary/60'
                  }`;
                  return it.href ? (
                    <Link key={it.key} href={it.href} onClick={() => setMenu(false)} className={c}>
                      {inner}
                    </Link>
                  ) : (
                    <button key={it.key} type="button" onClick={() => { setMenu(false); it.onClick?.(); }} className={c}>
                      {inner}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
