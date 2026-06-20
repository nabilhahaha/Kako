'use client';

import { useState, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface EntityAction {
  key: string;
  label: string;
  icon?: ReactNode;
  run: () => void;
  /** Permission-aware: omit the action entirely when false-y is passed as true. */
  hidden?: boolean;
  disabled?: boolean;
  destructive?: boolean;
  /** Show inline (default) vs. only in the overflow menu. */
  overflow?: boolean;
}

/**
 * EntityActionBar — one consistent, contextual, permission-aware action area for
 * every admin entity. Primary actions render inline; the rest collapse into an
 * overflow menu. Callers pass `hidden` based on existing permissions and wire
 * `run` to EXISTING actions — this component adds no business logic of its own.
 */
export function EntityActionBar({ actions }: { actions: EntityAction[] }) {
  const [menu, setMenu] = useState(false);
  const visible = actions.filter((a) => !a.hidden);
  const inline = visible.filter((a) => !a.overflow);
  const extra = visible.filter((a) => a.overflow);
  if (visible.length === 0) return null;

  return (
    <div className="flex shrink-0 items-center gap-2">
      {inline.map((a) => (
        <Button
          key={a.key}
          size="sm"
          variant={a.destructive ? 'outline' : 'outline'}
          disabled={a.disabled}
          onClick={a.run}
          className={a.destructive ? 'text-destructive hover:text-destructive' : undefined}
        >
          {a.icon}
          {a.label}
        </Button>
      ))}
      {extra.length > 0 && (
        <div className="relative">
          <Button size="sm" variant="outline" aria-label="more" onClick={() => setMenu((m) => !m)}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute end-0 z-50 mt-1 min-w-[10rem] overflow-hidden rounded-md border bg-background p-1 shadow-md">
                {extra.map((a) => (
                  <button
                    key={a.key}
                    disabled={a.disabled}
                    onClick={() => { setMenu(false); a.run(); }}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-start text-sm hover:bg-secondary disabled:opacity-50 ${a.destructive ? 'text-destructive' : ''}`}
                  >
                    {a.icon}
                    {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
