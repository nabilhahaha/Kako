import { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { nearExpirySchema, type NearExpiryValues } from '@/lib/schemas';
import { useCustomers } from '@/hooks/useCustomers';
import { useProducts, useCreateNearExpiry } from '@/hooks/useNearExpiry';
import { useAuthStore } from '@/stores/authStore';

export function NearExpiryForm({ onSuccess }: { onSuccess?: () => void }) {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;

  const customersQ = useCustomers(userId);
  const productsQ = useProducts();
  const mutation = useCreateNearExpiry();

  const cameraRef = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<NearExpiryValues>({
    resolver: zodResolver(nearExpirySchema),
    defaultValues: {
      customerId: '',
      productId: '',
      quantity: 1,
      expiryDate: '',
      notes: '',
    },
  });

  const customerId = watch('customerId');
  const productId = watch('productId');

  function handlePhoto(file: File | null) {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhoto(file);
    setPhotoPreview(file ? URL.createObjectURL(file) : null);
  }

  async function onSubmit(values: NearExpiryValues) {
    if (!userId) return;
    try {
      await mutation.mutateAsync({ values, photo, reportedBy: userId });
      toast.success('تم تسجيل المنتج بنجاح');
      reset();
      handlePhoto(null);
      onSuccess?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'تعذّر التسجيل';
      toast.error('فشل التسجيل', { description: message });
    }
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="customer">العميل</Label>
        {customersQ.isLoading ? (
          <Skeleton className="h-11 w-full rounded-lg" />
        ) : (
          <select
            id="customer"
            value={customerId}
            onChange={(e) => setValue('customerId', e.target.value, { shouldValidate: true })}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— اختر العميل —</option>
            {customersQ.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.customer_name_ar || c.customer_name || c.customer_code}
              </option>
            ))}
          </select>
        )}
        {errors.customerId && (
          <p className="text-caption text-destructive">{errors.customerId.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="product">المنتج</Label>
        {productsQ.isLoading ? (
          <Skeleton className="h-11 w-full rounded-lg" />
        ) : (
          <select
            id="product"
            value={productId}
            onChange={(e) => setValue('productId', e.target.value, { shouldValidate: true })}
            className="flex h-11 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— اختر المنتج —</option>
            {productsQ.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.product_name_ar || p.product_name} — {p.product_code}
              </option>
            ))}
          </select>
        )}
        {errors.productId && (
          <p className="text-caption text-destructive">{errors.productId.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="quantity">الكمية</Label>
          <Input
            id="quantity"
            type="number"
            inputMode="numeric"
            min={1}
            {...register('quantity', { valueAsNumber: true })}
          />
          {errors.quantity && (
            <p className="text-caption text-destructive">{errors.quantity.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="expiry">تاريخ الانتهاء</Label>
          <Input
            id="expiry"
            type="date"
            min={today}
            {...register('expiryDate')}
          />
          {errors.expiryDate && (
            <p className="text-caption text-destructive">{errors.expiryDate.message}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>صورة المنتج (اختياري)</Label>
        <input
          ref={cameraRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => handlePhoto(e.target.files?.[0] ?? null)}
        />
        {photoPreview ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-muted">
            <img src={photoPreview} alt="معاينة" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => handlePhoto(null)}
              className="absolute end-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-background/90 text-destructive shadow-sm hover:bg-background"
              aria-label="حذف الصورة"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-auto w-full py-4"
            onClick={() => cameraRef.current?.click()}
          >
            <Camera className="h-4 w-4" />
            التقاط صورة
          </Button>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">ملاحظات</Label>
        <Textarea id="notes" rows={3} {...register('notes')} />
        {errors.notes && (
          <p className="text-caption text-destructive">{errors.notes.message}</p>
        )}
      </div>

      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            جاري التسجيل...
          </>
        ) : (
          'حفظ التسجيل'
        )}
      </Button>
    </form>
  );
}
