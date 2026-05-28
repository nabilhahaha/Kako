import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { visibleSections } from '@/lib/erp/navigation';
import { Sidebar } from '@/components/layout/sidebar';
import { TopBar } from '@/components/layout/topbar';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  const sections = visibleSections(ctx.topRole, ctx.isSuperAdmin);

  return (
    <div className="flex min-h-screen bg-secondary/30">
      <Sidebar sections={sections} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          fullName={ctx.profile.full_name}
          email={ctx.profile.email}
          isSuperAdmin={ctx.isSuperAdmin}
          memberships={ctx.memberships.map((m) => ({
            branchName: m.branch.name_ar || m.branch.name,
            role: m.role,
          }))}
        />
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
