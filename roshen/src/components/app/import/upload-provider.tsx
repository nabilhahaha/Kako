"use client";

import { createContext, useContext, useRef, useState, useCallback, useEffect, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, CheckCircle2, AlertTriangle, Ban, UploadCloud, ArrowRight, GripVertical, Minus, ChevronDown, ChevronUp } from "lucide-react";
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

const MARGIN = 12;
const CARD_W = 256; // w-64
const PILL_W = 132;

function statusMeta(status: Status) {
  switch (status) {
    case "completed": return { icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />, label: "Upload complete", dot: "bg-emerald-500" };
    case "failed": return { icon: <AlertTriangle className="h-4 w-4 text-roshen-red" />, label: "Upload failed", dot: "bg-roshen-red" };
    case "cancelled": return { icon: <Ban className="h-4 w-4 text-muted" />, label: "Upload cancelled", dot: "bg-muted" };
    default: return { icon: <UploadCloud className="h-4 w-4 text-burgundy" />, label: "Uploading…", dot: "bg-burgundy" };
  }
}

function UploadIndicator() {
  const { job, cancel, retry, dismiss } = useUpload();
  const router = useRouter();

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, sx: 0, sy: 0, ox: 0, oy: 0, moved: false });

  // Restore persisted position / minimized state (client-only to avoid SSR
  // hydration mismatch — hence setState in an effect).
  useEffect(() => {
    let v: { x?: number; y?: number; min?: boolean } | null = null;
    try {
      const raw = localStorage.getItem("roshen.upload.widget");
      v = raw ? JSON.parse(raw) : null;
    } catch {
      v = null;
    }
    if (!v) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (typeof v.x === "number" && typeof v.y === "number") setPos({ x: v.x, y: v.y });
    if (typeof v.min === "boolean") setMinimized(v.min);
  }, []);

  const persist = useCallback((p: { x: number; y: number } | null, min: boolean) => {
    try { localStorage.setItem("roshen.upload.widget", JSON.stringify({ x: p?.x, y: p?.y, min })); } catch {}
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    const rect = cardRef.current?.getBoundingClientRect();
    if (!rect) return;
    drag.current = { active: true, sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top, moved: false };
    setPos({ x: rect.left, y: rect.top });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    const w = cardRef.current?.offsetWidth ?? CARD_W;
    const h = cardRef.current?.offsetHeight ?? 80;
    const x = Math.min(Math.max(d.ox + dx, MARGIN), window.innerWidth - w - MARGIN);
    const y = Math.min(Math.max(d.oy + dy, MARGIN), window.innerHeight - h - MARGIN);
    setPos({ x, y });
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const w = cardRef.current?.offsetWidth ?? CARD_W;
    const h = cardRef.current?.offsetHeight ?? 80;
    setPos((p) => {
      if (!p) return p;
      // Snap horizontally to the nearest edge; clamp vertically.
      const center = p.x + w / 2;
      const x = center < window.innerWidth / 2 ? MARGIN : window.innerWidth - w - MARGIN;
      const y = Math.min(Math.max(p.y, MARGIN), window.innerHeight - h - MARGIN);
      const snapped = { x, y };
      persist(snapped, minimized);
      return snapped;
    });
  };

  if (!job) return null;
  const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
  const active = job.status === "preparing" || job.status === "uploading";
  const meta = statusMeta(job.status);
  const style: React.CSSProperties = pos ? { left: pos.x, top: pos.y } : { right: MARGIN, bottom: MARGIN };

  // ---- Minimized pill ----
  if (minimized) {
    return (
      <div
        ref={cardRef}
        style={style}
        className="fixed z-50 select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => { onPointerUp(e); if (!drag.current.moved) { setMinimized(false); persist(pos, false); } }}
      >
        <button
          style={{ width: PILL_W }}
          className="flex cursor-grab items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink shadow-[0_6px_20px_-8px_rgba(42,34,32,0.3)] active:cursor-grabbing"
        >
          <span className={"h-2 w-2 rounded-full " + meta.dot + (active ? " animate-pulse" : "")} />
          {active ? <UploadCloud className="h-3.5 w-3.5 text-burgundy" /> : meta.icon}
          <span>{active ? `${pct}%` : job.status === "completed" ? "Done" : job.status === "failed" ? "Failed" : "Cancelled"}</span>
        </button>
      </div>
    );
  }

  // ---- Compact expanded card ----
  return (
    <div ref={cardRef} style={{ ...style, width: CARD_W }} className="fixed z-50 select-none rounded-xl border border-line bg-white shadow-[0_8px_30px_-8px_rgba(42,34,32,0.25)]">
      {/* drag handle / header */}
      <div
        className="flex cursor-grab items-center gap-1.5 rounded-t-xl border-b border-line px-3 py-1.5 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <GripVertical className="h-3.5 w-3.5 text-muted" />
        {meta.icon}
        <span className="flex-1 truncate text-xs font-medium text-ink">{meta.label}</span>
        <button onClick={() => { setMinimized(true); persist(pos, true); }} className="text-muted hover:text-ink" aria-label="Minimize"><Minus className="h-3.5 w-3.5" /></button>
        {!active && <button onClick={dismiss} className="text-muted hover:text-ink" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>}
      </div>

      <div className="space-y-1.5 px-3 py-2">
        <p className="truncate text-xs font-medium text-ink" title={job.filename}>{job.filename}</p>

        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>{job.done.toLocaleString()} / {job.total.toLocaleString()}</span>
          <span className="font-medium">{active ? `${pct}%` : job.status}</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
          <div className={"h-full transition-all " + (job.status === "failed" ? "bg-roshen-red" : job.status === "completed" ? "bg-emerald-500" : "bg-burgundy")} style={{ width: `${job.status === "completed" ? 100 : pct}%` }} />
        </div>

        {/* primary action */}
        {job.status === "completed" && (
          <button
            onClick={() => { router.push(`/raw-data-upload/${job.batchId}/mapping`); dismiss(); }}
            className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-burgundy px-3 py-1.5 text-xs font-medium text-cream hover:bg-burgundy-hover"
          >
            Open Mapping <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
        {job.status === "failed" && (
          <button onClick={retry} className="mt-1 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-burgundy px-3 py-1.5 text-xs font-medium text-cream hover:bg-burgundy-hover">
            <Loader2 className="h-3.5 w-3.5" /> Retry from row {job.done.toLocaleString()}
          </button>
        )}
        {active && (
          <button onClick={cancel} className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-roshen-red hover:underline">
            <Ban className="h-3 w-3" /> Cancel
          </button>
        )}

        {/* collapsible secondary details */}
        <button onClick={() => setShowDetails((s) => !s)} className="flex w-full items-center justify-between pt-0.5 text-[11px] text-muted hover:text-ink">
          <span>Details</span>
          {showDetails ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        {showDetails && (
          <div className="space-y-0.5 text-[11px] text-muted">
            <p>Distributor: <span className="text-ink">{job.distributor}</span></p>
            <p className="capitalize">Stage: <span className="text-ink">{job.stage}</span></p>
            {active && <p>Upload continues in the background while you work.</p>}
            {job.status === "failed" && job.error && <p className="text-roshen-red">{job.error}</p>}
            {job.status === "cancelled" && <p>Uploaded rows kept for audit; excluded from reports.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
