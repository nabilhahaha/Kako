import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  UserCheck,
  UserX,
  ShieldAlert,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
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
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function UsersPage() {
  const { t } = useTranslation();

  /* --- Store --- */
  const users = useTradeSpendStore((s) => s.users);
  const addUser = useTradeSpendStore((s) => s.addUser);
  const updateUser = useTradeSpendStore((s) => s.updateUser);
  const deleteUser = useTradeSpendStore((s) => s.deleteUser);
  const currentUser = useTradeSpendStore((s) => s.currentUser);
  const isAdmin = currentUser?.roles.includes('admin') ?? false;

  /* --- Local UI state --- */
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<TradeSpendUser | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  /* --- Form fields --- */
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRoles, setFormRoles] = useState<TradeSpendRole[]>([]);
  const [formActive, setFormActive] = useState(true);

  /* --- Filtered list --- */
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      (u) =>
        u.display_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [users, search]);

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
      updateUser(editingUser.id, {
        display_name: formName.trim(),
        email: formEmail.trim(),
        roles: formRoles,
        active: formActive,
      });
    } else {
      addUser({
        display_name: formName.trim(),
        email: formEmail.trim(),
        roles: formRoles,
        active: formActive,
        password: 'Roshen2026',
      });
    }

    setDialogOpen(false);
    resetForm();
  }

  function handleToggleActive(user: TradeSpendUser) {
    updateUser(user.id, { active: !user.active });
  }

  function confirmDelete(userId: string) {
    deleteUser(userId);
    setDeletingUserId(null);
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
        <h1 className="heading-2">{t('users.title', 'User Management')}</h1>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="me-1.5 h-4 w-4" />
          {t('users.addUser', 'Add User')}
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full">
        <Search className="absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={t('users.search', 'Search by name or email...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ps-9 h-10 text-sm"
        />
      </div>

      {/* Count */}
      <p className="text-sm text-muted-foreground">
        {t('users.showing', 'Showing')} {filteredUsers.length}{' '}
        {t('users.of', 'of')} {users.length} {t('users.users', 'users')}
      </p>

      {/* User Cards */}
      {filteredUsers.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t('common.noData', 'No data')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((user) => (
            <Card
              key={user.id}
              className={`transition-colors ${!user.active ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-4">
                {/* Top row: avatar + info */}
                <div className="flex items-start gap-3">
                  {/* Avatar */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                    {getInitials(user.display_name)}
                  </div>

                  {/* Name / Email / Status */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {user.display_name}
                      </p>
                      {user.active ? (
                        <Badge variant="success" className="text-[10px] px-1.5 py-0">
                          {t('users.active', 'Active')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {t('users.inactive', 'Inactive')}
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {user.email}
                    </p>
                    {isAdmin && (
                      <p className="text-[10px] text-muted-foreground/60 font-mono">
                        🔑 {user.password}
                      </p>
                    )}
                  </div>
                </div>

                {/* Role badges */}
                <div className="mt-3 flex flex-wrap gap-1">
                  {user.roles.map((role) => (
                    <span
                      key={role}
                      className={`inline-flex items-center rounded-full border-transparent px-2 py-0.5 text-[11px] font-medium ${ROLE_COLORS[role]}`}
                    >
                      {t(`roles.${role}`, role)}
                    </span>
                  ))}
                  {user.roles.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">
                      {t('users.noRoles', 'No roles assigned')}
                    </span>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex items-center gap-1 border-t border-border pt-3">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    title={t('common.edit', 'Edit')}
                    onClick={() => openEditDialog(user)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">
                      {t('common.edit', 'Edit')}
                    </span>
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    title={
                      user.active
                        ? t('users.deactivate', 'Deactivate')
                        : t('users.activate', 'Activate')
                    }
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.active ? (
                      <UserX className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <UserCheck className="h-3.5 w-3.5 text-success" />
                    )}
                    <span className="hidden sm:inline">
                      {user.active
                        ? t('users.deactivate', 'Deactivate')
                        : t('users.activate', 'Activate')}
                    </span>
                  </Button>

                  <div className="flex-1" />

                  {/* Delete with inline confirmation */}
                  {deletingUserId === user.id ? (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-destructive font-medium me-1">
                        {t('common.areYouSure', 'Are you sure?')}
                      </span>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => confirmDelete(user.id)}
                      >
                        {t('common.confirm', 'Confirm')}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDeletingUserId(null)}
                      >
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      title={t('common.delete', 'Delete')}
                      onClick={() => setDeletingUserId(user.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
