'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { upsertWarehouse, toggleWarehouseActive } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { Branch, Profile, Warehouse } from '@/lib/erp/types';
import { Plus, Pencil, Loader2, X, Warehouse as WarehouseIcon, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { useI18n } from '@/lib/i18n/provider';

export function WarehousesManager({
  warehouses,
  branches,
  profiles,
}: {
  warehouses: Warehouse[];
  branches: Branch[];
  profiles: Pick<Profile, 'id' | 'full_name' | 'email'>[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [editing, setEditing] = useState<Warehouse | null | 'new'>(null);
  const [isVan, setIsVan] = useState(false);
  const [pending, startTransition] = useTransition();

  const userName = (id: string | null) => {
    if (!id) return '';
    const u = profiles.find((p) => p.id === id);
    return u?.full_name || u?.email || '';
  };

  const branchName = (id: string) => {
    const b = branches.find((x) => x.id === id);
    return b ? `${b.code} · ${b.name_ar || b.name}` : '—';
  };

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await upsertWarehouse(formData);
      if (!res.ok) {
        toast.error(res.error ?? t('warehouses.toastError'));
        return;
      }
      toast.success(editing === 'new' ? t('warehouses.toastWarehouseAdded') : t('warehouses.toastWarehouseUpdated'));
      setEditing(null);
      router.refresh();
    });
  }

  function onToggle(w: Warehouse) {
    startTransition(async () => {
      const res = await toggleWarehouseActive(w.id, !w.is_active);
      if (!res.ok) toast.error(res.error ?? t('warehouses.toastError'));
      else router.refresh();
    });
  }

  const current = editing === 'new' ? null : editing;
  const noBranches = branches.length === 0;

  return (
    <div className="space-y-4">
      {editing === null && (
        <Button onClick={() => { setIsVan(false); setEditing('new'); }} disabled={noBranches}>
          <Plus className="h-4 w-4" /> {t('warehouses.btnNewWarehouse')}
        </Button>
      )}
      {noBranches && (
        <p className="text-sm text-warning">
          {t('warehouses.warnNoBranches')}
        </p>
      )}

      {editing !== null && (
        <Card>
          <CardContent className="pt-6">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="font-semibold">
                {editing === 'new'
                  ? t('warehouses.formTitleNew')
                  : t('warehouses.formTitleEdit').replace('{name}', current?.name_ar || current?.name || '')}
              </h3>
              <button onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-secondary">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              {current && <input type="hidden" name="id" value={current.id} />}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t('warehouses.fieldBranch')}>
                  <select name="branch_id" defaultValue={current?.branch_id ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>
                    <option value="">{t('warehouses.branchPlaceholder')}</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>{b.code} · {b.name_ar || b.name}</option>
                    ))}
                  </select>
                </Field>
                <Field label={t('warehouses.fieldCode')}>
                  <Input name="code" dir="ltr" placeholder="WH1" defaultValue={current?.code ?? ''} required />
                </Field>
                <Field label={t('warehouses.fieldNameAr')}>
                  <Input name="name_ar" placeholder={t('warehouses.nameArPlaceholder')} defaultValue={current?.name_ar ?? ''} />
                </Field>
                <Field label={t('warehouses.fieldNameEn')}>
                  <Input name="name" placeholder="Main Warehouse" defaultValue={current?.name ?? ''} required />
                </Field>
                <Field label={t('warehouses.fieldLocation')}>
                  <Input name="location" defaultValue={current?.location ?? ''} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="is_van" checked={isVan} onChange={(e) => setIsVan(e.target.checked)} className="h-4 w-4" />
                {t('warehouses.checkboxIsVan')}
              </label>
              {isVan && (
                <Field label={t('warehouses.fieldAssignedTo')}>
                  <select name="assigned_to" defaultValue={current?.assigned_to ?? ''} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">{t('warehouses.noRepOption')}</option>
                    {profiles.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name || u.email}</option>
                    ))}
                  </select>
                </Field>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />} {t('warehouses.btnSave')}
                </Button>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>{t('warehouses.btnCancel')}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {warehouses.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
            <WarehouseIcon className="h-8 w-8" />
            <p>{t('warehouses.emptyWarehouses')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{w.code}</Badge>
                      {w.is_van && (
                        <Badge variant="secondary" className="gap-1">
                          <Truck className="h-3 w-3" /> {t('warehouses.vanBadge')}
                        </Badge>
                      )}
                      {!w.is_active && <Badge variant="destructive">{t('warehouses.inactiveBadge')}</Badge>}
                    </div>
                    <p className="mt-2 truncate font-semibold">{w.name_ar || w.name}</p>
                    <p className="text-sm text-muted-foreground">{branchName(w.branch_id)}</p>
                    {w.is_van && w.assigned_to && (
                      <p className="text-xs text-muted-foreground">
                        {t('warehouses.repLabel').replace('{name}', userName(w.assigned_to))}
                      </p>
                    )}
                    {w.location && <p className="text-xs text-muted-foreground">{w.location}</p>}
                  </div>
                  <button
                    onClick={() => { setIsVan(w.is_van); setEditing(w); }}
                    className="rounded-md p-1.5 hover:bg-secondary"
                    aria-label={t('warehouses.ariaEdit')}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 border-t pt-3">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => onToggle(w)} className="text-xs">
                    {w.is_active ? t('warehouses.btnDeactivate') : t('warehouses.btnActivate')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
