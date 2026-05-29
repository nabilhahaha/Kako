'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2, Rocket } from 'lucide-react';
import { BUSINESS_TYPE_LABELS, BUSINESS_TYPES } from '@/lib/erp/subscription';

const TRIAL_DAYS = 14;
const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function RegisterForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const full_name = String(fd.get('full_name') || '').trim();
    const email = String(fd.get('email') || '').trim().toLowerCase();
    const password = String(fd.get('password') || '');
    const company_name = String(fd.get('company_name') || '').trim();
    const company_name_ar = String(fd.get('company_name_ar') || '').trim();
    const business_type = String(fd.get('business_type') || 'general');

    if (!company_name && !company_name_ar) {
      toast.error('اسم الشركة مطلوب.');
      return;
    }
    if (password.length < 6) {
      toast.error('كلمة المرور يجب أن تكون ٦ أحرف على الأقل.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name } },
    });
    if (error) {
      setLoading(false);
      toast.error(error.message || 'تعذّر إنشاء الحساب.');
      return;
    }

    // signUp returns a session only when email confirmation is off. Emails are
    // auto-confirmed server-side (trigger), so if we don't get a session we can
    // sign in immediately with the same credentials to obtain one.
    if (!data.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) {
        setLoading(false);
        toast.error('تم إنشاء الحساب. سجّل الدخول لإكمال إنشاء شركتك.');
        router.push('/login');
        return;
      }
    }

    // Authenticated now → provision the company (free trial).
    const { error: rpcErr } = await supabase.rpc('erp_self_register_company', {
      p_company_name: company_name || company_name_ar,
      p_company_name_ar: company_name_ar || null,
      p_business_type: business_type,
      p_trial_days: TRIAL_DAYS,
    });
    setLoading(false);
    if (rpcErr) {
      toast.error(rpcErr.message || 'تعذّر إنشاء الشركة.');
      return;
    }
    toast.success('تم إنشاء شركتك وبدأت تجربتك المجانية 🎉');
    window.location.href = '/dashboard';
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-secondary/30 p-4">
      <Card className="w-full max-w-md">
        <CardContent className="space-y-5 pt-6">
          <div className="text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Rocket className="h-6 w-6" />
            </div>
            <h1 className="text-xl font-bold">أنشئ شركتك وابدأ مجاناً</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              تجربة مجانية {TRIAL_DAYS} يوم — بدون بطاقة ائتمان.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="company_name_ar">اسم الشركة *</Label>
              <Input id="company_name_ar" name="company_name_ar" placeholder="مثال: شركة كاكو للتوزيع" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company_name">اسم الشركة (إنجليزي)</Label>
              <Input id="company_name" name="company_name" dir="ltr" placeholder="Kako Distribution" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="business_type">نوع النشاط</Label>
              <select id="business_type" name="business_type" className={selectCls} defaultValue="general">
                {BUSINESS_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BUSINESS_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div className="border-t pt-4 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">اسمك</Label>
                <Input id="full_name" name="full_name" placeholder="الاسم الكامل" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني *</Label>
                <Input id="email" name="email" type="email" dir="ltr" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور *</Label>
                <Input id="password" name="password" type="password" dir="ltr" required minLength={6} />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              ابدأ التجربة المجانية
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            لديك حساب بالفعل؟{' '}
            <Link href="/login" className="text-primary hover:underline">
              تسجيل الدخول
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
