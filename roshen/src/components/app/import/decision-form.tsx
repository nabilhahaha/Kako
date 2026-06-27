"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { commitImport, cancelBatch } from "@/lib/import/actions";
import { MODE_LABEL, MODE_DESC, ALL_MODES } from "@/lib/import/modes";
import type { ImportMode } from "@/lib/import/types";

export function DecisionForm({
  batchId,
  recommended,
  reason,
  blocked,
}: {
  batchId: string;
  recommended: ImportMode;
  reason: string;
  blocked: boolean;
}) {
  const [mode, setMode] = useState<ImportMode>(recommended);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function commit() {
    setError(null);
    startTransition(async () => {
      try {
        await commitImport(batchId, mode);
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        setError(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }
  function cancel() {
    startTransition(async () => {
      try {
        await cancelBatch(batchId);
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        setError(e instanceof Error ? e.message : "Cancel failed.");
      }
    });
  }

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
            <input type="radio" name="mode" checked={mode === m} onChange={() => setMode(m)} className="mt-1 text-burgundy" />
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

      {blocked && (
        <Card className="border-roshen-red/30 bg-roshen-red/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-roshen-red">
            <ShieldAlert className="h-4 w-4" /> This batch has blocking errors. Resolve them in Validation before importing.
          </p>
        </Card>
      )}
      {error && <p className="text-sm text-roshen-red">{error}</p>}

      <div className="flex justify-between gap-2">
        <Button variant="outline" onClick={cancel} disabled={pending}>Cancel batch</Button>
        <Button onClick={commit} disabled={pending || blocked}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Confirm &amp; import
        </Button>
      </div>
    </div>
  );
}
