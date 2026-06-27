"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Paperclip, Download, Trash2, FileText, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

type Labels = { upload: string; uploading: string; download: string; none: string };

/**
 * Direct-to-Storage uploader (browser client) reused by Tasks and Requests.
 * - `taskId` (legacy) uploads to the `task-attachments` bucket under `<taskId>/…`
 *   and sets the `task_id` form field.
 * - `bucket` + `pathPrefix` + `fields` generalize it for any entity (e.g. Requests
 *   receipts in `request-receipts` under `<requestId>/…`).
 */
export function AttachmentUploader({
  taskId,
  bucket,
  pathPrefix,
  fields,
  add,
  labels,
}: {
  taskId?: string;
  bucket?: string;
  pathPrefix?: string;
  fields?: Record<string, string>;
  add: (fd: FormData) => Promise<void>;
  labels: Labels;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const resolvedBucket = bucket ?? "task-attachments";
  const prefix = pathPrefix ?? taskId ?? "";

  async function onPick(file: File) {
    setErr(null);
    setBusy(true);
    try {
      const supabase = createClient();
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${prefix}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from(resolvedBucket).upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      const fd = new FormData();
      if (taskId) fd.set("task_id", taskId);
      if (fields) for (const [k, v] of Object.entries(fields)) fd.set(k, v);
      fd.set("storage_path", path);
      fd.set("filename", file.name);
      fd.set("mime_type", file.type);
      fd.set("size_bytes", String(file.size));
      await add(fd);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp,image/gif"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-1.5 text-sm font-medium text-burgundy hover:bg-burgundy-soft disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        {busy ? labels.uploading : labels.upload}
      </button>
      {err && <p className="mt-1 text-xs text-roshen-red">{err}</p>}
    </div>
  );
}

export function AttachmentRow({
  id,
  filename,
  path,
  canDelete,
  signedUrl,
  remove,
  labels,
}: {
  id: string;
  filename: string;
  path: string;
  canDelete: boolean;
  signedUrl: (p: string) => Promise<string | null>;
  remove: (fd: FormData) => Promise<void>;
  labels: { download: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const url = await signedUrl(path);
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white px-3 py-2">
      <span className="flex min-w-0 items-center gap-2">
        <FileText className="h-4 w-4 shrink-0 text-muted" />
        <span className="truncate text-sm text-ink">{filename}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button onClick={open} disabled={busy} title={labels.download} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
        </button>
        {canDelete && (
          <form
            action={async (fd) => { await remove(fd); router.refresh(); }}
            onSubmit={(e) => { if (!window.confirm("Delete this file?")) e.preventDefault(); }}
          >
            <input type="hidden" name="id" value={id} />
            <button type="submit" className="rounded-lg p-1.5 text-muted hover:bg-roshen-red/10 hover:text-roshen-red">
              <Trash2 className="h-4 w-4" />
            </button>
          </form>
        )}
      </span>
    </div>
  );
}
