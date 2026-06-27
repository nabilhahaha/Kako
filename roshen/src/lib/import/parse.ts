// Pure parsing / normalization helpers — number parsing, date normalization
// (Excel serial + common masks), period detection. No I/O, no Supabase.

/** Parse a numeric cell, stripping currency symbols and thousands separators. */
export function num(v: unknown): number {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  if (v == null) return 0;
  const cleaned = String(v).replace(/[^0-9.\-]/g, "");
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : 0;
}

/** True if a cell looks numeric (for numeric-field validation). */
export function looksNumeric(v: unknown): boolean {
  if (typeof v === "number") return isFinite(v);
  if (v == null || String(v).trim() === "") return false;
  return /^-?\s*[\d,]*\.?\d+\s*$/.test(String(v).replace(/[^0-9.,\-\s]/g, ""));
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Excel serial date → YYYY-MM-DD (epoch 1899-12-30). */
export function excelSerialToISO(n: number): string | null {
  if (typeof n !== "number" || !isFinite(n) || n <= 0) return null;
  const ms = Math.round((n - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export type DateParse = { iso: string | null; confidence: number; error: string | null; format: string };

/**
 * Normalize a date cell to YYYY-MM-DD under an explicit (or auto) format.
 * Supported formats: excel_serial_date, yyyymmdd_int, YYYY-MM-DD, DD/MM/YYYY,
 * MM/DD/YYYY, DD-Mon-YYYY, auto.
 */
export function normalizeDate(value: unknown, format = "auto"): DateParse {
  const raw = value == null ? "" : String(value).trim();
  if (raw === "") return { iso: null, confidence: 0, error: "empty", format };

  const tryExcel = (): string | null =>
    typeof value === "number" || /^\d{5}(\.\d+)?$/.test(raw) ? excelSerialToISO(Number(value ?? raw)) : null;

  const tryYmdInt = (): string | null => {
    if (!/^\d{8}$/.test(raw)) return null;
    return iso(+raw.slice(0, 4), +raw.slice(4, 6), +raw.slice(6, 8));
  };
  const tryIso = (): string | null => {
    const m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    return m ? iso(+m[1], +m[2], +m[3]) : null;
  };
  const trySlashed = (dayFirst: boolean): string | null => {
    const m = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
    if (!m) return null;
    let y = +m[3];
    if (y < 100) y += 2000;
    const a = +m[1], b = +m[2];
    return dayFirst ? iso(y, b, a) : iso(y, a, b);
  };
  const tryMon = (): string | null => {
    const m = raw.toLowerCase().match(/^(\d{1,2})[-/ ]([a-z]{3})[a-z]*[-/ ](\d{2,4})$/);
    if (!m) return null;
    let y = +m[3];
    if (y < 100) y += 2000;
    return iso(y, MONTHS[m[2]] ?? 0, +m[1]);
  };

  let r: string | null = null;
  switch (format) {
    case "excel_serial_date": r = tryExcel(); break;
    case "yyyymmdd_int": r = tryYmdInt(); break;
    case "YYYY-MM-DD": r = tryIso(); break;
    case "DD/MM/YYYY": r = trySlashed(true); break;
    case "MM/DD/YYYY": r = trySlashed(false); break;
    case "DD-Mon-YYYY": r = tryMon(); break;
    default:
      // auto: try in order, lower confidence
      r = tryExcel() ?? tryIso() ?? tryYmdInt() ?? tryMon() ?? trySlashed(true);
      return r
        ? { iso: r, confidence: 75, error: null, format: "auto" }
        : { iso: null, confidence: 0, error: "unrecognized date", format: "auto" };
  }
  return r
    ? { iso: r, confidence: 100, error: null, format }
    : { iso: null, confidence: 0, error: `does not match ${format}`, format };
}

/** Guess the dominant date format from a sample of raw values. */
export function detectDateFormat(samples: unknown[]): string {
  const candidates = ["excel_serial_date", "YYYY-MM-DD", "yyyymmdd_int", "DD/MM/YYYY", "DD-Mon-YYYY"];
  let best = "auto";
  let bestHits = 0;
  for (const fmt of candidates) {
    let hits = 0;
    for (const s of samples) if (normalizeDate(s, fmt).iso) hits++;
    if (hits > bestHits) { bestHits = hits; best = fmt; }
  }
  return bestHits > 0 ? best : "auto";
}

/** First day of the month for an ISO date. */
export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7) + "-01";
}

/** Detect period bounds + dominant month from normalized ISO dates. */
export function detectPeriod(isoDates: (string | null)[]): {
  start: string | null;
  end: string | null;
  month: string | null;
} {
  const valid = isoDates.filter((d): d is string => !!d).sort();
  if (valid.length === 0) return { start: null, end: null, month: null };
  const start = valid[0];
  const end = valid[valid.length - 1];
  // dominant month = month with the most rows
  const counts: Record<string, number> = {};
  for (const d of valid) {
    const m = monthOf(d);
    counts[m] = (counts[m] ?? 0) + 1;
  }
  const month = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  return { start, end, month };
}
