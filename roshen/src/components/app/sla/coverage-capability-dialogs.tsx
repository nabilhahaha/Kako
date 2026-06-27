"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Opt = { value: string; label: string };
const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

function LevelEntity({
  distributors, regions, cities, level, setLevel, initialEntity,
}: {
  distributors: Opt[]; regions: Opt[]; cities: Opt[];
  level: string; setLevel: (v: string) => void; initialEntity?: string;
}) {
  const opts = level === "region" ? regions : level === "city" ? cities : distributors;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">Level<span className="text-roshen-red"> *</span></label>
        <select name="level" value={level} onChange={(e) => setLevel(e.target.value)} className={inputCls}>
          <option value="agent">Distributor</option>
          <option value="city">City</option>
          <option value="region">Region</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-ink">{level === "region" ? "Region" : level === "city" ? "City" : "Distributor"}<span className="text-roshen-red"> *</span></label>
        <select name="entity_id" required defaultValue={initialEntity ?? ""} className={inputCls}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function Shell({ title, mode, children, action, onClose }: { title: string; mode: "create" | "edit"; children: React.ReactNode; action: (fd: FormData) => Promise<void>; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="font-serif text-lg font-semibold text-ink">{mode === "create" ? title : `Edit ${title.replace(/^Add /, "")}`}</h3>
          <button onClick={onClose} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <form action={async (fd) => { await action(fd); onClose(); }} className="max-h-[70vh] space-y-3 overflow-y-auto p-5">{children}</form>
      </div>
    </div>
  );
}

function Num({ label, name, val, step }: { label: string; name: string; val?: string | null; step?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-ink">{label}</label>
      <input type="number" step={step} name={name} defaultValue={val ?? ""} className={inputCls} />
    </div>
  );
}
function Check({ label, name, val }: { label: string; name: string; val?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" name={name} defaultChecked={Boolean(val)} className="h-4 w-4 rounded border-line text-burgundy" /> {label}
    </label>
  );
}
function Trigger({ mode, label, onClick }: { mode: "create" | "edit"; label: string; onClick: () => void }) {
  return mode === "create" ? (
    <Button size="sm" onClick={onClick}><Plus className="h-4 w-4" /> {label}</Button>
  ) : (
    <button onClick={onClick} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
  );
}

export function CoverageDialog({
  distributors, regions, cities, channels, action, initial, mode = "create",
}: {
  distributors: Opt[]; regions: Opt[]; cities: Opt[]; channels: Opt[];
  action: (fd: FormData) => Promise<void>; initial?: Record<string, string | null>; mode?: "create" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState((initial?.level as string) || "agent");
  return (
    <>
      <Trigger mode={mode} label="Add Coverage Target" onClick={() => setOpen(true)} />
      {open && (
        <Shell title="Add Coverage Target" mode={mode} action={action} onClose={() => setOpen(false)}>
          {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Month<span className="text-roshen-red"> *</span></label>
              <input type="month" name="period_month" required defaultValue={(initial?.period_month as string)?.slice(0, 7) ?? ""} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-ink">Channel</label>
              <select name="channel_id" defaultValue={(initial?.channel_id as string) ?? ""} className={inputCls}>
                <option value="">All channels</option>
                {channels.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <LevelEntity distributors={distributors} regions={regions} cities={cities} level={level} setLevel={setLevel} initialEntity={initial?.entity_id as string} />
          <div className="grid grid-cols-2 gap-3">
            <Num label="Required customer universe" name="required_customer_universe" val={initial?.required_customer_universe as string} />
            <Num label="Required active customers" name="required_active_customers" val={initial?.required_active_customers as string} />
            <Num label="Required coverage %" name="required_coverage_pct" step="0.1" val={initial?.required_coverage_pct as string} />
            <Num label="Required productive %" name="required_productive_pct" step="0.1" val={initial?.required_productive_pct as string} />
            <Num label="Required visits (optional)" name="required_visits" val={initial?.required_visits as string} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Save</Button>
          </div>
        </Shell>
      )}
    </>
  );
}

export function CapabilityDialog({
  distributors, regions, cities, action, initial, mode = "create",
}: {
  distributors: Opt[]; regions: Opt[]; cities: Opt[];
  action: (fd: FormData) => Promise<void>; initial?: Record<string, string | boolean | null>; mode?: "create" | "edit";
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState((initial?.level as string) || "agent");
  return (
    <>
      <Trigger mode={mode} label="Add Capability" onClick={() => setOpen(true)} />
      {open && (
        <Shell title="Add Capability" mode={mode} action={action} onClose={() => setOpen(false)}>
          {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Month<span className="text-roshen-red"> *</span></label>
            <input type="month" name="period_month" required defaultValue={(initial?.period_month as string)?.slice(0, 7) ?? ""} className={`${inputCls} max-w-[12rem]`} />
          </div>
          <LevelEntity distributors={distributors} regions={regions} cities={cities} level={level} setLevel={setLevel} initialEntity={initial?.entity_id as string} />
          <div className="grid grid-cols-2 gap-3">
            <Num label="Required salesmen" name="required_salesmen" val={initial?.required_salesmen as string} />
            <Num label="Actual salesmen" name="actual_salesmen" val={initial?.actual_salesmen as string} />
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3">
            <Check label="Warehouse required" name="warehouse_required" val={initial?.warehouse_required as boolean} />
            <Check label="Warehouse available" name="warehouse_available" val={initial?.warehouse_available as boolean} />
            <Check label="Cash Van required" name="cashvan_required" val={initial?.cashvan_required as boolean} />
            <Check label="Cash Van available" name="cashvan_available" val={initial?.cashvan_available as boolean} />
            <Check label="Supervisor required" name="supervisor_required" val={initial?.supervisor_required as boolean} />
            <Check label="Supervisor available" name="supervisor_available" val={initial?.supervisor_available as boolean} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-ink">Notes</label>
            <input name="notes" defaultValue={(initial?.notes as string) ?? ""} className={inputCls} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" size="sm">Save</Button>
          </div>
        </Shell>
      )}
    </>
  );
}
