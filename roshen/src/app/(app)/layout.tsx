import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { visibleNav, ROLE_LABEL } from "@/lib/roles";
import { Sidebar } from "@/components/app/sidebar";
import { AppTopbar } from "@/components/app/app-topbar";
import { UploadProvider } from "@/components/app/import/upload-provider";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await requireProfile();
  if (!profile) redirect("/account");

  const nav = visibleNav(profile.role);
  const roleLabel = ROLE_LABEL[profile.role] ?? profile.role;

  return (
    <UploadProvider>
      <div className="flex min-h-screen w-full bg-cream">
        <Sidebar nav={nav} />
        <div className="flex min-w-0 flex-1 flex-col">
          <AppTopbar name={profile.full_name} email={user.email} roleLabel={roleLabel} />
          <main className="brand-surface flex-1 p-4 lg:p-8">{children}</main>
        </div>
      </div>
    </UploadProvider>
  );
}
