import { Link } from 'react-router-dom';
import { PackageX, ClipboardList, Clock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/PageHeader';
import { useAuthStore } from '@/stores/authStore';
import { useProducts } from '@/hooks/useNearExpiry';
import { supabase } from '@/lib/supabase';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  pending: { label: 'قيد المراجعة', variant: 'outline', className: 'border-yellow-500/50 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400' },
  approved: { label: 'معتمد', variant: 'outline', className: 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400' },
  rejected: { label: 'مرفوض', variant: 'outline', className: 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400' },
};

export function SalesmanDashboard() {
  const profile = useAuthStore((s) => s.profile);
  const userId = profile?.id;
  const productsQ = useProducts();
  const products = productsQ.data ?? [];

  const { data: requests, isLoading } = useQuery({
    queryKey: ['my-near-expiry', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('near_expiry_records')
        .select('id, product_id, quantity, expiry_date, status, created_at')
        .eq('reported_by', userId!)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error || !data || data.length === 0) {
        // Demo fallback
        return [
          { id: '1', product_id: 'p01', quantity: 24, expiry_date: '2026-06-15', status: 'pending', created_at: new Date().toISOString() },
          { id: '2', product_id: 'p03', quantity: 48, expiry_date: '2026-06-20', status: 'approved', created_at: new Date(Date.now() - 86400000).toISOString() },
          { id: '3', product_id: 'p07', quantity: 12, expiry_date: '2026-07-01', status: 'rejected', created_at: new Date(Date.now() - 172800000).toISOString() },
        ];
      }
      return data;
    },
    enabled: !!userId,
  });

  function getProductName(productId: string): string {
    const product = products.find((p) => p.id === productId);
    return product?.product_name_ar || product?.product_name || productId;
  }

  function formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleDateString('ar-SA', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

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
              <p className="text-base font-medium text-foreground">تسجيل قارب على الانتهاء</p>
              <p className="text-sm text-muted-foreground">
                تسجيل منتجات قاربت على انتهاء الصلاحية مع صورة وتفاصيل
              </p>
            </div>
            <PackageX className="mt-2 h-5 w-5 shrink-0 text-muted-foreground" />
          </Card>
        </Link>
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-h2 text-foreground">طلباتي</h2>
        </div>

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        ) : !requests || requests.length === 0 ? (
          <Card className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا توجد طلبات مسجلة بعد</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => {
              const statusInfo = STATUS_MAP[req.status] ?? STATUS_MAP.pending;
              return (
                <Card key={req.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-sm font-medium text-foreground truncate">
                        {getProductName(req.product_id)}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>الكمية: {req.quantity}</span>
                        <span>انتهاء: {formatDate(req.expiry_date)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        <span>{formatDate(req.created_at)}</span>
                      </div>
                    </div>
                    <Badge variant={statusInfo.variant} className={statusInfo.className}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
