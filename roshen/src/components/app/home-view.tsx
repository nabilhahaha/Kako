import Link from "next/link";
import {
  Building2,
  Truck,
  Upload,
  Target,
  CheckCircle2,
  Circle,
  ArrowRight,
} from "lucide-react";
import { getT } from "@/lib/i18n-server";

export type ScopeRow = { label: string; count: number };
export type SetupStep = { label: string; done: boolean };

const ACTIONS = [
  { href: "/organization", labelKey: "home.action.organization", descKey: "home.action.organization_desc", icon: Building2, global: false },
  { href: "/organization/distributors", labelKey: "home.action.distributors", descKey: "home.action.distributors_desc", icon: Truck, global: false },
  { href: "/raw-data-upload", labelKey: "home.action.upload", descKey: "home.action.upload_desc", icon: Upload, global: true },
  { href: "/sla-targets", labelKey: "home.action.sla", descKey: "home.action.sla_desc", icon: Target, global: true },
];

const FOUNDATION = ["home.foundation.db", "home.foundation.rls", "home.foundation.mapping", "home.foundation.sla"];

export async function HomeView({
  global,
  assignedAreas,
  scopeRows,
  steps,
}: {
  global: boolean;
  assignedAreas: number;
  scopeRows: ScopeRow[];
  steps: SetupStep[];
}) {
  const { t } = await getT();
  const actions = ACTIONS.filter((a) => global || !a.global);
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Hero */}
      <section className="brand-panel relative overflow-hidden rounded-2xl px-6 py-8 text-cream sm:px-10 sm:py-10">
        <div className="relative z-10 max-w-xl">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.2em] text-gold-soft">
            {t("home.kicker")}
          </span>
          <h1 className="mt-3 font-serif text-3xl font-bold tracking-tight sm:text-4xl">
            {t("home.title")}
          </h1>
          <p className="mt-2 max-w-md text-sm text-cream/75">{t("home.subtitle")}</p>
        </div>
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-8 h-56 w-56 rounded-full border border-gold/15" />
        <div aria-hidden className="pointer-events-none absolute -bottom-20 right-24 h-64 w-64 rounded-full border border-gold/10" />
      </section>

      {/* Action cards */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-2xl border border-line bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-burgundy-soft text-burgundy">
              <a.icon className="h-5 w-5" />
            </span>
            <p className="mt-3 font-serif text-base font-semibold text-ink">{t(a.labelKey)}</p>
            <p className="mt-1 text-sm text-muted">{t(a.descKey)}</p>
          </Link>
        ))}
      </section>

      {/* Three panels */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-serif text-base font-semibold text-ink">{t("home.scope_title")}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {global ? t("home.scope_full") : t("home.scope_assigned", { n: assignedAreas })}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {scopeRows.map((r) => (
              <li key={r.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink/80">
                  <CheckCircle2 className="h-4 w-4 text-gold-hover" />
                  {global ? `${t("common.all")} ${r.label}` : r.label}
                </span>
                <span className="font-medium text-ink">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <h2 className="font-serif text-base font-semibold text-ink">{t("home.foundation_title")}</h2>
          <p className="mt-0.5 text-xs text-muted">{t("home.foundation_sub")}</p>
          <ul className="mt-3 space-y-2 text-sm">
            {FOUNDATION.map((f) => (
              <li key={f} className="flex items-center gap-2 text-ink/80">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {t(f)}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-line bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-serif text-base font-semibold text-ink">{t("home.steps_title")}</h2>
            <span className="text-xs font-medium text-muted">{doneCount}/4</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-cream-deep">
            <div className="h-full rounded-full bg-gold" style={{ width: `${(doneCount / 4) * 100}%` }} />
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {steps.map((s) => (
              <li key={s.label} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-ink/80">
                  {s.done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted/50" />
                  )}
                  {s.label}
                </span>
                <span className={s.done ? "text-xs font-medium text-emerald-600" : "text-xs text-muted"}>
                  {s.done ? t("home.completed") : t("home.pending")}
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/organization"
            className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-burgundy hover:underline"
          >
            {t("home.view_all_steps")} <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>
    </div>
  );
}
