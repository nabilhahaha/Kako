"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import { UploadCloud, FileSpreadsheet, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { suggestMapping } from "@/lib/import/mapping";
import { detectDateFormat, normalizeDate, detectPeriod } from "@/lib/import/parse";
import { type CreateDraftInput } from "@/lib/import/actions";
import { useUpload } from "@/components/app/import/upload-provider";

type Opt = { value: string; label: string };

type SheetData = { name: string; headers: string[]; rows: Record<string, unknown>[] };

export function Uploader({ distributors }: { distributors: Opt[] }) {
  const [agentId, setAgentId] = useState("");
  const [filename, setFilename] = useState("");
  const [sizeBytes, setSizeBytes] = useState(0);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [activeSheet, setActiveSheet] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { startUpload } = useUpload();

  const sheet = sheets.find((s) => s.name === activeSheet);

  async function onFile(file: File) {
    setError(null);
    setFilename(file.name);
    setSizeBytes(file.size);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { cellDates: false });
      const parsed: SheetData[] = wb.SheetNames.map((name) => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: true });
        const headers = rows.length ? Object.keys(rows[0]) : [];
        return { name, headers, rows };
      }).filter((s) => s.headers.length > 0);
      if (!parsed.length) {
        setError("No readable sheets with headers were found in this file.");
        return;
      }
      setSheets(parsed);
      // Prefer a sheet literally named like "Row Data", else the largest.
      const preferred =
        parsed.find((s) => /row\s*data|raw|data/i.test(s.name)) ??
        parsed.slice().sort((a, b) => b.rows.length - a.rows.length)[0];
      setActiveSheet(preferred.name);
    } catch {
      setError("Could not parse the file. Please upload a valid .xlsx, .xls, or .csv.");
    }
  }

  // Period detection for the active sheet (auto-find the invoice_date column).
  let dateSource: string | null = null;
  let dateFormat = "auto";
  let period = { start: null as string | null, end: null as string | null, month: null as string | null };
  if (sheet) {
    const sugg = suggestMapping(sheet.headers).find((s) => s.key === "invoice_date" && s.source);
    dateSource = sugg?.source ?? null;
    if (dateSource) {
      const samples = sheet.rows.slice(0, 200).map((r) => r[dateSource!]);
      dateFormat = detectDateFormat(samples);
      const isos = sheet.rows.map((r) => normalizeDate(r[dateSource!], dateFormat).iso);
      period = detectPeriod(isos);
    }
  }

  async function submit() {
    if (!agentId) return setError("Select a distributor first.");
    if (!sheet) return setError("Upload a file and select a sheet.");
    setError(null);
    setBusy(true);
    const allRows = sheet.rows.map((raw, i) => ({
      row_number: i + 1,
      raw,
      raw_invoice_date: dateSource ? (raw[dateSource] == null ? null : String(raw[dateSource])) : null,
    }));
    const meta: CreateDraftInput = {
      agentId,
      filename,
      sizeBytes,
      sheet: sheet.name,
      detectedDateFormat: dateFormat,
      period,
      rowCount: allRows.length,
      headers: sheet.headers,
      sampleRows: sheet.rows.slice(0, 50),
    };
    const distributorLabel = distributors.find((d) => d.value === agentId)?.label ?? "Distributor";
    // The draft (headers + sample) is created synchronously; rows then stream in
    // the BACKGROUND via the global UploadProvider, so we can open Mapping now.
    const batchId = await startUpload({ meta, rows: allRows, distributorLabel });
    if (!batchId) {
      setBusy(false);
      return setError("Could not create the import batch — see the upload status for details.");
    }
    router.push(`/raw-data-upload/${batchId}/mapping`);
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <label className="text-sm font-medium text-ink">Distributor</label>
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="mt-1.5 w-full max-w-md rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15"
        >
          <option value="">Select distributor…</option>
          {distributors.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>

        <div
          className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line bg-cream/40 px-6 py-10 text-center hover:border-burgundy/40"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
        >
          <UploadCloud className="h-8 w-8 text-burgundy/70" />
          <p className="mt-2 text-sm font-medium text-ink">
            {filename || "Drop an Excel/CSV file here, or click to browse"}
          </p>
          <p className="mt-1 text-xs text-muted">.xlsx, .xls, .csv</p>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </div>
        {error && <p className="mt-3 text-sm text-roshen-red">{error}</p>}
      </Card>

      {sheets.length > 0 && sheet && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-burgundy" />
            <span className="text-sm font-medium text-ink">Sheets</span>
            {sheets.map((s) => (
              <button
                key={s.name}
                onClick={() => setActiveSheet(s.name)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium " +
                  (s.name === activeSheet ? "bg-burgundy text-cream" : "border border-line text-muted hover:text-burgundy")
                }
              >
                {s.name} ({s.rows.length})
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Rows" value={sheet.rows.length.toLocaleString()} />
            <Stat label="Columns" value={String(sheet.headers.length)} />
            <Stat label="Detected period" value={period.start && period.end ? `${period.start} → ${period.end}` : "—"} />
            <Stat label="Date format" value={dateSource ? dateFormat : "no date column"} />
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl border border-line">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-line bg-cream-deep/40 text-left text-muted">
                  {sheet.headers.slice(0, 8).map((h) => (
                    <th key={h} className="whitespace-nowrap px-3 py-2 font-semibold">{h}</th>
                  ))}
                  {sheet.headers.length > 8 && <th className="px-3 py-2 font-semibold">+{sheet.headers.length - 8} more</th>}
                </tr>
              </thead>
              <tbody>
                {sheet.rows.slice(0, 5).map((r, i) => (
                  <tr key={i} className="border-b border-line/60 last:border-0">
                    {sheet.headers.slice(0, 8).map((h) => (
                      <td key={h} className="whitespace-nowrap px-3 py-1.5 text-ink/80">{fmt(r[h])}</td>
                    ))}
                    {sheet.headers.length > 8 && <td className="px-3 py-1.5 text-muted">…</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex flex-col items-end gap-2">
            <p className="w-full text-xs text-muted">
              Rows upload in the background — you can map columns and keep working while they stream.
              Track progress in the upload status (bottom-right).
            </p>
            <Button onClick={submit} disabled={busy || !agentId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
              {busy ? "Starting…" : "Create draft & map columns"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
function fmt(v: unknown) {
  if (v == null || v === "") return "—";
  const s = String(v);
  return s.length > 22 ? s.slice(0, 22) + "…" : s;
}
