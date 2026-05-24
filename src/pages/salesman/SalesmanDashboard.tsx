import { Link } from 'react-router-dom';
import { ArrowLeft, PackageX } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuthStore } from '@/stores/authStore';

export function SalesmanDashboard() {
  const profile = useAuthStore((s) => s.profile);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`مرحباً ${profile?.full_name?.split(' ')[0] ?? ''}`.trim() || 'مرحباً'}
        description="لوحة تحكم المندوب"
      />

      <section className="space-y-4">
        <h2 className="text-h2 text-foreground">الإجراءات المتاحة</h2>

        <Link to="/salesman/near-expiry" className="group block">
          <Card className="flex items-start gap-4 p-5 transition-all hover:border-primary/40 hover:shadow-md">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <PackageX className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-base font-medium text-foreground">قارب على الانتهاء</p>
              <p className="text-sm text-muted-foreground">
                تسجيل منتجات قاربت على انتهاء الصلاحية مع صورة وتفاصيل
              </p>
            </div>
            <ArrowLeft className="mt-2 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
          </Card>
        </Link>
      </section>

      <Card className="p-6 text-center">
        <p className="text-sm text-muted-foreground">
          لتسجيل الزيارات وإدارة العملاء، تواصل مع المشرف المباشر.
        </p>
      </Card>
    </div>
  );
}
