"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";

const BUCKET = "file-library";
type Opt = { value: string; label: string };
const inputCls =
  "w-full rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

export function FileUploadDialog({
  createAction,
  finalize,
  labels,
  categories,
  visibilities,
  roles,
  users,
}: {
  createAction: (fd: FormData) => Promise<string>;
  finalize: (fd: FormData) => Promise<void>;
  labels: Record<string, string>;
  categories: Opt[];
  visibilities: Opt[];
  roles: Opt[];
  users: Opt[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [vis, setVis] = useState("private");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function submit(fd: FormData) {
    setErr(null);
    const file = fileRef.current?.files?.[0];
    if (!file) { setErr(labels.file_required); return; }
    setBusy(true);
    try {
      const id = await createAction(fd);
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
      if (error) throw error;
      const ff = new FormData();
      ff.set("id", id);
      ff.set("storage_path", path);
      ff.set("filename", file.name);
      ff.set("mime_type", file.type);
      ff.set("size_bytes", String(file.size));
      await finalize(ff);
      setOpen(false);
      setVis("private");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> {labels.upload}</Button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40" onClick={() => !busy && setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <h3 className="font-serif text-lg font-semibold text-ink">{labels.upload}</h3>
              <button onClick={() => !busy && setOpen(false)} className="text-muted hover:text-ink"><X className="h-4 w-4" /></button>
            </div>
            <form action={submit} className="max-h-[72vh] space-y-3 overflow-y-auto p-5">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.name}<span className="text-roshen-red"> *</span></label>
                <input name="name" required className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.description}</label>
                <textarea name="description" rows={2} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.category}</label>
                  <select name="category" className={inputCls}>
                    <option value="">—</option>
                    {categories.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.visibility}</label>
                  <select name="visibility" value={vis} onChange={(e) => setVis(e.target.value)} className={inputCls}>
                    {visibilities.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
              {vis === "selected_role" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.role}</label>
                  <select name="visible_role" className={inputCls}>
                    {roles.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {vis === "selected_users" && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-ink">{labels.users}</label>
                  <div className="max-h-32 space-y-0.5 overflow-y-auto rounded-xl border border-line p-2">
                    {users.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-ink hover:bg-cream/60">
                        <input type="checkbox" name="share_users" value={o.value} className="h-4 w-4 rounded border-line text-burgundy" />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.tags}</label>
                <input name="tags" className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink">{labels.file}<span className="text-roshen-red"> *</span></label>
                <input ref={fileRef} type="file" className="block w-full text-sm text-muted file:me-3 file:rounded-lg file:border-0 file:bg-burgundy-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-burgundy" />
              </div>
              {err && <p className="text-xs text-roshen-red">{err}</p>}
              <div className="flex justify-end gap-2 pt-1">
                <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>{labels.cancel}</Button>
                <Button type="submit" size="sm" disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{labels.upload}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
