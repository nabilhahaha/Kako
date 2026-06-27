"use client";

import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, CheckCircle2, AlertTriangle, Ban, UploadCloud, ArrowRight } from "lucide-react";
import {
  createDraftBatch,
  appendRawRows,
  updateUploadProgress,
  markUploadComplete,
  markUploadFailed,
  cancelUpload,
  type CreateDraftInput,
} from "@/lib/import/actions";
import type { RawRowPayload } from "@/lib/import/types";

const MAX_CHUNK_BYTES = 1_200_000;
const MAX_CHUNK_ROWS = 800;

type Status = "preparing" | "uploading" | "completed" | "failed" | "cancelled";
type Job = {
  batchId: string;
  filename: string;
  distributor: string;
  status: Status;
  stage: string;
  done: number;
  total: number;
  error?: string;
};

type StartArgs = { meta: CreateDraftInput; rows: RawRowPayload[]; distributorLabel: string };

type Ctx = {
  job: Job | null;
  startUpload: (args: StartArgs) => Promise<string | null>;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
};

const UploadCtx = createContext<Ctx | null>(null);
export const useUpload = () => {
  const c = useContext(UploadCtx);
  if (!c) throw new Error("useUpload must be used within UploadProvider");
  return c;
};

function msg(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/unexpected response|Failed to fetch|413|body|too large/i.test(raw)) return "a server request was rejected (size). Retry.";
  return raw;
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<Job | null>(null);
  const rowsRef = useRef<RawRowPayload[]>([]);
  const batchIdRef = useRef<string>("");
  const totalRef = useRef<number>(0);
  const lastIndexRef = useRef<number>(0);
  const cancelRef = useRef<boolean>(false);

  // Streams rows[fromIndex..] in byte-aware chunks; tracks progress + DB state.
  const streamFrom = useCallback(async (fromIndex: number) => {
    cancelRef.current = false;
    const rows = rowsRef.current;
    const batchId = batchIdRef.current;
    const total = totalRef.current;
    let i = fromIndex;
    let sinceSync = 0;
    try {
      while (i < rows.length) {
        if (cancelRef.current) {
          await cancelUpload(batchId);
          setJob((j) => (j ? { ...j, status: "cancelled", stage: "cancelled" } : j));
          return;
        }
        let j = i;
        let bytes = 0;
        while (j < rows.length && j - i < MAX_CHUNK_ROWS) {
          const sz = JSON.stringify(rows[j]).length + 1;
          if (j > i && bytes + sz > MAX_CHUNK_BYTES) break;
          bytes += sz;
          j++;
        }
        const chunk = rows.slice(i, j);
        try {
          await appendRawRows(batchId, chunk);
        } catch {
          await new Promise((r) => setTimeout(r, 600));
          await appendRawRows(batchId, chunk); // one retry; throws on second failure
        }
        i = j;
        lastIndexRef.current = i;
        setJob((jb) => (jb ? { ...jb, status: "uploading", stage: "uploading", done: i, total } : jb));
        if (++sinceSync >= 5) {
          sinceSync = 0;
          updateUploadProgress(batchId, { status: "uploading", stage: "uploading", uploaded: i, total, lastIndex: i }).catch(() => {});
        }
      }
      await markUploadComplete(batchId, total);
      setJob((jb) => (jb ? { ...jb, status: "completed", stage: "completed", done: total, total } : jb));
    } catch (e) {
      const m = msg(e);
      markUploadFailed(batchId, m, lastIndexRef.current).catch(() => {});
      setJob((jb) => (jb ? { ...jb, status: "failed", error: m } : jb));
    }
  }, []);

  const startUpload = useCallback(
    async ({ meta, rows, distributorLabel }: StartArgs): Promise<string | null> => {
      setJob({ batchId: "", filename: meta.filename, distributor: distributorLabel, status: "preparing", stage: "Creating draft…", done: 0, total: rows.length });
      try {
        const { batchId } = await createDraftBatch(meta);
        rowsRef.current = rows;
        batchIdRef.current = batchId;
        totalRef.current = rows.length;
        lastIndexRef.current = 0;
        setJob({ batchId, filename: meta.filename, distributor: distributorLabel, status: "uploading", stage: "uploading", done: 0, total: rows.length });
        void streamFrom(0); // background; not awaited
        return batchId;
      } catch (e) {
        setJob((j) => (j ? { ...j, status: "failed", error: msg(e) } : j));
        return null;
      }
    },
    [streamFrom],
  );

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setJob((j) => (j ? { ...j, stage: "cancelling…" } : j));
  }, []);
  const retry = useCallback(() => {
    if (!batchIdRef.current) return;
    setJob((j) => (j ? { ...j, status: "uploading", error: undefined } : j));
    void streamFrom(lastIndexRef.current);
  }, [streamFrom]);
  const dismiss = useCallback(() => setJob(null), []);

  return (
    <UploadCtx.Provider value={{ job, startUpload, cancel, retry, dismiss }}>
      {children}
      <UploadIndicator />
    </UploadCtx.Provider>
  );
}

function UploadIndicator() {
  const { job, cancel, retry, dismiss } = useUpload();
  const router = useRouter();
  if (!job) return null;

  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const active = job.status === "preparing" || job.status === "uploading";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-2xl border border-line bg-white shadow-[0_8px_30px_-8px_rgba(42,34,32,0.25)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="flex items-center gap-2 text-sm font-medium text-ink">
          {job.status === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            : job.status === "failed" ? <AlertTriangle className="h-4 w-4 text-roshen-red" />
            : job.status === "cancelled" ? <Ban className="h-4 w-4 text-muted" />
            : <UploadCloud className="h-4 w-4 text-burgundy" />}
          {job.status === "completed" ? "Upload complete" : job.status === "failed" ? "Upload failed" : job.status === "cancelled" ? "Upload cancelled" : "Uploading…"}
        </span>
        {!active && (
          <button onClick={dismiss} className="text-muted hover:text-ink" aria-label="Dismiss"><X className="h-4 w-4" /></button>
        )}
      </div>

      <div className="space-y-2 px-4 py-3">
        <p className="truncate text-sm font-medium text-ink">{job.filename}</p>
        <p className="text-xs text-muted">{job.distributor}</p>

        {active && (
          <>
            <div className="mt-1 flex justify-between text-xs text-muted">
              <span className="capitalize">{job.stage}</span>
              <span>{job.done.toLocaleString()} / {job.total.toLocaleString()} ({pct}%)</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-cream-deep">
              <div className="h-full bg-burgundy transition-all" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[11px] text-muted">You can keep working — upload continues in the background.</p>
            <button onClick={cancel} className="mt-1 inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-roshen-red hover:bg-roshen-red/5">
              <Ban className="h-3.5 w-3.5" /> Cancel upload
            </button>
          </>
        )}

        {job.status === "completed" && (
          <button
            onClick={() => { router.push(`/raw-data-upload/${job.batchId}/mapping`); dismiss(); }}
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover"
          >
            Open Mapping <ArrowRight className="h-4 w-4" />
          </button>
        )}

        {job.status === "failed" && (
          <>
            {job.error && <p className="text-xs text-roshen-red">{job.error} (from row {job.done.toLocaleString()})</p>}
            <button onClick={retry} className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-burgundy px-3 py-1.5 text-sm font-medium text-cream hover:bg-burgundy-hover">
              <Loader2 className="h-4 w-4" /> Retry from row {job.done.toLocaleString()}
            </button>
          </>
        )}

        {job.status === "cancelled" && <p className="text-xs text-muted">Cancelled by user. Already-uploaded rows are kept for audit and excluded from reports.</p>}
      </div>
    </div>
  );
}
