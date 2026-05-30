'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Plus,
  Loader2,
  X,
  Pencil,
  Power,
  Building2,
  Users,
  IdCard,
  UserCog,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n/provider';
import type { Department, Team, JobTitle } from '@/lib/erp/types';
import {
  upsertDepartment,
  toggleDepartmentActive,
  upsertTeam,
  toggleTeamActive,
  upsertJobTitle,
  toggleJobTitleActive,
  assignEmployee,
} from './actions';

export interface BranchOption {
  id: string;
  name: string;
  name_ar: string | null;
}

export interface StaffRow {
  id: string; // erp_user_branches.id (membership id)
  user_id: string;
  role: string;
  department_id: string | null;
  team_id: string | null;
  job_title_id: string | null;
  reports_to: string | null;
  full_name: string | null;
}

type Tab = 'departments' | 'teams' | 'jobTitles' | 'employees';

const selectCls =
  'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function OrganizationManager({
  departments,
  teams,
  jobTitles,
  branches,
  staff,
}: {
  departments: Department[];
  teams: Team[];
  jobTitles: JobTitle[];
  branches: BranchOption[];
  staff: StaffRow[];
}) {
  const { t, locale } = useI18n();
  const [tab, setTab] = useState<Tab>('departments');

  const staffName = (userId: string | null) => {
    if (!userId) return null;
    return staff.find((s) => s.user_id === userId)?.full_name ?? null;
  };
  const localName = (en: string, ar: string | null) =>
    locale === 'ar' && ar ? ar : en;

  const tabs: { key: Tab; label: string; icon: typeof Building2 }[] = [
    { key: 'departments', label: t('organization.tabDepartments'), icon: Building2 },
    { key: 'teams', label: t('organization.tabTeams'), icon: Users },
    { key: 'jobTitles', label: t('organization.tabJobTitles'), icon: IdCard },
    { key: 'employees', label: t('organization.tabEmployees'), icon: UserCog },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1 border-b">
        {tabs.map((tb) => {
          const Icon = tb.icon;
          const active = tab === tb.key;
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tb.label}
            </button>
          );
        })}
      </div>

      {tab === 'departments' && (
        <DepartmentsTab
          departments={departments}
          branches={branches}
          staff={staff}
          staffName={staffName}
          localName={localName}
        />
      )}
      {tab === 'teams' && (
        <TeamsTab
          teams={teams}
          departments={departments}
          staff={staff}
          staffName={staffName}
          localName={localName}
        />
      )}
      {tab === 'jobTitles' && (
        <JobTitlesTab jobTitles={jobTitles} localName={localName} />
      )}
      {tab === 'employees' && (
        <EmployeesTab
          staff={staff}
          departments={departments}
          teams={teams}
          jobTitles={jobTitles}
          localName={localName}
        />
      )}
    </div>
  );
}

function useRun() {
  const router = useRouter();
  const { t } = useI18n();
  const [pending, startTransition] = useTransition();
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) {
    return new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const res = await fn();
        if (!res.ok) {
          toast.error(res.error ?? t('organization.toastError'));
          resolve(false);
          return;
        }
        toast.success(ok);
        router.refresh();
        resolve(true);
      });
    });
  }
  return { run, pending };
}

function StatusBadge({ active }: { active: boolean }) {
  const { t } = useI18n();
  return (
    <Badge variant={active ? 'success' : 'secondary'}>
      {active ? t('organization.statusActive') : t('organization.statusInactive')}
    </Badge>
  );
}

// ── Departments ───────────────────────────────────────────────────────────────

function DepartmentsTab({
  departments,
  branches,
  staff,
  staffName,
  localName,
}: {
  departments: Department[];
  branches: BranchOption[];
  staff: StaffRow[];
  staffName: (id: string | null) => string | null;
  localName: (en: string, ar: string | null) => string;
}) {
  const { t } = useI18n();
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<Department | 'new' | null>(null);

  const branchName = (id: string | null) => {
    if (!id) return t('organization.allBranches');
    const b = branches.find((x) => x.id === id);
    return b ? localName(b.name, b.name_ar) : t('organization.allBranches');
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => upsertDepartment(fd), t('organization.toastDepartmentSaved')).then(
      (ok) => {
        if (ok) setEditing(null);
      },
    );
  }

  return (
    <div className="space-y-4">
      {editing === null ? (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('organization.btnNewDepartment')}
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <h3 className="text-sm font-semibold">
                {editing === 'new'
                  ? t('organization.formNewDepartment')
                  : t('organization.formEditDepartment')}
              </h3>
              {editing !== 'new' && (
                <input type="hidden" name="id" value={editing.id} />
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameEn')}</Label>
                  <Input
                    name="name"
                    required
                    defaultValue={editing === 'new' ? '' : editing.name}
                    placeholder={t('organization.namePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameAr')}</Label>
                  <Input
                    name="name_ar"
                    defaultValue={editing === 'new' ? '' : editing.name_ar ?? ''}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldBranch')}</Label>
                  <select
                    name="branch_id"
                    className={`${selectCls} h-10`}
                    defaultValue={editing === 'new' ? '' : editing.branch_id ?? ''}
                  >
                    <option value="">{t('organization.branchPlaceholder')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {localName(b.name, b.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldManager')}</Label>
                  <select
                    name="manager_id"
                    className={`${selectCls} h-10`}
                    defaultValue={editing === 'new' ? '' : editing.manager_id ?? ''}
                  >
                    <option value="">{t('organization.noneOption')}</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name || '—'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing === 'new' ? true : editing.is_active}
                  className="h-4 w-4"
                />
                {t('organization.fieldActive')}
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
                  {t('organization.btnSave')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  <X className="h-4 w-4" /> {t('organization.btnCancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('organization.colName')}</th>
                  <th className="p-3 text-start font-medium">{t('organization.colBranch')}</th>
                  <th className="p-3 text-start font-medium">{t('organization.colManager')}</th>
                  <th className="p-3 text-center font-medium">{t('organization.colStatus')}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.id} className="border-b align-middle">
                    <td className="p-3 font-medium">{localName(d.name, d.name_ar)}</td>
                    <td className="p-3 text-muted-foreground">{branchName(d.branch_id)}</td>
                    <td className="p-3 text-muted-foreground">
                      {staffName(d.manager_id) ?? t('organization.noManager')}
                    </td>
                    <td className="p-3 text-center">
                      <StatusBadge active={d.is_active} />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditing(d)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t('organization.btnEdit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => toggleDepartmentActive(d.id, !d.is_active),
                              d.is_active
                                ? t('organization.toastDeactivated')
                                : t('organization.toastActivated'),
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />{' '}
                          {d.is_active
                            ? t('organization.btnDeactivate')
                            : t('organization.btnActivate')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      <Building2 className="mx-auto mb-2 h-8 w-8" />
                      {t('organization.emptyDepartments')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Teams ─────────────────────────────────────────────────────────────────────

function TeamsTab({
  teams,
  departments,
  staff,
  staffName,
  localName,
}: {
  teams: Team[];
  departments: Department[];
  staff: StaffRow[];
  staffName: (id: string | null) => string | null;
  localName: (en: string, ar: string | null) => string;
}) {
  const { t } = useI18n();
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<Team | 'new' | null>(null);

  const deptName = (id: string | null) => {
    if (!id) return t('organization.noDepartment');
    const d = departments.find((x) => x.id === id);
    return d ? localName(d.name, d.name_ar) : t('organization.noDepartment');
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => upsertTeam(fd), t('organization.toastTeamSaved')).then((ok) => {
      if (ok) setEditing(null);
    });
  }

  return (
    <div className="space-y-4">
      {editing === null ? (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('organization.btnNewTeam')}
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <h3 className="text-sm font-semibold">
                {editing === 'new'
                  ? t('organization.formNewTeam')
                  : t('organization.formEditTeam')}
              </h3>
              {editing !== 'new' && (
                <input type="hidden" name="id" value={editing.id} />
              )}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameEn')}</Label>
                  <Input
                    name="name"
                    required
                    defaultValue={editing === 'new' ? '' : editing.name}
                    placeholder={t('organization.namePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameAr')}</Label>
                  <Input
                    name="name_ar"
                    defaultValue={editing === 'new' ? '' : editing.name_ar ?? ''}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldDepartment')}</Label>
                  <select
                    name="department_id"
                    className={`${selectCls} h-10`}
                    defaultValue={editing === 'new' ? '' : editing.department_id ?? ''}
                  >
                    <option value="">{t('organization.noneOption')}</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {localName(d.name, d.name_ar)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldLead')}</Label>
                  <select
                    name="lead_id"
                    className={`${selectCls} h-10`}
                    defaultValue={editing === 'new' ? '' : editing.lead_id ?? ''}
                  >
                    <option value="">{t('organization.noneOption')}</option>
                    {staff.map((s) => (
                      <option key={s.user_id} value={s.user_id}>
                        {s.full_name || '—'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing === 'new' ? true : editing.is_active}
                  className="h-4 w-4"
                />
                {t('organization.fieldActive')}
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
                  {t('organization.btnSave')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  <X className="h-4 w-4" /> {t('organization.btnCancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('organization.colName')}</th>
                  <th className="p-3 text-start font-medium">{t('organization.colDepartment')}</th>
                  <th className="p-3 text-start font-medium">{t('organization.colLead')}</th>
                  <th className="p-3 text-center font-medium">{t('organization.colStatus')}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {teams.map((tm) => (
                  <tr key={tm.id} className="border-b align-middle">
                    <td className="p-3 font-medium">{localName(tm.name, tm.name_ar)}</td>
                    <td className="p-3 text-muted-foreground">{deptName(tm.department_id)}</td>
                    <td className="p-3 text-muted-foreground">
                      {staffName(tm.lead_id) ?? t('organization.noLead')}
                    </td>
                    <td className="p-3 text-center">
                      <StatusBadge active={tm.is_active} />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditing(tm)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t('organization.btnEdit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => toggleTeamActive(tm.id, !tm.is_active),
                              tm.is_active
                                ? t('organization.toastDeactivated')
                                : t('organization.toastActivated'),
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />{' '}
                          {tm.is_active
                            ? t('organization.btnDeactivate')
                            : t('organization.btnActivate')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {teams.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-muted-foreground">
                      <Users className="mx-auto mb-2 h-8 w-8" />
                      {t('organization.emptyTeams')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Job Titles ────────────────────────────────────────────────────────────────

function JobTitlesTab({
  jobTitles,
  localName,
}: {
  jobTitles: JobTitle[];
  localName: (en: string, ar: string | null) => string;
}) {
  const { t } = useI18n();
  const { run, pending } = useRun();
  const [editing, setEditing] = useState<JobTitle | 'new' | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() => upsertJobTitle(fd), t('organization.toastJobTitleSaved')).then(
      (ok) => {
        if (ok) setEditing(null);
      },
    );
  }

  return (
    <div className="space-y-4">
      {editing === null ? (
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> {t('organization.btnNewJobTitle')}
        </Button>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={onSubmit} className="space-y-4">
              <h3 className="text-sm font-semibold">
                {editing === 'new'
                  ? t('organization.formNewJobTitle')
                  : t('organization.formEditJobTitle')}
              </h3>
              {editing !== 'new' && (
                <input type="hidden" name="id" value={editing.id} />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameEn')}</Label>
                  <Input
                    name="name"
                    required
                    defaultValue={editing === 'new' ? '' : editing.name}
                    placeholder={t('organization.namePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t('organization.fieldNameAr')}</Label>
                  <Input
                    name="name_ar"
                    defaultValue={editing === 'new' ? '' : editing.name_ar ?? ''}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="is_active"
                  defaultChecked={editing === 'new' ? true : editing.is_active}
                  className="h-4 w-4"
                />
                {t('organization.fieldActive')}
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
                  {t('organization.btnSave')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditing(null)}
                >
                  <X className="h-4 w-4" /> {t('organization.btnCancel')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-secondary/50 text-muted-foreground">
                <tr>
                  <th className="p-3 text-start font-medium">{t('organization.colName')}</th>
                  <th className="p-3 text-center font-medium">{t('organization.colStatus')}</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {jobTitles.map((j) => (
                  <tr key={j.id} className="border-b align-middle">
                    <td className="p-3 font-medium">{localName(j.name, j.name_ar)}</td>
                    <td className="p-3 text-center">
                      <StatusBadge active={j.is_active} />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() => setEditing(j)}
                        >
                          <Pencil className="h-3.5 w-3.5" /> {t('organization.btnEdit')}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          onClick={() =>
                            run(
                              () => toggleJobTitleActive(j.id, !j.is_active),
                              j.is_active
                                ? t('organization.toastDeactivated')
                                : t('organization.toastActivated'),
                            )
                          }
                        >
                          <Power className="h-3.5 w-3.5" />{' '}
                          {j.is_active
                            ? t('organization.btnDeactivate')
                            : t('organization.btnActivate')}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobTitles.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-8 text-center text-muted-foreground">
                      <IdCard className="mx-auto mb-2 h-8 w-8" />
                      {t('organization.emptyJobTitles')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Employees ─────────────────────────────────────────────────────────────────

function EmployeesTab({
  staff,
  departments,
  teams,
  jobTitles,
  localName,
}: {
  staff: StaffRow[];
  departments: Department[];
  teams: Team[];
  jobTitles: JobTitle[];
  localName: (en: string, ar: string | null) => string;
}) {
  const { t } = useI18n();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-secondary/50 text-muted-foreground">
              <tr>
                <th className="p-3 text-start font-medium">{t('organization.colEmployee')}</th>
                <th className="p-3 text-start font-medium">{t('organization.colDepartment')}</th>
                <th className="p-3 text-start font-medium">{t('organization.colTeam')}</th>
                <th className="p-3 text-start font-medium">{t('organization.colJobTitle')}</th>
                <th className="p-3 text-start font-medium">{t('organization.colReportsTo')}</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {staff.map((s) => (
                <EmployeeRow
                  key={s.id}
                  member={s}
                  staff={staff}
                  departments={departments}
                  teams={teams}
                  jobTitles={jobTitles}
                  localName={localName}
                />
              ))}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground">
                    <UserCog className="mx-auto mb-2 h-8 w-8" />
                    {t('organization.emptyEmployees')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EmployeeRow({
  member,
  staff,
  departments,
  teams,
  jobTitles,
  localName,
}: {
  member: StaffRow;
  staff: StaffRow[];
  departments: Department[];
  teams: Team[];
  jobTitles: JobTitle[];
  localName: (en: string, ar: string | null) => string;
}) {
  const { t } = useI18n();
  const { run, pending } = useRun();
  const [departmentId, setDepartmentId] = useState(member.department_id ?? '');
  const [teamId, setTeamId] = useState(member.team_id ?? '');
  const [jobTitleId, setJobTitleId] = useState(member.job_title_id ?? '');
  const [reportsTo, setReportsTo] = useState(member.reports_to ?? '');

  const dirty =
    departmentId !== (member.department_id ?? '') ||
    teamId !== (member.team_id ?? '') ||
    jobTitleId !== (member.job_title_id ?? '') ||
    reportsTo !== (member.reports_to ?? '');

  // Teams scoped to the selected department (plus dept-less teams) keep the
  // pickers coherent, while reports_to stays independent (matrix reporting).
  const teamOptions = useMemo(
    () =>
      teams.filter(
        (tm) => !departmentId || !tm.department_id || tm.department_id === departmentId,
      ),
    [teams, departmentId],
  );

  function onSave() {
    run(
      () =>
        assignEmployee(member.id, {
          department_id: departmentId || null,
          team_id: teamId || null,
          job_title_id: jobTitleId || null,
          reports_to: reportsTo || null,
        }),
      t('organization.toastEmployeeSaved'),
    );
  }

  return (
    <tr className="border-b align-middle">
      <td className="p-3">
        <span className="font-medium">{member.full_name || '—'}</span>
        <Badge variant="secondary" className="ms-2">
          {member.role}
        </Badge>
      </td>
      <td className="p-3">
        <select
          className={selectCls}
          value={departmentId}
          disabled={pending}
          onChange={(e) => {
            setDepartmentId(e.target.value);
            setTeamId('');
          }}
        >
          <option value="">{t('organization.noneOption')}</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {localName(d.name, d.name_ar)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-3">
        <select
          className={selectCls}
          value={teamId}
          disabled={pending}
          onChange={(e) => setTeamId(e.target.value)}
        >
          <option value="">{t('organization.noneOption')}</option>
          {teamOptions.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {localName(tm.name, tm.name_ar)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-3">
        <select
          className={selectCls}
          value={jobTitleId}
          disabled={pending}
          onChange={(e) => setJobTitleId(e.target.value)}
        >
          <option value="">{t('organization.noneOption')}</option>
          {jobTitles.map((j) => (
            <option key={j.id} value={j.id}>
              {localName(j.name, j.name_ar)}
            </option>
          ))}
        </select>
      </td>
      <td className="p-3">
        <select
          className={selectCls}
          value={reportsTo}
          disabled={pending}
          onChange={(e) => setReportsTo(e.target.value)}
        >
          <option value="">{t('organization.noneOption')}</option>
          {staff
            .filter((s) => s.user_id !== member.user_id)
            .map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.full_name || '—'}
              </option>
            ))}
        </select>
      </td>
      <td className="p-3 text-end">
        <Button size="sm" disabled={pending || !dirty} onClick={onSave}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
          {t('organization.btnSave')}
        </Button>
      </td>
    </tr>
  );
}
