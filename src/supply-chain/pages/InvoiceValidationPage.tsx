/**
 * Invoice Validation — surfaces the Delivery Note ↔ Invoice relationship
 * checks: delivery without invoice, invoice without delivery, quantity
 * mismatch, missing invoice and duplicate invoice.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileCheck2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useValidationResults } from '../hooks/queries';
import { SeverityBadge } from '../components/badges';
import { EmptyState, PageHeader, StatTile } from '../components/primitives';

const CATEGORIES: { code: string; title: string; description: string }[] = [
  { code: 'DELIVERY_WITHOUT_INVOICE', title: 'Delivery without Invoice', description: 'Delivered but not yet invoiced.' },
  { code: 'INVOICE_WITHOUT_DELIVERY', title: 'Invoice without Delivery', description: 'Invoiced with no backing delivery.' },
  { code: 'INVOICE_QTY_MISMATCH', title: 'Quantity Mismatch', description: 'Invoiced quantity differs from delivered.' },
  { code: 'MISSING_INVOICE', title: 'Missing Invoice', description: 'Fully delivered PI with no invoice.' },
  { code: 'INVOICE_DUPLICATE', title: 'Duplicate Invoice', description: 'Invoice number used more than once.' },
];

const INVOICE_RULE_CODES = new Set(CATEGORIES.map((c) => c.code));

export function InvoiceValidationPage() {
  const { data: results, isLoading } = useValidationResults();
  const navigate = useNavigate();

  const relevant = useMemo(
    () => (results ?? []).filter((r) => INVOICE_RULE_CODES.has(r.ruleCode)),
    [results],
  );

  const byCode = useMemo(() => {
    const map = new Map<string, typeof relevant>();
    for (const r of relevant) {
      const arr = map.get(r.ruleCode) ?? [];
      arr.push(r);
      map.set(r.ruleCode, arr);
    }
    return map;
  }, [relevant]);

  const issues = relevant.filter((r) => r.severity !== 'pass');

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Validation"
        description="Relationship checks between Delivery Notes and Invoices."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORIES.map((c) => {
          const items = (byCode.get(c.code) ?? []).filter((r) => r.severity !== 'pass');
          return (
            <StatTile
              key={c.code}
              label={c.title}
              value={items.length}
              className={items.length > 0 ? 'border-warning/40' : ''}
            />
          );
        })}
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 className="h-8 w-8" />}
          title="No invoice issues"
          description="Every delivery and invoice reconciles cleanly, or no invoices have been entered yet."
        />
      ) : (
        <div className="space-y-5">
          {CATEGORIES.map((c) => {
            const items = (byCode.get(c.code) ?? []).filter((r) => r.severity !== 'pass');
            if (items.length === 0) return null;
            return (
              <Card key={c.code}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base">
                    {c.title}{' '}
                    <span className="text-sm font-normal text-muted-foreground">· {items.length}</span>
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">{c.description}</p>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Severity</TableHead>
                        <TableHead>PI</TableHead>
                        <TableHead>Details</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((r) => (
                        <TableRow
                          key={r.id}
                          className={r.piId ? 'cursor-pointer' : ''}
                          onClick={() => r.piId && navigate(`/supply-chain/pi/${r.piId}`)}
                        >
                          <TableCell><SeverityBadge severity={r.severity} /></TableCell>
                          <TableCell className="whitespace-nowrap font-medium text-maroon">
                            {r.piNumber || '—'}
                          </TableCell>
                          <TableCell className="text-sm">{r.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
