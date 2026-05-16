import { useMemo, useState } from 'react';
import { Search, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { SkeletonRow } from '@/components/shared/SkeletonCard';
import { CustomerCard } from '@/components/customer/CustomerCard';
import { useCustomers } from '@/hooks/useCustomers';
import { useAuthStore } from '@/stores/authStore';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'A', label: 'A' },
  { key: 'B', label: 'B' },
  { key: 'C', label: 'C' },
  { key: 'overdue', label: 'متأخرات' },
] as const;

type Filter = (typeof FILTERS)[number]['key'];

export function CustomersListPage() {
  const userId = useAuthStore((s) => s.profile?.id);
  const { data, isLoading, isError, refetch, error } = useCustomers(userId);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (filter === 'A' && c.customer_grade !== 'A') return false;
      if (filter === 'B' && c.customer_grade !== 'B') return false;
      if (filter === 'C' && c.customer_grade !== 'C') return false;
      if (filter === 'overdue' && !(Number(c.overdue_amount ?? 0) > 0)) return false;
      if (!q) return true;
      const haystack = [c.customer_name, c.customer_name_ar, c.customer_code]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [data, search, filter]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="عملائي"
        description={`${data?.length ?? 0} عميل مُعيّن لك`}
      />

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="ابحث بالاسم أو الكود"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pe-10"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                filter === f.key
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:text-foreground',
              )}
            >
              {f.label}
            </button>
          ))}
          <Badge variant="secondary" className="ms-auto">
            {filtered.length} نتيجة
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="لا توجد نتائج"
          description={
            search || filter !== 'all'
              ? 'جرّب تعديل البحث أو إزالة الفلتر.'
              : 'لم يتم تعيين عملاء لك حتى الآن.'
          }
          actionLabel={search || filter !== 'all' ? 'مسح الفلاتر' : undefined}
          onAction={() => {
            setSearch('');
            setFilter('all');
          }}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((c) => (
            <CustomerCard
              key={c.id}
              customer={c}
              to={`/salesman/customers/${c.id}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
