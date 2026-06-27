import { FileText } from "lucide-react";
import { requireProfile, isAdminRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { FileUploadDialog } from "@/components/app/files/file-upload-dialog";
import { FileRowActions } from "@/components/app/files/file-row-actions";
import { roleOpts } from "@/lib/task-meta";
import { createFileAsset, finalizeFileAsset, deleteFileAsset, archiveFileAsset, fileSignedUrl } from "@/lib/files";

const CATEGORIES = ["contracts", "reports", "invoices", "market_photos", "approvals", "presentations", "data_files", "other"];
const VISIBILITIES = ["private", "selected_users", "selected_role", "public_company"];

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; visibility?: string; archived?: string }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const categoryF = CATEGORIES.includes(sp.category ?? "") ? (sp.category as string) : "";
  const visibilityF = VISIBILITIES.includes(sp.visibility ?? "") ? (sp.visibility as string) : "";
  const showArchived = sp.archived === "1";

  const { user, profile } = await requireProfile();
  const isAdmin = isAdminRole(profile!.role);
  const supabase = await createClient();
  const { t } = await getT();

  let fq = supabase
    .from("file_asset")
    .select("id,name,category,visibility,owner_id,storage_path,archived,created_at,tags")
    .order("created_at", { ascending: false });
  if (!showArchived) fq = fq.eq("archived", false);
  if (q) fq = fq.ilike("name", `%${q}%`);
  if (categoryF) fq = fq.eq("category", categoryF);
  if (visibilityF) fq = fq.eq("visibility", visibilityF as never);

  const [filesRes, profilesRes] = await Promise.all([
    fq,
    supabase.from("profile").select("id,full_name,email"),
  ]);
  const files = filesRes.data ?? [];
  const nameById = new Map<string, string>();
  (profilesRes.data ?? []).forEach((p) => nameById.set(p.id, p.full_name || p.email || p.id.slice(0, 8)));
  const users = (profilesRes.data ?? []).map((p) => ({ value: p.id, label: p.full_name || p.email || p.id.slice(0, 8) }));
  const catOpts = CATEGORIES.map((c) => ({ value: c, label: t(`fcat.${c}`) }));
  const visOpts = VISIBILITIES.map((v) => ({ value: v, label: t(`fvis.${v}`) }));

  const uploadLabels = {
    upload: t("files.upload"), name: t("files.name"), description: t("files.description"),
    category: t("files.category"), visibility: t("files.col.visibility"),
    role: t("task.visible_role"), users: t("task.assignees"), tags: t("files.tags"),
    file: t("files.file"), cancel: t("common.cancel"), file_required: t("files.file"),
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("files.title")}</h1>
          <p className="text-sm text-muted">{t("files.subtitle")}</p>
        </div>
        <FileUploadDialog createAction={createFileAsset} finalize={finalizeFileAsset} labels={uploadLabels} categories={catOpts} visibilities={visOpts} roles={roleOpts(t)} users={users} />
      </div>

      {/* Filters */}
      <form action="/workspace/files" method="get" className="flex flex-wrap items-end gap-2">
        <input name="q" defaultValue={q} placeholder={t("files.search")} className="w-full max-w-xs rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-burgundy/40 focus:ring-2 focus:ring-burgundy/15" />
        <select name="category" defaultValue={categoryF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("files.all_categories")}</option>
          {catOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="visibility" defaultValue={visibilityF} className="rounded-xl border border-line bg-white px-3 py-2 text-sm">
          <option value="">{t("files.all_visibility")}</option>
          {visOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-2 rounded-xl border border-line bg-white px-3 py-2 text-sm text-ink/80">
          <input type="checkbox" name="archived" value="1" defaultChecked={showArchived} className="h-4 w-4 rounded border-line text-burgundy" />
          {t("files.show_archived")}
        </label>
        <button type="submit" className="rounded-xl bg-burgundy px-3 py-2 text-sm font-medium text-cream hover:bg-burgundy-hover">{t("common.apply_filters")}</button>
      </form>

      {files.length === 0 ? (
        <Card className="p-12 text-center">
          <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-burgundy-soft text-burgundy"><FileText className="h-6 w-6" /></span>
          <p className="mt-3 text-base font-semibold text-ink">{t("files.empty")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("files.empty_hint")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-start font-semibold">{t("files.col.name")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("files.col.category")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("files.col.owner")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("files.col.visibility")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("files.col.date")}</th>
                <th className="px-4 py-2.5 text-end font-semibold">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {f.name}{f.archived ? <span className="ms-2 rounded-full bg-cream-deep px-2 py-0.5 text-[11px] text-muted">{t("files.archived")}</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{f.category ? t(`fcat.${f.category}`) : "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{nameById.get(String(f.owner_id)) ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{t(`fvis.${f.visibility}`)}</td>
                  <td className="px-4 py-2.5 text-muted">{String(f.created_at).slice(0, 10)}</td>
                  <td className="px-4 py-2.5">
                    <FileRowActions
                      id={f.id}
                      path={f.storage_path}
                      archived={f.archived}
                      canManage={isAdmin || f.owner_id === user.id}
                      signedUrl={fileSignedUrl}
                      remove={deleteFileAsset}
                      archive={archiveFileAsset}
                      labels={{ download: t("common.download"), archive: t("files.archive"), unarchive: t("files.unarchive") }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
