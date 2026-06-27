"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, CheckCircle2, ShieldAlert, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { validateRange, prepareCommit, commitRange, finalizeCommit, cancelBatch } from "@/lib/import/actions";
import { MODE_LABEL, MODE_DESC, ALL_MODES } from "@/lib/import/modes";
import type { ImportMode, Issue } from "@/lib/import/types";

const VCHUNK = 3000; // rows validated per request
const CCHUNK = 1000; // rows committed (sales_fact) per request

type Phase = "idle" | "validating" | "blocked" | "committing";

export function DecisionForm({
  batchId,
  recommended,
  reason,
  blocked,
  rowCount,
}: {
  batchId: string;
  recommended: ImportMode;
  reason: string;
  blocked: boolean;
  rowCount: number;
}) {
  const [mode, setMode] = useState<ImportMode>(recommended);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: rowCount });
  const [counts, setCounts] = useState<{ errors: number; warnings: number }>({ errors: 0, warnings: 0 });
  const [blocking, setBlocking] = useState<Issue[]>([]);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const busy = phase === "validating" || phase === "committing";

  async function run() {
    setError(null);
    setBlocking([]);
    // ---- Phase 1: full validation, chunked ----
    setPhase("validating");
    setProgress({ done: 0, total: rowCount });
    let errors = 0;
    let warnings = 0;
    const blk: Issue[] = [];
    try {
      for (let off = 0; off < rowCount; off += VCHUNK) {
        const r = await validateRange(batchId, off, VCHUNK);
        errors += r.errorCount;
        warnings += r.warningCount;
        if (blk.length < 50) blk.push(...r.blocking.slice(0, 50 - blk.length));
        setCounts({ errors, warnings });
        setProgress({ done: Math.min(off + VCHUNK, rowCount), total: rowCount });
      }
    } catch (e) {
      setPhase("idle");
      return setError(`Validation failed: ${msg(e)}`);
    }

    if (errors > 0) {
      setBlocking(blk);
      setPhase("blocked");
      return;
    }

    // ---- Phase 2: commit, chunked ----
    setPhase("committing");
    setProgress({ done: 0, total: rowCount });
    let inserted = 0, excluded = 0, skipped = 0;
    try {
      await prepareCommit(batchId, mode);
      for (let off = 0; off < rowCount; off += CCHUNK) {
        const r = await commitRange(batchId, off, CCHUNK, mode);
        inserted += r.inserted; excluded += r.excluded; skipped += r.skipped;
        setProgress({ done: Math.min(off + CCHUNK, rowCount), total: rowCount });
      }
      await finalizeCommit(batchId, mode, { inserted, excluded, skipped });
      router.push(`/import-batches/${batchId}`);
    } catch (e) {
      setPhase("idle");
      setError(`Import failed: ${msg(e)}`);
    }
  }

  function cancel() {
    setPhase("committing");
    cancelBatch(batchId).catch((e) => {
      if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
      setPhase("idle");
      setError(msg(e));
    });
  }

  const pctDone = Math.round((progress.done / Math.max(progress.total, 1)) * 100);

  return (
    <div className="space-y-4">
      <Card className="border-burgundy/20 bg-burgundy-soft/40 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-burgundy">
          <CheckCircle2 className="h-4 w-4" /> Recommended: {MODE_LABEL[recommended]}
        </p>
        <p className="mt-1 text-sm text-ink/80">{reason}</p>
      </Card>

      <div className="space-y-2">
        {ALL_MODES.map((m) => (
          <label
            key={m}
            className={
              "flex cursor-pointer items-start gap-3 rounded-xl border p-3 " +
              (mode === m ? "border-burgundy bg-burgundy-soft/30" : "border-line bg-white hover:border-burgundy/40")
            }
          >
            <input type="radio" name="mode" checked={mode === m} disabled={busy} onChange={() => setMode(m)} className="mt-1 text-burgundy" />
            <span>
              <span className="flex items-center gap-2 text-sm font-medium text-ink">
                {MODE_LABEL[m]}
                {m === recommended && <span className="rounded-full bg-gold-soft/60 px-2 py-0.5 text-[10px] font-medium text-chocolate">recommended</span>}
              </span>
              <span className="text-xs text-muted">{MODE_DESC[m]}</span>
            </span>
          </label>
        ))}
      </div>

      {busy && (
        <Card className="p-4">
          <div className="mb-1 flex justify-between text-xs text-muted">
            <span>{phase === "validating" ? "Validating rows…" : "Importing rows (writing sales)…"}</span>
            <span>{progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({pctDone}%)</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-cream-deep">
            <div className="h-full bg-burgundy transition-all" style={{ width: `${pctDone}%` }} />
          </div>
          {phase === "validating" && (
            <p className="mt-2 text-xs text-muted">Errors: <span className="text-roshen-red">{counts.errors}</span> · Warnings: <span className="text-amber-600">{counts.warnings}</span></p>
          )}
        </Card>
      )}

      {phase === "blocked" && (
        <Card className="border-roshen-red/30 bg-roshen-red/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-roshen-red">
            <AlertCircle className="h-4 w-4" /> Import stopped — {counts.errors} blocking error{counts.errors === 1 ? "" : "s"} found across {rowCount.toLocaleString()} rows.
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {blocking.map((i, idx) => (
              <li key={idx} className="flex flex-wrap items-center gap-x-2 text-ink/85">
                <span className="rounded bg-cream-deep px-1.5 py-0.5 text-[11px] font-medium text-muted">{i.code}</span>
                {i.row_number != null && <span className="text-xs text-muted">row {i.row_number}</span>}
                {i.message}
              </li>
            ))}
            {counts.errors > blocking.length && <li className="text-xs text-muted">+{counts.errors - blocking.length} more…</li>}
          </ul>
          <p className="mt-2 text-xs text-muted">Fix the source file or mapping, re-upload, and try again.</p>
        </Card>
      )}

      {blocked && phase === "idle" && (
        <Card className="border-roshen-red/30 bg-roshen-red/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-roshen-red">
            <ShieldAlert className="h-4 w-4" /> Quick validation found mapping-level errors. Resolve them in Validation before importing.
          </p>
        </Card>
      )}
      {error && <p className="text-sm text-roshen-red">{error}</p>}

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={cancel} disabled={busy}>Cancel batch</Button>
        <Button onClick={run} disabled={busy || blocked || phase === "blocked"}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          {phase === "validating" ? "Validating…" : phase === "committing" ? "Importing…" : "Validate & import"}
        </Button>
      </div>
    </div>
  );
}

function msg(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/unexpected response|Failed to fetch|413|body|too large/i.test(raw)) {
    return "a server request was rejected (size/timeout). Please retry.";
  }
  return raw;
}
