"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, ChevronRight, CheckCircle2, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CANONICAL_FIELDS } from "@/lib/import/canonical-fields";
import {
  buildFieldMapping,
  coverageByTier,
  unsatisfiedRequirementGroups,
  unmappedHeaders,
} from "@/lib/import/mapping";
import { saveMapping } from "@/lib/import/actions";
import { DEFAULT_POLICY, type CalcPolicy } from "@/lib/import/types";

type Sugg = { key: string; source: string | null; confidence: number };
const TIERS = ["required", "recommended", "optional"] as const;
const TIER_STYLE: Record<string, string> = {
  required: "bg-roshen-red/10 text-roshen-red",
  recommended: "bg-gold-soft/50 text-chocolate",
  optional: "bg-cream-deep text-muted",
};

const sel = "w-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15";

const BASIS = ["excluding_vat_before_discount", "excluding_vat_after_discount", "gross_before_discount", "net_after_discount", "net_after_returns_excluding_vat"];
const VAT = ["value_excludes_vat", "value_includes_vat"];
const DISC = ["subtract_cash_discount", "discount_already_deducted", "ignore_discount_for_sla", "store_only"];
const RET = ["subtract_returns_value", "returns_already_deducted", "store_returns_only"];
const SLA = ["net_sales_excluding_vat", "sales_value_excluding_vat", "gross_sales_excluding_vat", "custom_formula_later"];
const DATE_FORMATS = ["auto", "excel_serial_date", "YYYY-MM-DD", "yyyymmdd_int", "DD/MM/YYYY", "MM/DD/YYYY", "DD-Mon-YYYY"];

export function MappingEditor({
  batchId,
  headers,
  suggestions,
  initialChosen,
  initialPolicy,
  initialDateFormat,
  sampleRows,
}: {
  batchId: string;
  headers: string[];
  suggestions: Sugg[];
  initialChosen: Record<string, string>;
  initialPolicy: CalcPolicy;
  initialDateFormat: string;
  sampleRows: Record<string, unknown>[];
}) {
  const confByKey = useMemo(
    () => Object.fromEntries(suggestions.map((s) => [s.key, s.confidence])),
    [suggestions],
  );
  const [chosen, setChosen] = useState<Record<string, string>>(initialChosen);
  const [dateFormat, setDateFormat] = useState(initialDateFormat || "auto");
  const [policy, setPolicy] = useState<CalcPolicy>(initialPolicy);
  const [showPolicy, setShowPolicy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const fm = useMemo(() => buildFieldMapping(chosen, dateFormat), [chosen, dateFormat]);
  const coverage = coverageByTier(fm);
  const unsatisfied = unsatisfiedRequirementGroups(fm);
  const unmapped = unmappedHeaders(headers, fm);
  const reqMapped = suggestions.filter((s) => s.source && CANONICAL_FIELDS.find((f) => f.key === s.key)?.tier === "required");
  const confidence =
    reqMapped.length === 0 ? 0 : Math.round(reqMapped.reduce((a, s) => a + (confByKey[s.key] ?? 0), 0) / reqMapped.length);

  function setField(key: string, source: string) {
    setChosen((c) => {
      const next = { ...c };
      if (source) next[key] = source;
      else delete next[key];
      return next;
    });
  }

  function save() {
    if (unsatisfied.length) {
      setError(`Map all required field groups: ${unsatisfied.map((u) => u.label).join(", ")}.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await saveMapping({ batchId, chosen, dateFormat, policy, headers });
      } catch (e) {
        if (e instanceof Error && e.message.includes("NEXT_REDIRECT")) return;
        setError(e instanceof Error ? e.message : "Failed to save mapping.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Mapping confidence" value={`${confidence}%`} good={confidence >= 85} />
        {coverage.map((c) => (
          <Metric
            key={c.tier}
            label={`${c.tier[0].toUpperCase()}${c.tier.slice(1)} mapped`}
            value={`${c.mapped.length}/${c.mapped.length + c.missing.length}`}
            good={c.tier !== "required" || c.missing.length === 0}
          />
        ))}
      </div>

      {unsatisfied.length > 0 ? (
        <Card className="border-roshen-red/30 bg-roshen-red/5 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-roshen-red">
            <AlertTriangle className="h-4 w-4" /> Required field groups not yet mapped
          </p>
          <p className="mt-1 text-sm text-ink/80">{unsatisfied.map((u) => u.label).join(" · ")}</p>
        </Card>
      ) : (
        <Card className="border-emerald-200 bg-emerald-50/60 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> All required field groups are mapped.
          </p>
        </Card>
      )}

      <div className="grid gap-2">
        <label className="text-sm font-medium text-ink">Invoice date format</label>
        <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} className={`${sel} max-w-xs`}>
          {DATE_FORMATS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {TIERS.map((tier) => (
        <Card key={tier} className="overflow-hidden">
          <div className="border-b border-line bg-cream-deep/30 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
            {tier} fields
          </div>
          <div className="divide-y divide-line/60">
            {CANONICAL_FIELDS.filter((f) => f.tier === tier).map((f) => {
              const conf = confByKey[f.key] ?? 0;
              const val = chosen[f.key] ?? "";
              return (
                <div key={f.key} className="grid grid-cols-1 items-center gap-2 px-4 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-ink">{f.label}</span>
                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${TIER_STYLE[tier]}`}>{tier}</span>
                  </div>
                  <select value={val} onChange={(e) => setField(f.key, e.target.value)} className={sel}>
                    <option value="">— not mapped —</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  <span className="text-right text-xs text-muted">
                    {val && conf >= 50 ? `auto ${conf}%` : val ? "manual" : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {unmapped.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-medium text-ink">Unmapped source columns ({unmapped.length})</p>
          <p className="mt-1 text-xs text-muted">Kept in the raw record for audit; not imported unless mapped.</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unmapped.map((h) => (
              <span key={h} className="rounded-full border border-line bg-cream/40 px-2 py-0.5 text-xs text-muted">{h}</span>
            ))}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <button
          onClick={() => setShowPolicy((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-ink"
        >
          <span className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-burgundy" /> Calculation policy</span>
          <span className="text-xs text-muted">{showPolicy ? "Hide" : "Edit"}</span>
        </button>
        {showPolicy && (
          <div className="grid grid-cols-1 gap-3 border-t border-line px-4 py-4 sm:grid-cols-2">
            <PolicySel label="Sales value basis" value={policy.sales_value_basis} opts={BASIS} onChange={(v) => setPolicy({ ...policy, sales_value_basis: v as CalcPolicy["sales_value_basis"] })} />
            <PolicySel label="VAT handling" value={policy.vat_handling} opts={VAT} onChange={(v) => setPolicy({ ...policy, vat_handling: v as CalcPolicy["vat_handling"] })} />
            <PolicySel label="Discount handling" value={policy.discount_handling} opts={DISC} onChange={(v) => setPolicy({ ...policy, discount_handling: v as CalcPolicy["discount_handling"] })} />
            <PolicySel label="Returns handling" value={policy.returns_handling} opts={RET} onChange={(v) => setPolicy({ ...policy, returns_handling: v as CalcPolicy["returns_handling"] })} />
            <PolicySel label="SLA actual basis" value={policy.sla_actual_basis} opts={SLA} onChange={(v) => setPolicy({ ...policy, sla_actual_basis: v as CalcPolicy["sla_actual_basis"] })} />
            <div className="grid gap-1">
              <label className="text-xs font-medium text-muted">VAT rate</label>
              <input
                type="number" step="0.01" value={policy.vat_rate}
                onChange={(e) => setPolicy({ ...policy, vat_rate: parseFloat(e.target.value) || 0 })}
                className={sel}
              />
            </div>
          </div>
        )}
      </Card>

      {error && <p className="text-sm text-roshen-red">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Save mapping &amp; validate
        </Button>
      </div>

      {sampleRows.length > 0 && (
        <p className="text-center text-xs text-muted">{sampleRows.length} sample rows previewed above during upload.</p>
      )}
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-white px-3 py-2">
      <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <p className={"mt-0.5 text-sm font-semibold " + (good ? "text-emerald-700" : "text-roshen-red")}>{value}</p>
    </div>
  );
}
function PolicySel({ label, value, opts, onChange }: { label: string; value: string; opts: string[]; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-1">
      <label className="text-xs font-medium text-muted">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={sel}>
        {opts.map((o) => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}
export { DEFAULT_POLICY };
