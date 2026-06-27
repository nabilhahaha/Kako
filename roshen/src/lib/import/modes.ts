// Import-mode recommendation + impact (docs/IMPORT-MODES.md). Pure functions.
import type { ImportMode } from "@/lib/import/types";

export const MODE_LABEL: Record<ImportMode, string> = {
  incremental_append: "Incremental Append",
  full_period_replace: "Full Period Replacement / Supersede",
  replace_overlapping: "Replace Overlapping Period",
  correction_reprocess: "Correction / Reprocess",
};

export const MODE_DESC: Record<ImportMode, string> = {
  incremental_append: "Add only new rows that aren't already imported (dedupe by invoice + date + customer + item).",
  full_period_replace: "Replace the active import for this distributor + period; the old batch is superseded.",
  replace_overlapping: "Replace only the overlapping date range; rows outside it are added.",
  correction_reprocess: "Re-process prior data under a new mapping/policy; affected batch is superseded.",
};

export type ExistingCoverage = {
  batch_id: string;
  period_start: string | null;
  period_end: string | null;
  period_month: string;
  row_count: number;
  status: string;
};

export type DecisionInput = {
  newStart: string | null;
  newEnd: string | null;
  newMonth: string | null;
  existing: ExistingCoverage[]; // active (imported) batches for this distributor
};

export type Recommendation = {
  mode: ImportMode;
  reason: string;
  overlaps: ExistingCoverage[];
  hasOverlap: boolean;
  fullMonthCovered: boolean;
};

function rangesOverlap(aS: string, aE: string, bS: string, bE: string): boolean {
  return aS <= bE && bS <= aE;
}

/** System recommendation; the user always confirms the final mode. */
export function recommendMode(input: DecisionInput): Recommendation {
  const { newStart, newEnd, newMonth, existing } = input;
  const imported = existing.filter((e) => e.status === "imported");

  if (imported.length === 0) {
    return {
      mode: "full_period_replace",
      reason: "No existing imported data for this distributor — first import for this period.",
      overlaps: [],
      hasOverlap: false,
      fullMonthCovered: false,
    };
  }

  const overlaps =
    newStart && newEnd
      ? imported.filter(
          (e) => e.period_start && e.period_end && rangesOverlap(newStart, newEnd, e.period_start, e.period_end),
        )
      : imported.filter((e) => e.period_month === newMonth);

  const hasOverlap = overlaps.length > 0;

  // Does the new file cover (most of) a whole month that already exists?
  const sameMonth = imported.filter((e) => e.period_month === newMonth);
  const fullMonthCovered = sameMonth.length > 0;

  if (!hasOverlap) {
    return {
      mode: "incremental_append",
      reason: "New date range does not overlap existing imports — append only new rows.",
      overlaps,
      hasOverlap,
      fullMonthCovered,
    };
  }

  if (fullMonthCovered && newMonth && newStart && newEnd && newStart.slice(0, 7) === newEnd.slice(0, 7)) {
    return {
      mode: "full_period_replace",
      reason: "File covers a full month that is already imported — replace/supersede the active batch.",
      overlaps,
      hasOverlap,
      fullMonthCovered,
    };
  }

  return {
    mode: "replace_overlapping",
    reason: "File partially overlaps existing imports and adds new dates — replace only the overlapping range.",
    overlaps,
    hasOverlap,
    fullMonthCovered,
  };
}

export const ALL_MODES: ImportMode[] = [
  "incremental_append",
  "full_period_replace",
  "replace_overlapping",
  "correction_reprocess",
];
