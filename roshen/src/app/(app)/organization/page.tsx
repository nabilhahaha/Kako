import Link from "next/link";
import { MapPin, Building2, Truck, Radio, Users, ArrowRight, type LucideIcon } from "lucide-react";
import { requireProfile, isGlobalRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";

export default async function OrganizationOverviewPage() {
  const { profile } = await requireProfile();
  const supabase = await createClient();
  const { t } = await getT();

  const [regions, cities, distributors, channels] = await Promise.all([
    supabase.from("region").select("id", { count: "exact", head: true }),
    supabase.from("city").select("id", { count: "exact", head: true }),
    supabase.from("agent").select("id", { count: "exact", head: true }).eq("type", "distributor").eq("is_active", true),
    supabase.from("channel").select("id", { count: "exact", head: true }).eq("is_active", true),
  ]);

  const tiles: { href: string; label: string; sub: string; count: number; icon: LucideIcon; chip: string }[] = [
    { href: "/organization/regions", label: t("org.regions"), sub: t("org.regions_sub"), count: regions.count ?? 0, icon: MapPin, chip: "bg-burgundy-soft text-burgundy" },
    { href: "/organization/cities", label: t("org.cities"), sub: t("org.cities_sub"), count: cities.count ?? 0, icon: Building2, chip: "bg-sky-50 text-sky-700" },
    { href: "/organization/distributors", label: t("org.distributors"), sub: t("org.dist_sub"), count: distributors.count ?? 0, icon: Truck, chip: "bg-emerald-50 text-emerald-700" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 ps-12 lg:ps-0">
      <div>
        <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("org.title")}</h1>
        <p className="text-sm text-muted">{t("org.overview_sub")}</p>
      </div>

      {/* Summary cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-soft/50 text-chocolate"><Radio className="h-5 w-5" /></span>
            <div className="min-w-0"><p className="font-serif text-3xl font-bold leading-none text-ink">{channels.count ?? 0}</p><p className="mt-1 text-sm font-medium text-muted">{t("org.channels")}</p></div>
          </div>
        </Card>
        {tiles.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.href} className="p-4">
              <div className="flex items-start gap-3">
                <span className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0"><p className="font-serif text-3xl font-bold leading-none text-ink">{c.count}</p><p className="mt-1 text-sm font-medium text-muted">{c.label}</p></div>
              </div>
            </Card>
          );
        })}
      </section>

      {/* Manage links to child routes */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((c) => {
          const Icon = c.icon;
          return (
            <Link key={c.href} href={c.href} className="group rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
              <span className={"inline-flex h-10 w-10 items-center justify-center rounded-xl " + c.chip}><Icon className="h-5 w-5" /></span>
              <p className="mt-3 font-serif text-base font-semibold text-ink">{c.label}</p>
              <p className="mt-1 text-sm text-muted">{c.sub}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-burgundy">{t("org.manage")} <ArrowRight className="h-3.5 w-3.5" /></span>
            </Link>
          );
        })}
        {isGlobalRole(profile!.role) && (
          <Link href="/users-scopes" className="group rounded-2xl border border-line bg-white p-5 transition-shadow hover:shadow-md">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-cream-deep text-chocolate"><Users className="h-5 w-5" /></span>
            <p className="mt-3 font-serif text-base font-semibold text-ink">{t("org.users")}</p>
            <p className="mt-1 text-sm text-muted">{t("users.subtitle")}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-burgundy">{t("org.manage")} <ArrowRight className="h-3.5 w-3.5" /></span>
          </Link>
        )}
      </section>
    </div>
  );
}
