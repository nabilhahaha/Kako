'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  // The recovery link establishes a temporary session (detected from the URL).
  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) {
      toast.error('كلمة المرور يجب ألا تقل عن ٦ أحرف.');
      return;
    }
    if (password !== confirm) {
      toast.error('كلمتا المرور غير متطابقتين.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('تم تغيير كلمة المرور. سجّل الدخول الآن.');
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        {!ready ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            جارٍ التحقق من رابط الاستعادة… إذا لم يظهر النموذج، فقد يكون الرابط منتهي الصلاحية — اطلب رابطاً جديداً.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور الجديدة</Label>
              <Input id="password" type="password" dir="ltr" className="text-left"
                value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
              <Input id="confirm" type="password" dir="ltr" className="text-left"
                value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ كلمة المرور
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
