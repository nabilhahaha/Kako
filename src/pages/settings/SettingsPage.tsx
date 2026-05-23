import { useState, useMemo } from 'react';
import { Save, Search, Settings, Users, MapPin, Route, ClipboardCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import { useAppStore } from '@/stores/appStore';
import { mockUsers } from '@/data/mockData';
import type { DataUpdateType, UserRole } from '@/lib/types';
import { ROLE_LABELS } from '@/lib/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const APPROVER_ROLES: UserRole[] = ['admin', 'manager', 'data_team'];

const ALL_UPDATE_TYPES: DataUpdateType[] = [
  'CR Number',
  'VAT Number',
  'National Address',
  'Phone Number',
  'Customer Name',
  'GPS Location',
  'Channel',
];

// ── Toggle Switch ──────────────────────────────────────────────────

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div
          className={`h-6 w-11 rounded-full transition-colors ${
            checked
              ? 'bg-purple-600'
              : 'bg-gray-300 dark:bg-gray-600'
          }`}
        />
        <div
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
    </label>
  );
}

// ── Component ────────────────────────────────────────────────────────

export function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const { settings, updateSettings, addAuditLog } = useAppStore();

  // GPS Settings
  const [gpsRadius, setGpsRadius] = useState(settings.allowedGpsRadius);

  // Visit Settings
  const [photoRequired, setPhotoRequired] = useState(settings.visitPhotoRequired);
  const [mandatoryNotes, setMandatoryNotes] = useState(settings.mandatoryNotes);

  // Approval Routing
  const [routing, setRouting] = useState(() =>
    ALL_UPDATE_TYPES.map((ut) => {
      const match = settings.approvalRouting.find((r) => r.updateType === ut);
      return { updateType: ut, approverRole: match?.approverRole ?? ('data_team' as UserRole) };
    }),
  );

  // User Management filter
  const [userRoleFilter, setUserRoleFilter] = useState<UserRole | 'All'>('All');
  const [userSearch, setUserSearch] = useState('');

  if (!user) return null;

  // ── Filtered users ──────────────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = mockUsers;
    if (userRoleFilter !== 'All') {
      result = result.filter((u) => u.role === userRoleFilter);
    }
    if (userSearch.trim()) {
      const q = userSearch.toLowerCase();
      result = result.filter(
        (u) =>
          u.fullName.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      );
    }
    return result;
  }, [userRoleFilter, userSearch]);

  // ── Save handlers ─────────────────────────────────────────────

  const saveGps = () => {
    updateSettings({ allowedGpsRadius: gpsRadius });
    addAuditLog({
      userId: user.id,
      userName: user.fullName,
      role: user.role,
      action: 'settings_changed',
      entity: 'Settings',
      entityId: 'gps',
      oldValue: String(settings.allowedGpsRadius),
      newValue: String(gpsRadius),
      status: 'Applied',
    });
    toast.success('Settings saved');
  };

  const saveVisitSettings = () => {
    updateSettings({ visitPhotoRequired: photoRequired, mandatoryNotes });
    addAuditLog({
      userId: user.id,
      userName: user.fullName,
      role: user.role,
      action: 'settings_changed',
      entity: 'Settings',
      entityId: 'visit',
      oldValue: `Photo: ${settings.visitPhotoRequired}, Notes: ${settings.mandatoryNotes}`,
      newValue: `Photo: ${photoRequired}, Notes: ${mandatoryNotes}`,
      status: 'Applied',
    });
    toast.success('Settings saved');
  };

  const saveRouting = () => {
    updateSettings({ approvalRouting: routing });
    addAuditLog({
      userId: user.id,
      userName: user.fullName,
      role: user.role,
      action: 'settings_changed',
      entity: 'Settings',
      entityId: 'approval_routing',
      oldValue: JSON.stringify(settings.approvalRouting),
      newValue: JSON.stringify(routing),
      status: 'Applied',
    });
    toast.success('Settings saved');
  };

  // ── Section card ──────────────────────────────────────────────

  const Section = ({
    icon,
    title,
    children,
  }: {
    icon: React.ReactNode;
    title: string;
    children: React.ReactNode;
  }) => (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <PageHeader title="Admin Settings" subtitle="Configure application settings and view users" />

      {/* ═══════ GPS Settings ═══════ */}
      <Section icon={<MapPin className="h-5 w-5" />} title="GPS Settings">
        <div className="flex flex-wrap items-end gap-4">
          <div className="w-64">
            <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
              Allowed GPS Radius (meters)
            </Label>
            <Input
              type="number"
              min={10}
              max={5000}
              value={gpsRadius}
              onChange={(e) => setGpsRadius(Number(e.target.value))}
            />
          </div>
          <Button onClick={saveGps} className="gap-2">
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </Section>

      {/* ═══════ Visit Settings ═══════ */}
      <Section icon={<ClipboardCheck className="h-5 w-5" />} title="Visit Settings">
        <div className="space-y-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
            <ToggleSwitch
              checked={photoRequired}
              onChange={setPhotoRequired}
              label="Visit Photo Required"
            />
            <ToggleSwitch
              checked={mandatoryNotes}
              onChange={setMandatoryNotes}
              label="Mandatory Notes"
            />
            <Button onClick={saveVisitSettings} className="gap-2 self-start">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Visit Purposes
            </h3>
            <div className="flex flex-wrap gap-2">
              {settings.visitPurposes.map((p) => (
                <span
                  key={p}
                  className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                >
                  {p}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ═══════ Approval Routing ═══════ */}
      <Section icon={<Route className="h-5 w-5" />} title="Approval Routing">
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Update Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Approver Role
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {routing.map((r, idx) => (
                  <tr key={r.updateType} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                      {r.updateType}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={r.approverRole}
                        onChange={(e) => {
                          const updated = [...routing];
                          updated[idx] = { ...r, approverRole: e.target.value as UserRole };
                          setRouting(updated);
                        }}
                        className="w-48"
                      >
                        {APPROVER_ROLES.map((role) => (
                          <option key={role} value={role}>
                            {ROLE_LABELS[role]}
                          </option>
                        ))}
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button onClick={saveRouting} className="gap-2">
            <Save className="h-4 w-4" />
            Save
          </Button>
        </div>
      </Section>

      {/* ═══════ User Management ═══════ */}
      <Section icon={<Users className="h-5 w-5" />} title="User Management">
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-64">
              <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                Search Users
              </Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <Input
                  placeholder="Name, username, or email..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Label className="mb-1 block text-xs text-gray-500 dark:text-gray-400">
                Filter by Role
              </Label>
              <Select
                value={userRoleFilter}
                onChange={(e) => setUserRoleFilter(e.target.value as UserRole | 'All')}
              >
                <option value="All">All Roles</option>
                {(Object.entries(ROLE_LABELS) as [UserRole, string][]).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            {filteredUsers.length} user(s) shown (read-only)
          </p>

          {/* User Table */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Username
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    City
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    Email
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      {u.fullName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {u.username}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {ROLE_LABELS[u.role]}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {u.city}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={u.isActive ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {u.email}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      {/* ═══════ Cities & Routes ═══════ */}
      <Section icon={<Settings className="h-5 w-5" />} title="Cities & Routes">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Cities */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Cities ({settings.cities.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {settings.cities.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-purple-50 px-3 py-1 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* Routes */}
          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
              Routes ({settings.routes.length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {settings.routes.map((r) => (
                <span
                  key={r}
                  className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400"
                >
                  {r}
                </span>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
