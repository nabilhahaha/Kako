"use client";

import { useState } from "react";
import { Plus, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type DialogField =
  | { name: string; label: string; type: "text"; required?: boolean; placeholder?: string }
  | { name: string; label: string; type: "checkbox"; required?: false }
  | {
      name: string;
      label: string;
      type: "select";
      required?: boolean;
      options: { value: string; label: string }[];
      allowEmpty?: boolean;
    };

export function EntityDialog({
  title,
  fields,
  action,
  initial,
  mode = "create",
}: {
  title: string;
  fields: DialogField[];
  action: (fd: FormData) => Promise<void>;
  initial?: Record<string, string | boolean | null>;
  mode?: "create" | "edit";
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> {title}
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
                {mode === "create" ? title : `Edit ${title.replace(/^Add /, "")}`}
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
              {initial?.id ? (
                <input type="hidden" name="id" value={String(initial.id)} />
              ) : null}

              {fields.map((f) => {
                const val = initial?.[f.name];
                if (f.type === "checkbox") {
                  return (
                    <label key={f.name} className="flex items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        name={f.name}
                        defaultChecked={val === undefined ? true : Boolean(val)}
                        className="h-4 w-4 rounded border-line text-burgundy"
                      />
                      {f.label}
                    </label>
                  );
                }
                return (
                  <div key={f.name} className="space-y-1.5">
                    <label htmlFor={f.name} className="text-sm font-medium text-ink">
                      {f.label}
                      {f.required ? <span className="text-roshen-red"> *</span> : null}
                    </label>
                    {f.type === "select" ? (
                      <select
                        id={f.name}
                        name={f.name}
                        required={f.required}
                        defaultValue={(val as string) ?? ""}
                        className={cn(
                          "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none",
                          "focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15",
                        )}
                      >
                        {f.allowEmpty || !f.required ? <option value="">—</option> : null}
                        {f.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        id={f.name}
                        name={f.name}
                        required={f.required}
                        placeholder={f.placeholder}
                        defaultValue={(val as string) ?? ""}
                        className="w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-muted/60 focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
                      />
                    )}
                  </div>
                );
              })}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" size="sm">
                  Save
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
