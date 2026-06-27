"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2, Archive, ArchiveRestore, Loader2 } from "lucide-react";

export function FileRowActions({
  id,
  path,
  archived,
  canManage,
  signedUrl,
  remove,
  archive,
  labels,
}: {
  id: string;
  path: string | null;
  archived: boolean;
  canManage: boolean;
  signedUrl: (p: string) => Promise<string | null>;
  remove: (fd: FormData) => Promise<void>;
  archive: (fd: FormData) => Promise<void>;
  labels: { download: string; archive: string; unarchive: string };
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    if (!path) return;
    setBusy(true);
    try {
      const url = await signedUrl(path);
      if (url) window.open(url, "_blank", "noopener");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button onClick={open} disabled={busy || !path} title={labels.download} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
      </button>
      {canManage && (
        <form action={async (fd) => { await archive(fd); router.refresh(); }}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="archived" value={archived ? "0" : "1"} />
          <button type="submit" title={archived ? labels.unarchive : labels.archive} className="rounded-lg p-1.5 text-muted hover:bg-burgundy-soft hover:text-burgundy">
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
        </form>
      )}
      {canManage && (
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
    </div>
  );
}
