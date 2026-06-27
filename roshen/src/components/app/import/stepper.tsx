import { Check } from "lucide-react";

const STEPS = ["Upload", "Mapping", "Validation", "Decision", "Imported"] as const;
export type Step = (typeof STEPS)[number];

export function Stepper({ current }: { current: Step }) {
  const idx = STEPS.indexOf(current);
  return (
    <ol className="flex flex-wrap items-center gap-2 text-xs">
      {STEPS.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <li key={s} className="flex items-center gap-2">
            <span
              className={
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold " +
                (done
                  ? "bg-burgundy text-cream"
                  : active
                    ? "border-2 border-burgundy bg-white text-burgundy"
                    : "border border-line bg-white text-muted")
              }
            >
              {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </span>
            <span className={active ? "font-medium text-burgundy" : "text-muted"}>{s}</span>
            {i < STEPS.length - 1 && <span className="mx-1 h-px w-5 bg-line" />}
          </li>
        );
      })}
    </ol>
  );
}
