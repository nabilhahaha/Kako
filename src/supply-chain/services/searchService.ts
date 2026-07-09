/**
 * Global search across PI Number, Delivery Note Number, Invoice Number, SKU and
 * Customer. Returns lightweight hits that always resolve to a PI detail page.
 */
import { dataStore } from '../repositories';

export type SearchHitType = 'PI' | 'DELIVERY_NOTE' | 'INVOICE' | 'SKU' | 'CUSTOMER';

export interface SearchHit {
  type: SearchHitType;
  label: string;
  sublabel: string;
  piId: string | null;
}

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const [pis, dns, invoices, piLines] = await Promise.all([
    dataStore.pis.getAll(),
    dataStore.deliveryNotes.getAll(),
    dataStore.invoices.getAll(),
    dataStore.piLines.getAll(),
  ]);

  const hits: SearchHit[] = [];
  const match = (v: string | null | undefined) => (v ?? '').toLowerCase().includes(q);

  for (const pi of pis) {
    if (match(pi.piNumber)) {
      hits.push({ type: 'PI', label: pi.piNumber, sublabel: pi.customer, piId: pi.id });
    }
  }
  for (const pi of pis) {
    if (match(pi.customer) && !hits.some((h) => h.type === 'CUSTOMER' && h.label === pi.customer)) {
      hits.push({ type: 'CUSTOMER', label: pi.customer, sublabel: `PI ${pi.piNumber}`, piId: pi.id });
    }
  }
  for (const dn of dns) {
    if (match(dn.deliveryNoteNumber)) {
      hits.push({
        type: 'DELIVERY_NOTE',
        label: dn.deliveryNoteNumber,
        sublabel: `PI ${dn.piNumber}`,
        piId: dn.piId,
      });
    }
  }
  for (const inv of invoices) {
    if (match(inv.invoiceNumber)) {
      hits.push({
        type: 'INVOICE',
        label: inv.invoiceNumber,
        sublabel: `PI ${inv.piNumber}`,
        piId: inv.piId,
      });
    }
  }
  const seenSku = new Set<string>();
  for (const line of piLines) {
    if (match(line.sku) && !seenSku.has(line.sku + line.piId)) {
      seenSku.add(line.sku + line.piId);
      hits.push({
        type: 'SKU',
        label: line.sku,
        sublabel: `${line.description || 'SKU'} · PI ${line.piNumber}`,
        piId: line.piId,
      });
    }
  }

  return hits.slice(0, 40);
}
