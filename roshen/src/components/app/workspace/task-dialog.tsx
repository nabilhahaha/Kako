"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type Opt = { value: string; label: string };
type Labels = Record<string, string>;

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function TaskDialog({
  action,
  labels,
  assignees,
  roles,
  priorities,
  statuses,
  visibilities,
  cities,
  distributors,
  initial,
  mode = "create",
}: {
  action: (fd: FormData) => Promise<void>;
  labels: Labels;
  assignees: Opt[];
  roles: Opt[];
  priorities: Opt[];
  statuses: Opt[];
  visibilities: Opt[];
  cities: Opt[];
  distributors: Opt[];
  initial?: Record<string, string | null>;
  mode?: "create" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [visibility, setVisibility] = useState((initial?.visibility as string) || "creator_assignee");
  const v = (k: string) => (initial?.[k] as string) ?? "";

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {labels.new_task}</Button>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label={labels.edit}>
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">{mode === "create" ? labels.create : labels.edit}</h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <form action={async (fd) => { await action(fd); setOpen(false); }} className="max-h-[72vh] space-y-3 overflow-y-auto p-5">
              {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.title}<span className="text-roshen-red"> *</span></label>
                <input name="title" required defaultValue={v("title")} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.description}</label>
                <textarea name="description" rows={3} defaultValue={v("description")} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Sel name="priority" label={labels.priority} opts={priorities} def={v("priority") || "normal"} />
                <Sel name="status" label={labels.status} opts={statuses} def={v("status") || "not_started"} />
                <Sel name="assigned_to" label={labels.assignee} opts={assignees} def={v("assigned_to")} empty={labels.unassigned} />
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.due_date}</label>
                  <input type="date" name="due_date" defaultValue={v("due_date")} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.start_date}</label>
                  <input type="date" name="start_date" defaultValue={v("start_date")} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.visibility}</label>
                  <select name="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)} className={inputCls}>
                    {visibilities.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {visibility === "selected_role" && (
                  <Sel name="visible_role" label={labels.visible_role} opts={roles} def={v("visible_role")} empty="—" />
                )}
              </div>
              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-muted">{labels.related}</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Sel name="related_city_id" label={labels.related_city} opts={cities} def={v("related_city_id")} empty="—" />
                  <Sel name="related_agent_id" label={labels.related_distributor} opts={distributors} def={v("related_agent_id")} empty="—" />
                </div>
              </details>
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>{labels.cancel}</Button>
                <Button type="submit" size="sm">{labels.save}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Sel({ name, label, opts, def, empty }: { name: string; label: string; opts: Opt[]; def?: string; empty?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      <select name={name} defaultValue={def ?? ""} className={inputCls}>
        {empty !== undefined ? <option value="">{empty}</option> : null}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
