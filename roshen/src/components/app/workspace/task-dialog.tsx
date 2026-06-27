"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, X, Paperclip, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { addAttachment } from "@/lib/tasks";

export type Opt = { value: string; label: string };
type Labels = Record<string, string>;

const BUCKET = "task-attachments";
const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function TaskDialog({
  action,
  createAction,
  labels,
  assignees,
  roles,
  priorities,
  statuses,
  visibilities,
  cities,
  distributors,
  initial,
  selectedAssignees = [],
  mode = "create",
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: {
  action?: (fd: FormData) => Promise<void>;
  createAction?: (fd: FormData) => Promise<string>;
  labels: Labels;
  assignees: Opt[];
  roles: Opt[];
  priorities: Opt[];
  statuses: Opt[];
  visibilities: Opt[];
  cities: Opt[];
  distributors: Opt[];
  initial?: Record<string, string | null>;
  selectedAssignees?: string[];
  mode?: "create" | "edit";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : openState;
  const setOpen = (o: boolean) => { onOpenChange?.(o); if (!isControlled) setOpenState(o); };
  const [visibility, setVisibility] = useState((initial?.visibility as string) || "creator_assignee");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const v = (k: string) => (initial?.[k] as string) ?? "";

  function close() {
    setOpen(false);
    setFiles([]);
    setWarn(null);
    setCreated(false);
  }

  async function onSubmit(fd: FormData) {
    setWarn(null);
    setBusy(true);
    try {
      if (mode === "create" && createAction) {
        const id = await createAction(fd);
        if (files.length && id) {
          const supabase = createClient();
          let failed = 0;
          for (const f of files) {
            try {
              const ext = f.name.includes(".") ? f.name.split(".").pop() : "bin";
              const path = `${id}/${crypto.randomUUID()}.${ext}`;
              const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
              if (error) { failed++; continue; }
              const af = new FormData();
              af.set("task_id", id);
              af.set("storage_path", path);
              af.set("filename", f.name);
              af.set("mime_type", f.type);
              af.set("size_bytes", String(f.size));
              await addAttachment(af);
            } catch {
              failed++;
            }
          }
          router.refresh();
          if (failed) { setWarn(labels.attach_failed); setCreated(true); setFiles([]); return; }
        }
        router.refresh();
        close();
      } else if (action) {
        await action(fd);
        router.refresh();
        close();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {hideTrigger ? null : mode === "create" ? (
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {labels.new_task}</Button>
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy" aria-label={labels.edit}>
          <Pencil className="h-4 w-4" />
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => !busy && close()} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">{mode === "create" ? labels.create : labels.edit}</h3>
              <button onClick={() => !busy && close()} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <form action={onSubmit} className="max-h-[72vh] space-y-3 overflow-y-auto p-5">
              {initial?.id ? <input type="hidden" name="id" value={String(initial.id)} /> : null}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.title}<span className="text-roshen-red"> *</span></label>
                <input name="title" required defaultValue={v("title")} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.description}</label>
                <textarea name="description" rows={3} defaultValue={v("description")} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.assignees}</label>
                <div className="max-h-36 space-y-0.5 overflow-y-auto rounded-xl border border-line p-2">
                  {assignees.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted">—</p>
                  ) : (
                    assignees.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink hover:bg-cream/60">
                        <input type="checkbox" name="assignees" value={o.value} defaultChecked={selectedAssignees.includes(o.value)} className="h-4 w-4 rounded border-line text-burgundy" />
                        {o.label}
                      </label>
                    ))
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Sel name="priority" label={labels.priority} opts={priorities} def={v("priority") || "normal"} />
                <Sel name="status" label={labels.status} opts={statuses} def={v("status") || "not_started"} />
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

              {/* Attachments (create mode — uploaded after the task is created) */}
              {mode === "create" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.attachments}</label>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif"
                    className="hidden"
                    onChange={(e) => { const fs = Array.from(e.target.files ?? []); if (fs.length) setFiles((p) => [...p, ...fs]); if (fileRef.current) fileRef.current.value = ""; }}
                  />
                  <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft">
                    <Paperclip className="h-4 w-4" /> {labels.upload}
                  </button>
                  {files.length > 0 && (
                    <div className="space-y-1">
                      {files.map((f, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-line bg-white px-2 py-1 text-xs">
                          <span className="truncate text-ink">{f.name}</span>
                          <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="text-muted hover:text-roshen-red"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <details className="rounded-xl border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium text-muted">{labels.related}</summary>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Sel name="related_city_id" label={labels.related_city} opts={cities} def={v("related_city_id")} empty="—" />
                  <Sel name="related_agent_id" label={labels.related_distributor} opts={distributors} def={v("related_agent_id")} empty="—" />
                </div>
              </details>

              {warn && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{warn}</p>}

              <div className="flex justify-end gap-2 pt-1">
                {created ? (
                  <Button type="button" size="sm" onClick={close}>{labels.cancel}</Button>
                ) : (
                  <>
                    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={close}>{labels.cancel}</Button>
                    <Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{labels.save}</Button>
                  </>
                )}
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
