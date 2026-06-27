"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Opt = { value: string; label: string };
type CityOpt = { value: string; label: string; region_id: string | null };

const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function DistributorDialog({
  regions,
  cities,
  channels,
  areaManagers,
  action,
  initial,
  mode = "create",
}: {
  regions: Opt[];
  cities: CityOpt[];
  channels: Opt[];
  areaManagers: Opt[];
  action: (fd: FormData) => Promise<void>;
  initial?: Record<string, string | boolean | null>;
  mode?: "create" | "edit";
}) {
  const [open, setOpen] = useState(false);

  const initialCityId = (initial?.city_id as string) ?? "";
  const initialRegion =
    cities.find((c) => c.value === initialCityId)?.region_id ?? "";
  const [region, setRegion] = useState<string>(initialRegion);
  const [cityId, setCityId] = useState<string>(initialCityId);

  const cityOptions = region
    ? cities.filter((c) => c.region_id === region)
    : cities;

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Distributor
        </Button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy"
          aria-label="Edit"
        >
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">
                {mode === "create" ? "Add Distributor" : "Edit Distributor"}
              </h3>
              <button onClick={() => setOpen(false)} className="text-muted hover:text-ink">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              action={async (fd) => {
                await action(fd);
                setOpen(false);
              }}
              className="space-y-4 p-5"
            >
              {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="name" className="text-sm font-medium text-ink">
                    Name<span className="text-roshen-red"> *</span>
                  </label>
                  <input id="name" name="name" required defaultValue={(initial?.name as string) ?? ""} className={inputCls} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="code" className="text-sm font-medium text-ink">
                    Code<span className="text-roshen-red"> *</span>
                  </label>
                  <input id="code" name="code" required defaultValue={(initial?.code as string) ?? ""} className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="region" className="text-sm font-medium text-ink">
                    Region
                  </label>
                  <select
                    id="region"
                    value={region}
                    onChange={(e) => {
                      setRegion(e.target.value);
                      setCityId(""); // reset city when region changes
                    }}
                    className={inputCls}
                  >
                    <option value="">All regions</option>
                    {regions.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="city_id" className="text-sm font-medium text-ink">
                    City<span className="text-roshen-red"> *</span>
                  </label>
                  <select
                    id="city_id"
                    name="city_id"
                    required
                    value={cityId}
                    onChange={(e) => setCityId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">Select city…</option>
                    {cityOptions.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label htmlFor="channel_id" className="text-sm font-medium text-ink">
                    Channel
                  </label>
                  <select id="channel_id" name="channel_id" defaultValue={(initial?.channel_id as string) ?? ""} className={inputCls}>
                    <option value="">—</option>
                    {channels.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="area_manager_id" className="text-sm font-medium text-ink">
                    Assigned Manager
                  </label>
                  <select id="area_manager_id" name="area_manager_id" defaultValue={(initial?.area_manager_id as string) ?? ""} className={inputCls}>
                    <option value="">Unassigned</option>
                    {areaManagers.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={initial?.is_active === undefined ? true : Boolean(initial.is_active)}
                  className="h-4 w-4 rounded border-line text-burgundy"
                />
                Active
              </label>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">Save</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
