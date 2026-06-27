import { requireProfile, isAdminRole, isGlobalRole } from "@/lib/auth";
import { createClient } from "@/utils/supabase/server";
import { getT } from "@/lib/i18n-server";
import { Card } from "@/components/ui/card";
import { ASSIGNABLE_ROLES } from "@/lib/roles";
import { UserDialog, type UserLabels } from "@/components/app/users/user-dialog";
import { setUserActive } from "@/lib/users";

export default async function UsersScopesPage() {
  const { user, profile } = await requireProfile();
  const { t } = await getT();

  // Visible to global roles (view); managed by Admin only.
  if (!isGlobalRole(profile?.role)) {
    return (
      <div className="mx-auto w-full max-w-3xl ps-12 lg:ps-0">
        <Card className="p-12 text-center">
          <p className="text-base font-semibold text-ink">{t("users.admin_only")}</p>
        </Card>
      </div>
    );
  }
  const isAdmin = isAdminRole(profile?.role);

  const supabase = await createClient();
  const [usersRes, regionsRes, citiesRes, distsRes] = await Promise.all([
    supabase.from("profile").select("id,full_name,email,role,is_active,created_at").order("created_at", { ascending: true }),
    supabase.from("region").select("id,name").order("name"),
    supabase.from("city").select("id,name").order("name"),
    supabase.from("agent").select("id,name,code").eq("type", "distributor").order("name"),
  ]);
  const users = usersRes.data ?? [];
  const roles = ASSIGNABLE_ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }));
  const regions = (regionsRes.data ?? []).map((r) => ({ value: r.id, label: r.name }));
  const cities = (citiesRes.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const distributors = (distsRes.data ?? []).map((d) => ({ value: d.id, label: `${d.name} (${d.code})` }));

  const labels: UserLabels = {
    add: t("users.add"), edit: t("users.edit"), full_name: t("users.full_name"), email: t("users.email"),
    role: t("users.role"), active: t("users.active"), scope: t("users.scope"), scope_hint: t("users.scope_hint"),
    region: t("users.region"), city: t("users.city"), distributor: t("users.distributor"), none: t("users.none"),
    save: t("users.save"), saving: t("users.saving"), create: t("users.create"), creating: t("users.creating"),
    cancel: t("users.cancel"), created_title: t("users.created_title"), temp_password: t("users.temp_password"),
    temp_password_hint: t("users.temp_password_hint"), error_generic: t("users.error_generic"),
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 ps-12 lg:ps-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight text-ink">{t("users.title")}</h1>
          <p className="text-sm text-muted">{t("users.subtitle")}</p>
        </div>
        {isAdmin && (
          <UserDialog mode="create" roles={roles} regions={regions} cities={cities} distributors={distributors} labels={labels} />
        )}
      </div>

      {users.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-base font-semibold text-ink">{t("users.empty")}</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-cream-deep/40 text-start text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2.5 text-start font-semibold">{t("users.full_name")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("users.email")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("users.role")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("users.status")}</th>
                <th className="px-4 py-2.5 text-start font-semibold">{t("users.created_at")}</th>
                {isAdmin && <th className="px-4 py-2.5 text-end font-semibold">{t("users.actions")}</th>}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-line/60 last:border-0 hover:bg-cream/40">
                  <td className="px-4 py-2.5 font-medium text-ink">
                    {u.full_name || "—"}{u.id === user.id && <span className="ms-1 text-xs text-muted">({t("users.you")})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{u.email || "—"}</td>
                  <td className="px-4 py-2.5 text-muted">{t(`role.${u.role}`)}</td>
                  <td className="px-4 py-2.5">
                    <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + (u.is_active ? "bg-emerald-50 text-emerald-700" : "bg-cream-deep text-muted")}>
                      {u.is_active ? t("users.active") : t("users.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{String(u.created_at).slice(0, 10)}</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <UserDialog
                          mode="edit"
                          roles={roles}
                          regions={regions}
                          cities={cities}
                          distributors={distributors}
                          labels={labels}
                          initial={{ id: u.id, full_name: u.full_name ?? "", email: u.email ?? "", role: u.role, is_active: u.is_active }}
                        />
                        {u.id !== user.id && (
                          <form action={setUserActive}>
                            <input type="hidden" name="id" value={u.id} />
                            <input type="hidden" name="active" value={u.is_active ? "0" : "1"} />
                            <button className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted hover:bg-burgundy-soft hover:text-burgundy">
                              {u.is_active ? t("users.deactivate") : t("users.activate")}
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
