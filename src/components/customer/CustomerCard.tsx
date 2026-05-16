import { ChevronLeft, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { GradeBadge } from './GradeBadge';
import { formatCurrency } from '@/lib/utils';
import type { Customer } from '@/lib/types';

interface CustomerCardProps {
  customer: Customer;
  to: string;
}

export function CustomerCard({ customer, to }: CustomerCardProps) {
  const name = customer.customer_name_ar || customer.customer_name || customer.customer_code;
  const debt = Number(customer.total_debt ?? 0);
  const overdue = Number(customer.overdue_amount ?? 0);

  return (
    <Link to={to} className="group block">
      <Card className="p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-md">
        <div className="flex items-start gap-3">
          <GradeBadge grade={customer.customer_grade} />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate font-medium text-foreground">{name}</p>
            <p className="text-caption">
              {customer.customer_code}
              {customer.channel_type && <> · {customer.channel_type}</>}
            </p>
            {overdue > 0 && (
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive">
                <AlertCircle className="h-3.5 w-3.5" />
                متأخر {formatCurrency(overdue)}
              </div>
            )}
            {overdue === 0 && debt > 0 && (
              <p className="text-caption">المديونية: {formatCurrency(debt)}</p>
            )}
          </div>
          <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
        </div>
      </Card>
    </Link>
  );
}
