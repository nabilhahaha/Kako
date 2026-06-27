import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { visibleGroups, ROLE_LABEL } from "@/lib/roles";
import { Sidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { UploadProvider } from "@/components/app/import/upload-provider";
import { getT } from "@/lib/i18n-server";
import { createClient } from "@/utils/supabase/server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireProfile();
  if (!profile) redirect("/account");

  const { locale, t } = await getT();
  const groups = visibleGroups(profile.role).map((g) => ({
    key: g.key,
    label: t(`navgroup.${g.key}`),
    items: g.items.map((i) => ({
      href: i.href,
      key: i.key,
      icon: i.icon,
      label: t(`nav.${i.key}`),
      children: (i.children ?? []).map((c) => ({ href: c.href, key: c.key, label: t(`nav.${c.key}`) })),
    })),
  }));
  const roleLabel = t(`role.${profile.role}`) || ROLE_LABEL[profile.role] || profile.role;

  const supabase = await createClient();
  const [{ count: unread }, { data: recent }] = await Promise.all([
    supabase.from("notification").select("id", { count: "exact", head: true }).eq("is_read", false),
    supabase.from("notification").select("id,title,message,action_url,is_read,created_at").order("created_at", { ascending: false }).limit(8),
  ]);

  return (
    <UploadProvider>
      <div className="flex min-h-screen w-full bg-cream">
        <Sidebar groups={groups} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar
            name={profile.full_name}
            email={user.email}
            roleLabel={roleLabel}
            locale={locale}
            searchPlaceholder={t("shell.search")}
            signoutLabel={t("shell.signout")}
            notifCount={unread ?? 0}
            notifItems={(recent ?? []) as never}
            notifLabels={{ title: t("notif.title"), none: t("notif.none"), markAll: t("notif.mark_all") }}
          />
          <main className="brand-surface flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}
