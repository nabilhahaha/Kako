import Link from 'next/link';
import { Inbox, ArrowRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/** One-tap entry to the Field Requests hub ("الطلبات"), shown on the Today /
 *  workspace screens. The hub itself permission-gates each request type
 *  (Load · Cash handover · Reopen · Customer …); this is pure navigation. */
export function FieldRequestsEntry({ title, desc }: { title: string; desc: string }) {
  return (
    <Link href="/field/van-sales/requests" className="block">
      <Card className="border-primary/30 transition-colors hover:bg-primary/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Inbox className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{title}</p>
            <p className="text-sm text-muted-foreground">{desc}</p>
          </div>
          <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground rtl:rotate-180" />
        </CardContent>
      </Card>
    </Link>
  );
}
