import { useState } from 'react';
import { Activity } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { arSA } from 'date-fns/locale';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';
import { DataTablePagination } from '@/components/shared/DataTablePagination';
import { useAuditLogs } from '@/hooks/useAuditLogs';

const PAGE_SIZE = 50;

const ACTION_VARIANTS: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
  create: 'success',
  update: 'info',
  deactivate: 'destructive',
  delete: 'destructive',
  raw_data_upload: 'warning',
};

export function AuditLogsPage() {
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, error, refetch } = useAuditLogs(page, PAGE_SIZE);

  return (
    <div className="space-y-5">
      <PageHeader
        title="سجل النشاط"
        description="آخر الإجراءات على النظام"
        back="/admin"
      />

      <Card className="overflow-hidden p-0">
        {isLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="p-5">
            <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />
          </div>
        ) : !data?.rows.length ? (
          <div className="p-5">
            <EmptyState
              icon={Activity}
              title="لا توجد سجلات بعد"
              description="ستظهر هنا الإجراءات بمجرد قيام المسؤولين بأي عملية."
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 text-start font-medium">الوقت</th>
                    <th className="px-5 py-3 text-start font-medium">الإجراء</th>
                    <th className="px-5 py-3 text-start font-medium">الكيان</th>
                    <th className="px-5 py-3 text-start font-medium">المعرف</th>
                    <th className="px-5 py-3 text-start font-medium">تفاصيل</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.rows.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/30">
                      <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: arSA,
                        })}
                      </td>
                      <td className="px-5 py-3">
                        <Badge
                          variant={ACTION_VARIANTS[log.action] ?? 'secondary'}
                          className="font-mono text-[10px]"
                        >
                          {log.action}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-foreground">{log.entity}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                        {log.entity_id ?? '—'}
                      </td>
                      <td className="px-5 py-3 text-caption max-w-md truncate">
                        {log.metadata
                          ? JSON.stringify(log.metadata).slice(0, 80)
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <DataTablePagination
              page={page}
              pageSize={PAGE_SIZE}
              total={data.total}
              onPageChange={setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
