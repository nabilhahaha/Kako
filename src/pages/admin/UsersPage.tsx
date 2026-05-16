import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Search, Loader2, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { ErrorState } from '@/components/shared/ErrorState';
import { ROLE_LABELS_AR } from '@/lib/permissions';
import {
  useUsersAdmin,
  useUpdateUser,
  useDeactivateUser,
} from '@/hooks/useUsersAdmin';
import { useAuthStore } from '@/stores/authStore';
import { userEditSchema, type UserEditValues } from '@/lib/schemas';
import type { AppUser, UserRole } from '@/lib/types';

const PAGE_SIZE = 50;
const ROLES: UserRole[] = [
  'admin_relia',
  'presales_rep',
  'presales_supervisor',
  'cashvan_supervisor',
  'regional_manager_roshen',
  'trade_marketing_manager',
  'top_management_relia',
  'top_management_roshen',
];

export function UsersPage() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<AppUser | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<AppUser | null>(null);

  const usersQ = useUsersAdmin(page, PAGE_SIZE, search);
  const update = useUpdateUser();
  const deactivate = useDeactivateUser();

  return (
    <div className="space-y-5">
      <PageHeader
        title="إدارة المستخدمين"
        description="عيّن الأدوار والمشرفين، أو عطّل المستخدمين"
        back="/admin"
      />

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="ابحث بالاسم أو البريد"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
          className="pe-10"
        />
      </div>

      <Card className="overflow-hidden p-0">
        {usersQ.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : usersQ.isError ? (
          <div className="p-5">
            <ErrorState
              message={(usersQ.error as Error)?.message}
              onRetry={() => usersQ.refetch()}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium">الاسم</th>
                    <th className="px-5 py-3 text-start font-medium">البريد</th>
                    <th className="px-5 py-3 text-start font-medium">الدور</th>
                    <th className="px-5 py-3 text-start font-medium">الإقليم</th>
                    <th className="px-5 py-3 text-start font-medium">الحالة</th>
                    <th className="px-5 py-3 text-end font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {usersQ.data?.rows.map((u) => (
                    <tr key={u.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-medium text-foreground">
                        {u.full_name ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{u.email}</td>
                      <td className="px-5 py-3">
                        {u.user_type ? ROLE_LABELS_AR[u.user_type] : '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">
                        {u.region ?? '—'}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={u.is_active ? 'success' : 'secondary'}>
                          {u.is_active ? 'نشط' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditing(u)}
                            aria-label="تعديل"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {u.is_active && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setConfirmDeactivate(u)}
                              aria-label="تعطيل"
                              className="text-destructive hover:bg-destructive/10"
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={usersQ.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          {editing && (
            <EditUserForm
              user={editing}
              onClose={() => setEditing(null)}
              onSubmit={async (values) => {
                if (!actorId) return;
                try {
                  await update.mutateAsync({ userId: editing.id, values, actorId });
                  toast.success('تم الحفظ');
                  setEditing(null);
                } catch (err) {
                  toast.error('فشل الحفظ', {
                    description: err instanceof Error ? err.message : undefined,
                  });
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
        title="تعطيل المستخدم؟"
        description={`${confirmDeactivate?.full_name ?? confirmDeactivate?.email} سيُمنع من الدخول. يمكن إعادة تفعيله لاحقًا.`}
        destructive
        confirmLabel="تعطيل"
        onConfirm={async () => {
          if (!actorId || !confirmDeactivate) return;
          try {
            await deactivate.mutateAsync({ userId: confirmDeactivate.id, actorId });
            toast.success('تم التعطيل');
          } catch (err) {
            toast.error('فشل التعطيل', {
              description: err instanceof Error ? err.message : undefined,
            });
          }
        }}
      />
    </div>
  );
}

interface EditUserFormProps {
  user: AppUser;
  onClose: () => void;
  onSubmit: (values: UserEditValues) => Promise<void>;
}

function EditUserForm({ user, onClose, onSubmit }: EditUserFormProps) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<UserEditValues>({
    resolver: zodResolver(userEditSchema),
    defaultValues: {
      fullName: user.full_name ?? '',
      user_type: (user.user_type ?? 'presales_rep') as UserRole,
      region: user.region ?? '',
      supervisorId: user.supervisor_id,
      isActive: user.is_active,
    },
  });

  const role = watch('user_type');
  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>تعديل {user.email}</DialogTitle>
        <DialogDescription>
          ملاحظة: إنشاء مستخدم جديد يتم عبر Supabase Auth مباشرة (الجلسة الحالية بصلاحية محدودة).
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-2">
        <Label htmlFor="fullName">الاسم الكامل</Label>
        <Input id="fullName" {...register('fullName')} />
        {errors.fullName && (
          <p className="text-caption text-destructive">{errors.fullName.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">الدور</Label>
        <select
          id="role"
          value={role}
          onChange={(e) => setValue('user_type', e.target.value as UserRole, { shouldValidate: true })}
          className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS_AR[r]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="region">الإقليم</Label>
        <Input id="region" placeholder="مثل: Jeddah" {...register('region')} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setValue('isActive', e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        نشط
      </label>

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
          إلغاء
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
          حفظ
        </Button>
      </DialogFooter>
    </form>
  );
}
