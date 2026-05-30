'use client';

import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Plus, Minus, Trash2, Printer, X, CheckCircle2, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

/** Shared presentational primitives for the order/ticket editors of the
 *  restaurant / salon / laundry verticals. These carry no business logic
 *  (totals math and meta forms stay in each vertical) — they only remove the
 *  byte-identical markup that was duplicated across the three editors. */

export const selectCls = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

export interface TileItem { id: string; name: string; price: number }

/** Grid of clickable menu/service tiles (left pane). */
export function ServiceTileGrid({ items, disabled, onPick }: { items: TileItem[]; disabled?: boolean; onPick: (id: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((m) => (
        <button key={m.id} disabled={disabled} onClick={() => onPick(m.id)}
          className="flex flex-col items-center justify-center gap-1 rounded-lg border bg-card p-3 text-center text-sm transition-colors hover:border-primary/50 hover:bg-secondary disabled:opacity-50">
          <span className="font-medium leading-tight">{m.name}</span>
          <span className="tabular-nums text-xs text-muted-foreground" dir="ltr">{formatCurrency(m.price)}</span>
        </button>
      ))}
    </div>
  );
}

/** Quantity +/- control; the decrement button turns into a trash icon at qty 1. */
export function QtyStepper({ qty, disabled, onDec, onInc }: { qty: number; disabled?: boolean; onDec: () => void; onInc: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button size="icon" variant="outline" className="h-6 w-6" disabled={disabled} onClick={onDec}>
        {qty <= 1 ? <Trash2 className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
      </Button>
      <span className="w-5 text-center tabular-nums">{qty}</span>
      <Button size="icon" variant="outline" className="h-6 w-6" disabled={disabled} onClick={onInc}><Plus className="h-3 w-3" /></Button>
    </div>
  );
}

/** A muted label/value row in the totals breakdown. */
export function TotalRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between text-muted-foreground"><span>{label}</span><span className="tabular-nums" dir="ltr">{value}</span></div>;
}

/** Payment-method select + checkout + print + cancel footer. When the document
 *  is closed it collapses to a single print button. */
export function CheckoutFooter({
  closed, pending, canCheckout, payMethod, setPayMethod, onCheckout, onCancel, checkoutLabel, printHref, printLabel,
}: {
  closed: boolean;
  pending: boolean;
  canCheckout: boolean;
  payMethod: string;
  setPayMethod: (v: string) => void;
  onCheckout: () => void;
  onCancel: () => void;
  checkoutLabel: string;
  printHref: string;
  printLabel: string;
}) {
  if (closed) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Link href={printHref} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /> {printLabel}</Link>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className={`${selectCls} h-10`}>
        <option value="cash">كاش</option><option value="card">فيزا</option>
      </select>
      <Button className="flex-1" disabled={pending || !canCheckout} onClick={onCheckout}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {checkoutLabel}
      </Button>
      <Link href={printHref} target="_blank" className={buttonVariants({ variant: 'outline' })}><Printer className="h-4 w-4" /></Link>
      <Button variant="ghost" disabled={pending} onClick={onCancel}><X className="h-4 w-4" /></Button>
    </div>
  );
}
