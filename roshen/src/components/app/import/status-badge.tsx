const STYLES: Record<string, string> = {
  pending: "bg-cream-deep text-muted",
  mapped: "bg-sky-50 text-sky-700",
  previewed: "bg-sky-50 text-sky-700",
  validated: "bg-indigo-50 text-indigo-700",
  imported: "bg-emerald-50 text-emerald-700",
  superseded: "bg-amber-50 text-amber-700",
  cancelled: "bg-cream-deep text-muted",
  failed: "bg-roshen-red/10 text-roshen-red",
};

export function STATUS_BADGE(status: string) {
  return (
    <span className={"inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize " + (STYLES[status] ?? "bg-cream-deep text-muted")}>
      {status}
    </span>
  );
}
