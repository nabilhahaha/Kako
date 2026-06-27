"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

export type NotifItem = {
  id: string;
  title: string;
  message: string | null;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
};

export function NotificationBell({
  count,
  items,
  labels,
  markAllAction,
}: {
  count: number;
  items: NotifItem[];
  labels: { title: string; none: string; markAll: string };
  markAllAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-lg border border-line p-2 text-muted hover:bg-burgundy-soft hover:text-burgundy"
        aria-label={labels.title}
      >
        <Bell className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-roshen-red px-1 text-[10px] font-semibold text-cream">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute end-0 z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <span className="text-sm font-semibold text-ink">{labels.title}</span>
              {count > 0 && (
                <form action={markAllAction}>
                  <button className="text-xs font-medium text-burgundy hover:underline">{labels.markAll}</button>
                </form>
              )}
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted">{labels.none}</p>
              ) : (
                items.map((n) => {
                  const inner = (
                    <div className={"border-b border-line/60 px-4 py-3 last:border-0 " + (n.is_read ? "" : "bg-burgundy-soft/40")}>
                      <p className="text-sm font-medium text-ink">{n.title}</p>
                      {n.message && <p className="mt-0.5 text-xs text-muted">{n.message}</p>}
                      <p className="mt-1 text-[11px] text-muted">{new Date(n.created_at).toLocaleString()}</p>
                    </div>
                  );
                  return n.action_url ? (
                    <Link key={n.id} href={n.action_url} onClick={() => setOpen(false)} className="block hover:bg-cream/50">
                      {inner}
                    </Link>
                  ) : (
                    <div key={n.id}>{inner}</div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
