/** Audit Log — complete, append-only trail of every action. */
import { ScrollText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAuditLogs } from '../hooks/queries';
import { EmptyState, PageHeader } from '../components/primitives';
import { formatDateTime } from '../utils/format';

export function AuditLogPage() {
  const { data: logs, isLoading } = useAuditLogs();

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="Every upload, validation, exception and change — nothing is lost." />

      {isLoading ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : (logs ?? []).length === 0 ? (
        <EmptyState icon={<ScrollText className="h-8 w-8" />} title="No audit entries yet" />
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>User</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(logs ?? []).map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(log.timestamp)}
                  </TableCell>
                  <TableCell>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{log.summary}</TableCell>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{log.user}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
