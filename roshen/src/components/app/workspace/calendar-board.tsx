"use client";

import Link from "next/link";
import { useState } from "react";
import { Plus } from "lucide-react";
import { STATUS_STYLE } from "@/lib/task-meta";
import { TaskDialog, type Opt } from "@/components/app/workspace/task-dialog";

export type CalTask = { id: string; title: string; due_date: string; status: string; priority?: string; assignees?: number };

const PRIORITY_DOT: Record<string, string> = {
  low: "bg-slate-300", normal: "bg-sky-400", high: "bg-amber-500", urgent: "bg-roshen-red",
};

type DialogProps = {
  createAction: (fd: FormData) => Promise<string>;
  labels: Record<string, string>;
  assignees: Opt[]; roles: Opt[]; priorities: Opt[]; statuses: Opt[]; visibilities: Opt[];
  cities: Opt[]; distributors: Opt[];
};

export function CalendarBoard({
  tasks, today, month, basePath, weekdays, moreLabel, dialogProps,
}: {
  tasks: CalTask[];
  today: string;
  month?: string;
  basePath: string;
  weekdays: string[];
  moreLabel: string;
  dialogProps: DialogProps;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const base = /^\d{4}-\d{2}$/.test(month ?? "") ? `${month}-01` : `${today.slice(0, 7)}-01`;
  const [yy, mm] = base.split("-").map(Number);
  const startDow = new Date(Date.UTC(yy, mm - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const monthStr = base.slice(0, 7);

  const byDay = new Map<string, CalTask[]>();
  for (const r of tasks) {
    if (!r.due_date?.startsWith(monthStr)) continue;
    const a = byDay.get(r.due_date);
    if (a) a.push(r); else byDay.set(r.due_date, [r]);
  }
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;

  function openCreate(dateStr: string) { setSelected(dateStr); setOpen(true); }

  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <Link href={`${basePath}?month=${prev}`} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">←</Link>
        <span className="font-serif text-base font-semibold text-ink">{monthStr}</span>
        <Link href={`${basePath}?month=${next}`} className="rounded-lg border border-line px-2.5 py-1 text-sm text-muted hover:text-burgundy">→</Link>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {weekdays.map((d, i) => (
          <div key={i} className="px-1 py-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted">{d}</div>
        ))}
        {cells.map((d, i) => {
          const key = d ? `${monthStr}-${String(d).padStart(2, "0")}` : null;
          const dayTasks = key ? byDay.get(key) ?? [] : [];
          const isToday = key === today;
          const isSelected = key === selected;
          return (
            <div
              key={i}
              className={
                "group relative min-h-20 rounded-lg border p-1 " +
                (d ? "border-line/60 bg-white" : "border-transparent bg-cream/30") +
                (isToday ? " ring-2 ring-burgundy/40" : "") +
                (isSelected ? " border-burgundy" : "")
              }
            >
              {d && (
                <div className="mb-1 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => openCreate(key!)}
                    className={"rounded px-1 text-[11px] font-medium " + (isToday ? "text-burgundy" : "text-muted hover:text-burgundy")}
                    title={moreLabel}
                  >
                    {d}
                  </button>
                  <button
                    type="button"
                    onClick={() => openCreate(key!)}
                    className="rounded p-0.5 text-muted opacity-0 transition group-hover:opacity-100 hover:text-burgundy"
                    aria-label="add"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="space-y-1">
                {dayTasks.slice(0, 3).map((r) => (
                  <Link key={r.id} href={`/workspace/${r.id}`} title={r.title}
                    className={"flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium " + (STATUS_STYLE[r.status] ?? "bg-cream-deep text-muted")}>
                    <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (PRIORITY_DOT[r.priority ?? "normal"] ?? "bg-slate-300")} />
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.assignees ? <span className="shrink-0 opacity-70">{r.assignees}</span> : null}
                  </Link>
                ))}
                {dayTasks.length > 3 && <div className="px-1 text-[10px] text-muted">+{dayTasks.length - 3} {moreLabel}</div>}
              </div>
            </div>
          );
        })}
      </div>

      <TaskDialog
        {...dialogProps}
        hideTrigger
        open={open}
        onOpenChange={setOpen}
        initial={{ due_date: selected ?? "" }}
      />
    </div>
  );
}
