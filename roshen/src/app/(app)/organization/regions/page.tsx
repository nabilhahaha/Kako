import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { EntityDialog, type DialogField } from "@/components/app/org/entity-dialog";
import { upsertRegion } from "@/lib/org";

const txt = (v: unknown) => (v == null || v === "" ? "—" : String(v));

export default async function RegionsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();
  const { t } = await getT();

  let query = supabase.from("region").select("id,name,code").order("name");
  if (q.trim()) query = query.ilike("name", `%${q.trim()}%`);
  const rows = ((await query).data as Record<string, unknown>[]) ?? [];

  const fields: DialogField[] = [
    { name: "name", label: t("org.name"), type: "text", required: true },
    { name: "code", label: t("org.code"), type: "text" },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 ps-12 lg:ps-0">
      <Link href="/organization" className="inline-flex items-center gap-1.5 text-sm font-medium text-burgundy hover:underline">
        <ArrowLeft className="h-4 w-4" /> {t("org.title")}
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("org.regions")}</h1>
          <p className="text-sm text-muted">{t("org.regions_sub")}</p>
        </div>
        {isAdmin
          ? <EntityDialog title={t("org.add_region")} fields={fields} action={upsertRegion} />
          : <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-muted"><Eye className="h-3.5 w-3.5" /> {t("org.view_only")}</span>}
      </div>

      <form action="/organization/regions" method="get">
        <input name="q" defaultValue={q} placeholder={t("org.search")} className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15" />
      </form>

      <Card className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.name")}</th>
              <th className="px-4 py-2.5 text-start font-semibold">{t("org.code")}</th>
              {isAdmin && <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={isAdmin ? 3 : 2} className="px-4 py-12 text-center text-sm text-muted">{t("org.empty")}</td></tr>
            ) : rows.map((r) => (
              <tr key={String(r.id)} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                <td className="px-4 py-2.5 font-medium text-ink">{txt(r.name)}</td>
                <td className="px-4 py-2.5 text-muted">{txt(r.code)}</td>
                {isAdmin && (
                  <td className="px-4 py-2.5 text-end">
                    <EntityDialog title={t("org.add_region")} mode="edit" fields={fields} action={upsertRegion}
                      initial={{ id: String(r.id), name: (r.name as string) ?? "", code: (r.code as string) ?? "" }} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
