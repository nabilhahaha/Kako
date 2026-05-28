import { redirect } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { PageHeader } from '@/components/shared/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  permissionsForRole,
} from '@/lib/erp/permissions';
import type { BranchRole } from '@/lib/erp/types';
import { Check, Minus } from 'lucide-react';

// Roles shown as columns (admin/super-admin implicitly have everything).
const ROLE_COLUMNS: BranchRole[] = [
  'manager',
  'supervisor',
  'accountant',
  'cashier',
  'salesman',
  'warehouse_keeper',
];

export default async function PermissionsPage() {
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');

  // Precompute each role's permission set.
  const sets = new Map(ROLE_COLUMNS.map((r) => [r, new Set(permissionsForRole(r))]));

  // Group permissions for nicer display.
  const groups = new Map<string, typeof ALL_PERMISSIONS>();
  for (const p of ALL_PERMISSIONS) {
    const g = PERMISSION_LABELS[p].group;
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <div>
      <PageHeader
        title="صلاحيات الأدوار"
        description="ما الذي يستطيع كل دور فعله. مدير النظام ومدير الفرع لهم كل الصلاحيات."
      />
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-right font-medium">الصلاحية</th>
                  {ROLE_COLUMNS.map((r) => (
                    <th key={r} className="p-3 text-center font-medium whitespace-nowrap">
                      {BRANCH_ROLES[r].ar}
                    </th>
                  ))}
                </tr>
              </thead>
              {[...groups.entries()].map(([group, perms]) => (
                <tbody key={group}>
                  <tr className="border-b bg-secondary/30">
                    <td colSpan={ROLE_COLUMNS.length + 1} className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                      {group}
                    </td>
                  </tr>
                  {perms.map((p) => (
                    <tr key={p} className="border-b">
                      <td className="p-3">{PERMISSION_LABELS[p].ar}</td>
                      {ROLE_COLUMNS.map((r) => (
                        <td key={r} className="p-3 text-center">
                          {sets.get(r)!.has(p) ? (
                            <Check className="mx-auto h-4 w-4 text-success" />
                          ) : (
                            <Minus className="mx-auto h-4 w-4 text-muted-foreground/40" />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
        </CardContent>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">
        ملاحظة: مدير النظام ومدير الفرع لهم جميع الصلاحيات. يمكن تعديل صلاحيات كل دور لاحقاً حسب احتياج الشركة.
      </p>
    </div>
  );
}
