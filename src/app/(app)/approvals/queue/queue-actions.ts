'use server';

import { revalidatePath } from 'next/cache';
import type { ActionResult } from '@/lib/erp/guards';
import {
  decideVisitCompliance,
  approveDayClose,
  approveCustomerTransfer,
  approveVanTransfer,
  rejectVanTransfer,
} from '../../field/actions';
import { approveTradeSpend, cancelTradeSpend } from '../../distribution/trade-spend/actions';
import { decideTask } from '../actions';

/** Workflow types surfaced in the unified Approval Queue. `workflow` covers any
 *  engine-driven task (credit-limit, trade-spend, price-change, change-requests…)
 *  surfaced via the unified inbox (P3); it dispatches to the generic decideTask. */
export type ApprovalType =
  | 'day_close'
  | 'visit'
  | 'customer_transfer'
  | 'van_transfer'
  | 'trade_spend'
  | 'workflow';

/**
 * Single entry point that DISPATCHES to the already-implemented approval actions
 * (no new backend logic). Each underlying action enforces its own permission and
 * runs the existing RPC. `day_close` and `customer_transfer` have approve-only
 * actions today, so a reject is reported as unsupported rather than faked.
 */
export async function decideApproval(
  type: ApprovalType,
  id: string,
  approve: boolean,
  comment?: string,
): Promise<ActionResult> {
  let res: ActionResult;
  switch (type) {
    case 'day_close':
      if (!approve) return { ok: false, error: 'reject_unsupported' };
      res = await approveDayClose(id);
      break;
    case 'visit':
      res = await decideVisitCompliance(id, approve, comment);
      break;
    case 'customer_transfer':
      if (!approve) return { ok: false, error: 'reject_unsupported' };
      res = await approveCustomerTransfer(id);
      break;
    case 'van_transfer':
      res = approve ? await approveVanTransfer(id) : await rejectVanTransfer(id, comment ?? '');
      break;
    case 'trade_spend':
      res = approve ? await approveTradeSpend(id, comment) : await cancelTradeSpend(id, comment ?? '');
      break;
    case 'workflow':
      // Engine task (id = workflow task id). decideTask enforces the assignee +
      // governance (self-approval / reject reason) and applies the outcome handler.
      res = await decideTask(id, approve ? 'approve' : 'reject', comment);
      break;
    default:
      return { ok: false, error: 'unknown_type' };
  }
  if (res.ok) revalidatePath('/approvals/queue');
  return res;
}
