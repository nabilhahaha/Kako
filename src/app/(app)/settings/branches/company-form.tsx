'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createCompany } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function CompanyForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createCompany(formData);
      if (!res.ok) {
        setError(res.error ?? 'حدث خطأ');
        toast.error(res.error ?? 'حدث خطأ');
        return;
      }
      toast.success('تم إنشاء الشركة');
      router.refresh();
    });
  }

  return (
    <Card className="max-w-lg">
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name_ar">اسم الشركة (عربي)</Label>
            <Input id="name_ar" name="name_ar" placeholder="شركة النور للتجارة" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="name">اسم الشركة (إنجليزي) *</Label>
            <Input id="name" name="name" required placeholder="Al Noor Trading" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tax_number">الرقم الضريبي</Label>
              <Input id="tax_number" name="tax_number" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">الهاتف</Label>
              <Input id="phone" name="phone" dir="ltr" />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الشركة
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
