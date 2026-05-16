import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pencil, Plus, Search, Loader2, Package2, MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { ErrorState } from '@/components/shared/ErrorState';
import { useReasonsAdmin, useUpsertReason } from '@/hooks/useReasonsAdmin';
import { useProductsAdmin, useUpsertProduct } from '@/hooks/useProductsAdmin';
import { useAuthStore } from '@/stores/authStore';
import {
  visitReasonEditSchema,
  type VisitReasonEditValues,
  productEditSchema,
  type ProductEditValues,
} from '@/lib/schemas';
import type { Product, VisitReason } from '@/lib/types';

const PAGE_SIZE = 50;

type Tab = 'reasons' | 'products';

export function SettingsPage() {
  const [tab, setTab] = useState<Tab>('reasons');

  return (
    <div className="space-y-5">
      <PageHeader
        title="إعدادات النظام"
        description="إدارة أسباب الزيارة وكتالوج المنتجات"
        back="/admin"
      />

      <div className="flex gap-2 border-b border-border">
        <TabButton
          active={tab === 'reasons'}
          onClick={() => setTab('reasons')}
          icon={MessageSquareText}
          label="أسباب الزيارة"
        />
        <TabButton
          active={tab === 'products'}
          onClick={() => setTab('products')}
          icon={Package2}
          label="المنتجات"
        />
      </div>

      {tab === 'reasons' ? <ReasonsSection /> : <ProductsSection />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        '-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function ReasonsSection() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const reasonsQ = useReasonsAdmin();
  const upsert = useUpsertReason();
  const [editing, setEditing] = useState<VisitReason | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          إضافة سبب
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {reasonsQ.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : reasonsQ.isError ? (
          <div className="p-5">
            <ErrorState
              message={(reasonsQ.error as Error)?.message}
              onRetry={() => reasonsQ.refetch()}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 text-start font-medium">العربية</th>
                  <th className="px-5 py-3 text-start font-medium">English</th>
                  <th className="px-5 py-3 text-start font-medium">يطبّق على</th>
                  <th className="px-5 py-3 text-start font-medium">الحالة</th>
                  <th className="px-5 py-3 text-end font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(reasonsQ.data ?? []).map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-5 py-3 font-medium text-foreground">{r.label_ar ?? '—'}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.label}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.applies_to ?? '—'}</td>
                    <td className="px-5 py-3">
                      <Badge variant={r.is_active ? 'success' : 'secondary'}>
                        {r.is_active ? 'فعّال' : 'موقوف'}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-end">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setEditing(r)}
                        aria-label="تعديل"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent>
          <ReasonForm
            initial={editing}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSubmit={async (values) => {
              if (!actorId) return;
              try {
                await upsert.mutateAsync({ values, id: editing?.id, actorId });
                toast.success('تم الحفظ');
                setEditing(null);
                setCreating(false);
              } catch (err) {
                toast.error('فشل الحفظ', {
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReasonForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial: VisitReason | null;
  onClose: () => void;
  onSubmit: (v: VisitReasonEditValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<VisitReasonEditValues>({
    resolver: zodResolver(visitReasonEditSchema),
    defaultValues: {
      label: initial?.label ?? '',
      labelAr: initial?.label_ar ?? '',
      appliesTo: initial?.applies_to ?? '',
      isActive: initial?.is_active ?? true,
    },
  });

  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{initial ? 'تعديل سبب الزيارة' : 'سبب جديد'}</DialogTitle>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="labelAr">التسمية بالعربي</Label>
        <Input id="labelAr" {...register('labelAr')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="label">English Label</Label>
        <Input id="label" {...register('label')} />
        {errors.label && <p className="text-caption text-destructive">{errors.label.message}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="appliesTo">يطبّق على (مثل: office, branch)</Label>
        <Input id="appliesTo" {...register('appliesTo')} />
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setValue('isActive', e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        فعّال
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
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

function ProductsSection() {
  const actorId = useAuthStore((s) => s.profile?.id);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const productsQ = useProductsAdmin(page, PAGE_SIZE, search);
  const upsert = useUpsertProduct();
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ابحث بالكود أو الاسم"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pe-10"
          />
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" />
          إضافة منتج
        </Button>
      </div>

      <Card className="overflow-hidden p-0">
        {productsQ.isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : productsQ.isError ? (
          <div className="p-5">
            <ErrorState
              message={(productsQ.error as Error)?.message}
              onRetry={() => productsQ.refetch()}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium">الكود</th>
                    <th className="px-5 py-3 text-start font-medium">العربية</th>
                    <th className="px-5 py-3 text-start font-medium">English</th>
                    <th className="px-5 py-3 text-start font-medium">الفئة</th>
                    <th className="px-5 py-3 text-start font-medium">الحالة</th>
                    <th className="px-5 py-3 text-end font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {productsQ.data?.rows.map((p) => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {p.product_code}
                      </td>
                      <td className="px-5 py-3 font-medium text-foreground">
                        {p.product_name_ar ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.product_name}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.category ?? '—'}</td>
                      <td className="px-5 py-3">
                        <Badge variant={p.is_active ? 'success' : 'secondary'}>
                          {p.is_active ? 'فعّال' : 'موقوف'}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditing(p)}
                          aria-label="تعديل"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={productsQ.data?.total ?? 0}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>

      <Dialog
        open={editing !== null || creating}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent>
          <ProductForm
            initial={editing}
            onClose={() => {
              setEditing(null);
              setCreating(false);
            }}
            onSubmit={async (values) => {
              if (!actorId) return;
              try {
                await upsert.mutateAsync({ values, id: editing?.id, actorId });
                toast.success('تم الحفظ');
                setEditing(null);
                setCreating(false);
              } catch (err) {
                toast.error('فشل الحفظ', {
                  description: err instanceof Error ? err.message : undefined,
                });
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function ProductForm({
  initial,
  onClose,
  onSubmit,
}: {
  initial: Product | null;
  onClose: () => void;
  onSubmit: (v: ProductEditValues) => Promise<void>;
}) {
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ProductEditValues>({
    resolver: zodResolver(productEditSchema),
    defaultValues: {
      productCode: initial?.product_code ?? '',
      productName: initial?.product_name ?? '',
      productNameAr: initial?.product_name_ar ?? '',
      category: initial?.category ?? '',
      isActive: initial?.is_active ?? true,
    },
  });

  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <DialogHeader>
        <DialogTitle>{initial ? 'تعديل المنتج' : 'منتج جديد'}</DialogTitle>
      </DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="productCode">الكود</Label>
          <Input id="productCode" {...register('productCode')} />
          {errors.productCode && (
            <p className="text-caption text-destructive">{errors.productCode.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="category">الفئة</Label>
          <Input id="category" {...register('category')} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="productNameAr">الاسم بالعربي</Label>
        <Input id="productNameAr" {...register('productNameAr')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="productName">English Name</Label>
        <Input id="productName" {...register('productName')} />
        {errors.productName && (
          <p className="text-caption text-destructive">{errors.productName.message}</p>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setValue('isActive', e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        فعّال
      </label>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
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
