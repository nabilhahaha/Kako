import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  Pencil,
  UserCheck,
  UserX,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTradeSpendStore } from '@/stores/tradeSpendStore';
import type { TradeSpendRole, TradeSpendUser } from '@/lib/trade-spend/types';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

const ALL_ROLES: TradeSpendRole[] = [
  'dept_manager',
  'distributor_trade_mktg',
  'roshen_approver',
  'viewer',
  'admin',
];

const ROLE_COLORS: Record<TradeSpendRole, string> = {
  dept_manager:
    'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  distributor_trade_mktg:
    'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  roshen_approver:
    'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  viewer:
    'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  admin:
    'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function UsersPage() {
  const { t } = useTranslation();

  // Pull seed data from store
  const storeUsers = useTradeSpendStore((s) => s.users);

  // Local user list (inline state management -- store has no CRUD methods)
  const [userList, setUserList] = useState<TradeSpendUser[]>([]);
  const [search, setSearch] = useState('');

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TradeSpendUser | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRoles, setFormRoles] = useState<TradeSpendRole[]>([]);
  const [formActive, setFormActive] = useState(true);

  // Seed local list from store on mount
  useEffect(() => {
    setUserList([...storeUsers]);
  }, [storeUsers]);

  // Filtered list
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return userList;
    const q = search.toLowerCase();
    return userList.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [userList, search]);

  /* ---- helpers ---- */

  function resetForm() {
    setFormName('');
    setFormEmail('');
    setFormRoles([]);
    setFormActive(true);
    setEditingUser(null);
  }

  function openAddDialog() {
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(user: TradeSpendUser) {
    setEditingUser(user);
    setFormName(user.display_name);
    setFormEmail(user.email);
    setFormRoles([...user.roles]);
    setFormActive(user.active);
    setDialogOpen(true);
  }

  function toggleRoleInForm(role: TradeSpendRole) {
    setFormRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role],
    );
  }

  function handleSave() {
    if (!formName.trim() || !formEmail.trim()) return;

    if (editingUser) {
      // Update existing
      setUserList((prev) =>
        prev.map((u) =>
          u.id === editingUser.id
            ? {
                ...u,
                display_name: formName.trim(),
                email: formEmail.trim(),
                roles: formRoles,
                active: formActive,
              }
            : u,
        ),
      );
    } else {
      // Create new
      const newUser: TradeSpendUser = {
        id: `user-${Date.now()}`,
        display_name: formName.trim(),
        email: formEmail.trim(),
        roles: formRoles,
        active: formActive,
        created_at: new Date().toISOString(),
      };
      setUserList((prev) => [...prev, newUser]);
    }

    setDialogOpen(false);
    resetForm();
  }

  function toggleActive(userId: string) {
    setUserList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, active: !u.active } : u)),
    );
  }

  /* ---------------------------------------------------------------- */
  /*  Render                                                          */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-6">
      {/* Admin-only notice */}
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
        <ShieldAlert className="h-4 w-4 flex-shrink-0" />
        {t('users.adminOnly', 'This page is restricted to Admin users.')}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="heading-1">{t('users.title', 'User Management')}</h1>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="me-1.5 h-4 w-4" />
          {t('users.addUser', 'Add User')}
        </Button>
      </div>

      {/* Main card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base font-semibold">
              {t('users.allUsers', 'All Users')}
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                ({filteredUsers.length})
              </span>
            </CardTitle>
            <div className="relative w-full max-w-xs">
              <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('users.search', 'Search by name or email...')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="ps-9 h-9 text-sm"
              />
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="pb-3 pe-4 font-medium text-start">
                    {t('users.colName', 'Name')}
                  </th>
                  <th className="pb-3 pe-4 font-medium text-start">
                    {t('users.colEmail', 'Email')}
                  </th>
                  <th className="pb-3 pe-4 font-medium text-start">
                    {t('users.colRoles', 'Roles')}
                  </th>
                  <th className="pb-3 pe-4 font-medium text-start">
                    {t('users.colStatus', 'Status')}
                  </th>
                  <th className="pb-3 font-medium text-start">
                    {t('users.colActions', 'Actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-8 text-center text-muted-foreground"
                    >
                      {t('common.noData', 'No data')}
                    </td>
                  </tr>
                )}

                {filteredUsers.map((user) => (
                  <tr key={user.id} className="group hover:bg-muted/30">
                    {/* Name */}
                    <td className="py-3 pe-4 font-medium">{user.display_name}</td>

                    {/* Email */}
                    <td className="py-3 pe-4 text-muted-foreground">
                      {user.email}
                    </td>

                    {/* Roles */}
                    <td className="py-3 pe-4">
                      <div className="flex flex-wrap gap-1">
                        {user.roles.map((role) => (
                          <span
                            key={role}
                            className={`inline-flex items-center rounded-full border-transparent px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[role]}`}
                          >
                            {t(`roles.${role}`, role)}
                          </span>
                        ))}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 pe-4">
                      {user.active ? (
                        <Badge
                          variant="success"
                          className="text-[11px]"
                        >
                          {t('users.active', 'Active')}
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="text-[11px]"
                        >
                          {t('users.inactive', 'Inactive')}
                        </Badge>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={t('common.edit', 'Edit')}
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          title={
                            user.active
                              ? t('users.deactivate', 'Deactivate')
                              : t('users.activate', 'Activate')
                          }
                          onClick={() => toggleActive(user.id)}
                        >
                          {user.active ? (
                            <UserX className="h-3.5 w-3.5 text-destructive" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5 text-success" />
                          )}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingUser
                ? t('users.editUser', 'Edit User')
                : t('users.addUser', 'Add User')}
            </DialogTitle>
            <DialogDescription>
              {editingUser
                ? t(
                    'users.editUserDesc',
                    'Update user details and role assignments.',
                  )
                : t(
                    'users.addUserDesc',
                    'Create a new user with role assignments.',
                  )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Display Name */}
            <div className="space-y-1.5">
              <Label htmlFor="user-name">
                {t('users.displayName', 'Display Name')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="user-name"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t('users.namePlaceholder', 'e.g. Ahmad Nasser')}
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="user-email">
                {t('users.email', 'Email')}{' '}
                <span className="text-destructive">*</span>
              </Label>
              <Input
                id="user-email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                placeholder={t('users.emailPlaceholder', 'user@company.com')}
              />
            </div>

            {/* Roles (multi-select checkboxes) */}
            <div className="space-y-1.5">
              <Label>{t('users.roles', 'Roles')}</Label>
              <div className="grid grid-cols-1 gap-2 rounded-lg border p-3">
                {ALL_ROLES.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={formRoles.includes(role)}
                      onChange={() => toggleRoleInForm(role)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[role]}`}
                    >
                      {t(`roles.${role}`, role)}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Active toggle */}
            <div className="flex items-center gap-3">
              <Label htmlFor="user-active" className="cursor-pointer">
                {t('users.activeStatus', 'Active')}
              </Label>
              <button
                id="user-active"
                type="button"
                role="switch"
                aria-checked={formActive}
                onClick={() => setFormActive((v) => !v)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
                  formActive ? 'bg-primary' : 'bg-gray-300 dark:bg-gray-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                    formActive
                      ? 'translate-x-6 rtl:-translate-x-6'
                      : 'translate-x-1 rtl:-translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                resetForm();
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button
              onClick={handleSave}
              disabled={!formName.trim() || !formEmail.trim()}
            >
              {editingUser
                ? t('common.save', 'Save')
                : t('users.create', 'Create User')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
