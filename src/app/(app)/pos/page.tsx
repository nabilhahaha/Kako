import type { Metadata } from 'next';
import { requirePermission } from '@/lib/erp/guards';
import { PosTerminal } from './pos-terminal';

export const metadata: Metadata = { title: 'VANTORA — POS' };

/**
 * Fast Food / Restaurant POS — the cashier's fast sell screen, in its own independent module
 * surface (/pos), self-gated on restaurant.manage (the cashier role already holds it). The
 * warm food-service accent is the scoped `.food-theme` wrapper. Reuses shared platform
 * infrastructure only — the restaurant order/checkout engine, product catalog, barcode
 * scanner and receipt — without touching Field Verification, Route Planner or Multi-Form.
 */
export default async function FoodPosPage() {
  const ctx = await requirePermission('restaurant.manage');
  return (
    <div className="food-theme -m-4 sm:-m-6">
      <PosTerminal companyId={ctx.companyId ?? ''} />
    </div>
  );
}
