'use client';

import { useI18n } from '@/lib/i18n/provider';
import { Badge } from '@/components/ui/badge';
import { AdminWorkbench, useWorkbenchSelection } from '@/components/admin/admin-workbench';
import { EntityListPanel } from '@/components/admin/entity-list-panel';
import { EntityHeader, EntityTabs, DetailPlaceholder } from '@/components/admin/entity-detail';
import { ContextPanel, ContextSection, SummaryList, ContextLink, RelatedChips } from '@/components/admin/context-panel';
import { Card, CardContent } from '@/components/ui/card';
import type { AuthzConsoleData } from '@/lib/erp/authz-console-server';
import { CapabilityMatrix } from './capability-matrix';
import { ScopePanel } from './scope-panel';
import { LimitsPanel } from './limits-panel';
import { SectionAccessPanel } from './section-access-panel';
import { RoleOverridesConsole } from '../role-overrides/role-overrides-console';
import { AccessOverridesConsole } from '../access-overrides/access-overrides-console';

interface Group { key: string; permissions: string[] }
interface UaoMember { id: string; name: string; roleKeys: string[] }

/**
 * Roles & Permissions on the Admin Workbench. UX standardization only — every
 * tab reuses an existing component + its existing actions (CapabilityMatrix,
 * ScopePanel, LimitsPanel, SectionAccessPanel, RoleOverridesConsole,
 * AccessOverridesConsole). No business-logic / permission / RLS / workflow change.
 */
export function RolesWorkbench({
  data,
  entities,
  groups,
  roleOverridesEnabled,
  uaoEnabled,
  uaoMembers,
}: {
  data: AuthzConsoleData;
  entities: { key: string; labelAr: string; labelEn: string }[];
  groups: Group[];
  roleOverridesEnabled: boolean;
  uaoEnabled: boolean;
  uaoMembers: UaoMember[];
}) {
  const { t } = useI18n();
  const { selectedId, tab, select, setTab } = useWorkbenchSelection('matrix');
  const selectedRole = data.roles.find((r) => r.key === selectedId) ?? null;

  const list = (
    <EntityListPanel
      items={data.roles.map((r) => ({ id: r.key, primary: r.name_ar || r.key, secondary: r.key }))}
      selectedId={selectedId}
      onSelect={select}
      searchPlaceholder={t('authz.title')}
    />
  );

  if (!selectedRole) {
    return <AdminWorkbench list={list} detail={<DetailPlaceholder text={t('adminWb.rolePrompt')} />} />;
  }

  const membersInRole = uaoMembers.filter((m) => m.roleKeys.includes(selectedRole.key));
  const capCount = (data.capabilityGrants[selectedRole.key] ?? []).length;

  const tabs = [
    { key: 'matrix', label: t('adminWb.tabMatrix') },
    { key: 'roleov', label: t('adminWb.tabRoleOverrides') },
    { key: 'uao', label: t('adminWb.tabUao') },
    { key: 'members', label: t('adminWb.tabMembers') },
    { key: 'scope', label: t('authz.tabScope') },
    { key: 'limits', label: t('authz.tabLimits') },
    { key: 'sections', label: t('authz.tabSections') },
  ];

  const featureOff = (
    <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{t('adminWb.featureOff')}</CardContent></Card>
  );

  const detail = (
    <div>
      <EntityHeader
        title={selectedRole.name_ar || selectedRole.key}
        subtitle={selectedRole.key}
        status={<Badge variant="outline">{membersInRole.length} {t('adminWb.members')}</Badge>}
      />
      <EntityTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'matrix' && (
        <CapabilityMatrix roles={[selectedRole]} grants={data.capabilityGrants} fromBaseline={data.capabilityFromBaseline} />
      )}
      {tab === 'roleov' && (roleOverridesEnabled ? <RoleOverridesConsole roles={data.roles.map((r) => ({ key: r.key, nameAr: r.name_ar }))} groups={groups} lockedRoleKey={selectedRole.key} /> : featureOff)}
      {tab === 'uao' && (uaoEnabled ? <AccessOverridesConsole members={membersInRole} groups={groups} /> : featureOff)}
      {tab === 'members' && (
        <Card>
          <CardContent className="space-y-1 p-4">
            {membersInRole.length === 0 ? (
              <p className="text-sm text-muted-foreground">—</p>
            ) : membersInRole.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-md border px-2 py-1.5 text-sm">
                <span className="truncate">{m.name}</span>
                <span className="text-xs text-muted-foreground">{m.roleKeys.join(', ')}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
      {tab === 'scope' && (
        <ScopePanel members={data.members} roles={data.roles} branches={data.branches} regions={data.regions} areas={data.areas} scopeRows={data.scopeRows} />
      )}
      {tab === 'limits' && <LimitsPanel members={data.members} roles={data.roles} limitRows={data.limitRows} />}
      {tab === 'sections' && <SectionAccessPanel entities={entities} />}
    </div>
  );

  const context = (
    <ContextPanel>
      <ContextSection title={t('adminWb.summary')}>
        <SummaryList rows={[
          { label: t('adminWb.capabilities'), value: String(capCount) },
          { label: t('adminWb.members'), value: String(membersInRole.length) },
        ]} />
      </ContextSection>
      <ContextSection title={t('adminWb.audit')}>
        <ContextLink href="/settings/audit-log" label={t('adminWb.viewAudit')} />
      </ContextSection>
      <ContextSection title={t('adminWb.related')}>
        <RelatedChips items={membersInRole.slice(0, 8).map((m) => ({ label: m.name, href: '/settings/users' }))} />
      </ContextSection>
    </ContextPanel>
  );

  return <AdminWorkbench list={list} detail={detail} context={context} contextLabel={t('adminWb.contextLabel')} />;
}
