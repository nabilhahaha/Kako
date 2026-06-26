import { redirect, notFound } from 'next/navigation';
import { getUserContext } from '@/lib/erp/auth-context';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { PageHeader } from '@/components/shared/page-header';
import { BackLink } from '@/components/shared/back-link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { logAudit } from '@/lib/erp/audit';
import { visibleSections, ALL_MODULES, MODULE_LABELS, type Module } from '@/lib/erp/navigation';
import { resolveHomePath } from '@/lib/erp/home';
import { resolveBottomNavTabs } from '@/components/layout/bottom-nav-tabs';
import { applyFashionUmbrella, type Permission } from '@/lib/erp/permissions';
import { BRANCH_ROLES } from '@/lib/erp/constants';
import type { BranchRole } from '@/lib/erp/types';
import { Home as HomeIcon, Smartphone, PanelLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

// View As Company — READ-ONLY tenant experience preview (platform owner only).
// For each of the company's enabled roles, shows EXACTLY what that role sees —
// home route, mobile bottom-nav, and sidebar — computed from the company's real
// effective modules + role permissions via the same gating functions the app
// uses at runtime (visibleSections / resolveHomePath / resolveBottomNavTabs).
// No session swap, no impersonation, no data-access change: a safe preview.

const KEY_ROLES: BranchRole[] = [
  'admin', 'manager', 'accountant', 'cashier', 'warehouse_keeper', 'salesman',
  'doctor', 'receptionist', 'stylist', 'viewer',
];

export default async function ViewAsCompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { t, locale } = await getT();
  const ctx = await getUserContext();
  if (!ctx) redirect('/login');
  if (!ctx.isPlatformOwner) {
    return (
      <div>
        <PageHeader title={t('platform.viewAs.title')} />
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('platform.ownerOnly')}</CardContent></Card>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: companyRaw } = await supabase
    .from('erp_companies').select('id, name, name_ar, business_type, plan_key').eq('id', id).maybeSingle();
  if (!companyRaw) notFound();
  const company = companyRaw as { id: string; name: string; name_ar: string | null; business_type: string | null; plan_key: string | null };

  const [{ data: planMods }, { data: compMods }, { data: compRoles }, { data: compRolePerms }, { data: globalPerms }] = await Promise.all([
    company.plan_key ? supabase.from('erp_plan_modules').select('module').eq('plan_key', company.plan_key) : Promise.resolve({ data: [] as { module: string }[] }),
    supabase.from('erp_company_modules').select('module, enabled').eq('company_id', id),
    supabase.from('erp_company_roles').select('role_key, enabled').eq('company_id', id),
    supabase.from('erp_company_role_permissions').select('role_key, permission').eq('company_id', id),
    supabase.from('erp_role_permissions').select('role_key, permission'),
  ]);

  // Effective modules = company-enabled ∩ plan (mirrors auth-context).
  const planSet = new Set(((planMods ?? []) as { module: string }[]).map((m) => m.module));
  const enabledCompany = ((compMods ?? []) as { module: string; enabled: boolean }[]).filter((m) => m.enabled).map((m) => m.module);
  const baseCompany = enabledCompany.length ? enabledCompany : [...ALL_MODULES];
  const modules = (baseCompany as Module[]).filter((m) => !(ALL_MODULES as string[]).includes(m) || planSet.size === 0 || planSet.has(m));

  // Per-role permissions: company-scoped config is authoritative, else global.
  const companyRolesList = ((compRoles ?? []) as { role_key: string; enabled: boolean }[]);
  const usingCompanyConfig = companyRolesList.length > 0;
  const enabledRoleKeys = usingCompanyConfig
    ? companyRolesList.filter((r) => r.enabled).map((r) => r.role_key)
    : [...new Set(((globalPerms ?? []) as { role_key: string }[]).map((r) => r.role_key))];

  const permsByRole = new Map<string, string[]>();
  const src = usingCompanyConfig ? (compRolePerms ?? []) : (globalPerms ?? []);
  for (const r of src as { role_key: string; permission: string }[]) {
    const arr = permsByRole.get(r.role_key) ?? [];
    arr.push(r.permission);
    permsByRole.set(r.role_key, arr);
  }

  // Preview the company's enabled KEY roles (bounded, most-relevant first).
  const previewRoles = KEY_ROLES.filter((r) => enabledRoleKeys.includes(r));

  await logAudit(supabase, { action: 'view', entity: 'company', entityId: id, details: { feature: 'view_as' }, companyId: id });

  const companyName = company.name_ar || company.name;
  const moduleNames = modules.map((m) => MODULE_LABELS[m]?.[locale] ?? m).join('، ');

  return (
    <div className="space-y-6">
      <BackLink href={`/platform/companies/${id}`} label={t('platform.viewAs.back')} />
      <PageHeader title={t('platform.viewAs.title')} description={t('platform.viewAs.subtitle', { company: companyName })} />

      <Card><CardContent className="flex flex-wrap items-center gap-3 p-4 text-sm">
        <Badge variant="secondary">{company.business_type ?? '—'}</Badge>
        <Badge variant="outline">{company.plan_key ?? '—'}</Badge>
        <span className="text-muted-foreground">{t('platform.viewAs.modules')}: <span className="text-foreground">{moduleNames || '—'}</span></span>
      </CardContent></Card>

      {previewRoles.length === 0 && (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('platform.viewAs.noRoles')}</CardContent></Card>
      )}

      {previewRoles.map((role) => {
        const perms = applyFashionUmbrella((permsByRole.get(role) ?? []) as Permission[]);
        const sections = visibleSections(perms, false, false, modules, [], false, company.business_type ?? null);
        const home = resolveHomePath({ companyId: id, modules, permissions: perms, businessType: company.business_type ?? null });
        const bottom = resolveBottomNavTabs({ permissions: perms, isSuperAdmin: false, modules, businessType: company.business_type ?? null });
        const roleLabel = BRANCH_ROLES[role]?.[locale] ?? role;
        return (
          <Card key={role}>
            <CardContent className="space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{roleLabel}</span>
                <Badge variant="secondary">{role}</Badge>
                <span className="text-xs text-muted-foreground">{t('platform.roles.permCount', { n: perms.length })}</span>
              </div>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-1.5"><HomeIcon className="h-4 w-4 text-muted-foreground" /> <span className="font-mono text-xs">{home}</span></span>
                <span className="inline-flex items-center gap-1.5"><Smartphone className="h-4 w-4 text-muted-foreground" /> {bottom.map((b) => b.href).join('  ·  ') || '—'}</span>
              </div>

              <div>
                <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground/70"><PanelLeft className="h-3.5 w-3.5" /> {t('platform.viewAs.sidebar')}</p>
                {sections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">—</p>
                ) : (
                  <div className="space-y-1">
                    {sections.map((s) => (
                      <div key={s.title} className="text-xs">
                        <span className="font-medium">{t(s.title)}</span>
                        <span className="text-muted-foreground">: {s.items.map((i) => t(i.label)).join('، ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
