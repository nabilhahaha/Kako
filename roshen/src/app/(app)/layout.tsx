import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { visibleNav, ROLE_LABEL } from "@/lib/roles";
import { Sidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { UploadProvider } from "@/components/app/import/upload-provider";
import { getT } from "@/lib/i18n-server";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireProfile();
  if (!profile) redirect("/account");

  const { locale, t } = await getT();
  const nav = visibleNav(profile.role).map((i) => ({ ...i, label: t(`nav.${i.key}`) }));
  const roleLabel = t(`role.${profile.role}`) || ROLE_LABEL[profile.role] || profile.role;

  return (
    <UploadProvider>
      <div className="flex min-h-screen w-full bg-cream">
        <Sidebar nav={nav} collapseLabel={t("shell.collapse")} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar
            name={profile.full_name}
            email={user.email}
            roleLabel={roleLabel}
            locale={locale}
            searchPlaceholder={t("shell.search")}
            signoutLabel={t("shell.signout")}
          />
          <main className="brand-surface flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}
