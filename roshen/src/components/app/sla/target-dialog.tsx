"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Opt = { value: string; label: string };
const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function TargetDialog({
  distributors,
  regions,
  channels,
  action,
  initial,
  mode = "create",
  addLabel = "Add Sales Target",
}: {
  distributors: Opt[];
  regions: Opt[];
  channels: Opt[];
  action: (fd: FormData) => Promise<void>;
  initial?: Record<string, string | null>;
  mode?: "create" | "edit";
  addLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<string>((initial?.level as string) || "agent");
  const entityOpts = level === "region" ? regions : distributors;

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {addLabel}</Button>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label="Edit">
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">{mode === "create" ? "Add Sales Target" : "Edit Target"}</h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <form action={async (fd) => { await action(fd); setOpen(false); }} className="space-y-4 p-5">
              {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Month<span className="text-roshen-red"> *</span></label>
                  <input type="month" name="period_month" required defaultValue={(initial?.period_month as string)?.slice(0, 7) ?? ""} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Level<span className="text-roshen-red"> *</span></label>
                  <select name="level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
                    <option value="agent">Distributor</option>
                    <option value="region">Region</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{level === "region" ? "Region" : "Distributor"}<span className="text-roshen-red"> *</span></label>
                <select name="entity_id" required defaultValue={(initial?.entity_id as string) ?? ""} className={inputCls}>
                  <option value="">Select…</option>
                  {entityOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Channel</label>
                  <select name="channel_id" defaultValue={(initial?.channel_id as string) ?? ""} className={inputCls}>
                    <option value="">All channels</option>
                    {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">Working days</label>
                  <input type="number" name="working_days" defaultValue={(initial?.working_days as string) ?? ""} className={inputCls} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">Target amount (SAR)<span className="text-roshen-red"> *</span></label>
                <input type="number" step="0.01" name="target_amount" required defaultValue={(initial?.target_amount as string) ?? ""} className={inputCls} />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" size="sm">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
