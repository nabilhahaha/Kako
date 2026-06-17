import { describe, it, expect } from 'vitest';
import {
  buildChain, firstStatus, nextStatusAfter, canActOnStage, assignedRole,
  pendingStatusFor, rejectedStatusFor, stageOfStatus, dayCloseApprovalEnabled,
  computeSettlement, computeReconciliation, canCloseDay, computeCashHeld,
  reconcileDue, initialReconcileStatus,
  DEFAULT_DAY_CLOSE_POLICY, type DayClosePolicy,
} from './day-close-policy';

const fullChain = (sod = false): DayClosePolicy => ({
  mode: 'custom',
  separationOfDuties: sod,
  stages: [
    { stage: 'supervisor', role: 'supervisor' },
    { stage: 'reconcile', role: 'warehouse_keeper' },
    { stage: 'settle', role: 'cashier' },
  ],
});

describe('day-close policy — chain building', () => {
  it('direct mode → empty chain → first status closed', () => {
    const chain = buildChain({ mode: 'direct', supervisorEnabled: true });
    expect(chain).toEqual([]);
    expect(firstStatus({ ...DEFAULT_DAY_CLOSE_POLICY, stages: chain })).toBe('closed');
  });

  it('custom mode builds enabled stages in configured order with assigned roles', () => {
    const chain = buildChain({
      mode: 'custom',
      supervisorEnabled: true, reconcileEnabled: true, settleEnabled: true,
      supervisorRole: 'supervisor', reconcileRole: 'warehouse_keeper', settleRole: 'cashier',
      stageOrder: ['supervisor', 'reconcile', 'settle'],
    });
    expect(chain.map((s) => s.stage)).toEqual(['supervisor', 'reconcile', 'settle']);
    expect(chain.map((s) => s.role)).toEqual(['supervisor', 'warehouse_keeper', 'cashier']);
  });

  it('skips disabled stages and honours a custom order', () => {
    const chain = buildChain({
      mode: 'custom',
      supervisorEnabled: true, reconcileEnabled: false, settleEnabled: true,
      stageOrder: ['settle', 'supervisor'],
    });
    expect(chain.map((s) => s.stage)).toEqual(['settle', 'supervisor']);
  });

  it('small company: one role assigned to every stage', () => {
    const chain = buildChain({
      mode: 'custom', supervisorEnabled: true, reconcileEnabled: true, settleEnabled: true,
      supervisorRole: 'supervisor', reconcileRole: 'supervisor', settleRole: 'supervisor',
    });
    expect(chain.every((s) => s.role === 'supervisor')).toBe(true);
  });
});

describe('day-close policy — status transitions', () => {
  const p = fullChain();
  it('first status is pending the first enabled stage', () => {
    expect(firstStatus(p)).toBe('pending_supervisor');
  });
  it('advances to the next enabled stage on approve, then closed', () => {
    expect(nextStatusAfter('supervisor', p)).toBe('pending_reconciliation');
    expect(nextStatusAfter('reconcile', p)).toBe('pending_settlement');
    expect(nextStatusAfter('settle', p)).toBe('closed');
  });
  it('a single-stage chain closes right after that stage', () => {
    const one: DayClosePolicy = { mode: 'custom', separationOfDuties: false, stages: [{ stage: 'supervisor', role: 'supervisor' }] };
    expect(nextStatusAfter('supervisor', one)).toBe('closed');
  });
  it('pending/rejected/stageOf helpers', () => {
    expect(pendingStatusFor('settle')).toBe('pending_settlement');
    expect(rejectedStatusFor('reconcile')).toBe('reconciliation_rejected');
    expect(stageOfStatus('pending_reconciliation')).toBe('reconcile');
    expect(stageOfStatus('closed')).toBeNull();
  });
});

describe('day-close policy — authorization (delegation + SoD)', () => {
  const base = {
    stage: 'supervisor' as const, policy: fullChain(),
    userRoles: ['supervisor'], userPerms: ['day.close.supervisor'],
    submitterId: 'sales1', priorActorIds: [] as string[],
  };

  it('blocks the submitter from approving their own day', () => {
    expect(canActOnStage({ ...base, userId: 'sales1' })).toBe(false);
  });
  it('requires the stage permission', () => {
    expect(canActOnStage({ ...base, userId: 'u1', userPerms: [] })).toBe(false);
    expect(canActOnStage({ ...base, userId: 'u1' })).toBe(true);
  });
  it('requires the assigned role unless the stage role is "any"', () => {
    expect(canActOnStage({ ...base, userId: 'u1', userRoles: ['cashier'] })).toBe(false);
    const anyPolicy = { ...fullChain(), stages: [{ stage: 'supervisor' as const, role: 'any' }] };
    expect(canActOnStage({ ...base, userId: 'u1', userRoles: ['cashier'], policy: anyPolicy })).toBe(true);
  });
  it('separation of duties: a prior-stage actor cannot act again when ON', () => {
    const sod = { ...base, policy: fullChain(true), stage: 'reconcile' as const, userRoles: ['warehouse_keeper'], userPerms: ['day.close.reconcile'] };
    expect(canActOnStage({ ...sod, userId: 'u1', priorActorIds: ['u1'] })).toBe(false); // acted on supervisor stage
    expect(canActOnStage({ ...sod, userId: 'u2', priorActorIds: ['u1'] })).toBe(true);
  });
  it('SoD OFF: the same user may perform multiple stages (audit kept separate by caller)', () => {
    const multi = { ...base, policy: fullChain(false), stage: 'reconcile' as const, userRoles: ['supervisor', 'warehouse_keeper'], userPerms: ['day.close.reconcile'] };
    expect(canActOnStage({ ...multi, userId: 'u1', priorActorIds: ['u1'] })).toBe(true);
  });
  it('apex bypasses role + SoD but never self-approval', () => {
    expect(canActOnStage({ ...base, userId: 'sales1', isApex: true })).toBe(false);
    expect(canActOnStage({ ...base, userId: 'admin', userRoles: [], userPerms: [], isApex: true })).toBe(true);
  });
  it('assignedRole reads the policy', () => {
    expect(assignedRole('settle', fullChain())).toBe('cashier');
  });
});

describe('day-close capability flag', () => {
  it('reads platform.day_close_approval', () => {
    expect(dayCloseApprovalEnabled({ 'platform.day_close_approval': true })).toBe(true);
    expect(dayCloseApprovalEnabled({})).toBe(false);
    expect(dayCloseApprovalEnabled(null)).toBe(false);
  });
});

describe('separated statuses — settlement / reconciliation / close gating', () => {
  it('computeSettlement: full / partial / none + outstanding', () => {
    expect(computeSettlement(5000, 5000)).toEqual({ status: 'settled', outstanding: 0 });
    expect(computeSettlement(5000, 3000)).toEqual({ status: 'partial', outstanding: 2000 });
    expect(computeSettlement(5000, 0)).toEqual({ status: 'pending', outstanding: 5000 });
    expect(computeSettlement(0, 0)).toEqual({ status: 'settled', outstanding: 0 });
    // allowPartial=false ⇒ short settlement stays pending (no partial state)
    expect(computeSettlement(5000, 3000, false)).toEqual({ status: 'pending', outstanding: 2000 });
  });

  it('computeReconciliation: pending until counted, then reconciled/partial by variance', () => {
    expect(computeReconciliation(100, null)).toEqual({ status: 'pending', variance: 0 });
    expect(computeReconciliation(100, 100)).toEqual({ status: 'reconciled', variance: 0 });
    expect(computeReconciliation(100, 95)).toEqual({ status: 'partial', variance: 5 });
  });

  it('canCloseDay: operational closes by default; blocking tracks gate when set', () => {
    const base = { operationalApproved: true, settlementStatus: 'partial' as const, reconcileStatus: 'pending' as const };
    // Default (non-blocking): day closes even with partial cash + pending stock.
    expect(canCloseDay({ ...base, tracks: { settleEnabled: true, reconcileEnabled: true } })).toBe(true);
    // Settlement blocks close → must be settled.
    expect(canCloseDay({ ...base, tracks: { settleEnabled: true, settleBlocksClose: true } })).toBe(false);
    expect(canCloseDay({ ...base, settlementStatus: 'settled', tracks: { settleEnabled: true, settleBlocksClose: true } })).toBe(true);
    // Reconciliation blocks close → must be reconciled.
    expect(canCloseDay({ ...base, tracks: { reconcileEnabled: true, reconcileBlocksClose: true } })).toBe(false);
    // Not operationally approved → never closes.
    expect(canCloseDay({ ...base, operationalApproved: false, tracks: {} })).toBe(false);
  });

  it('computeCashHeld: carried custody + collections − settled = outstanding (visible, separate)', () => {
    // Day 2 example: carried 2000 custody, 4000 collected today, settled 1000.
    expect(computeCashHeld({ cashInCustodyPrevious: 2000, todaysCollections: 4000, settledToday: 1000 }))
      .toEqual({ totalHeld: 6000, outstanding: 5000 });
  });
});

describe('inventory reconciliation cadence (Not Due Yet)', () => {
  it('reconcileDue: daily always; weekly/monthly by gap; surprise/not_required never auto-due', () => {
    expect(reconcileDue('daily', '2026-06-17')).toBe(true);
    expect(reconcileDue('weekly', '2026-06-17', '2026-06-12')).toBe(false); // 5d
    expect(reconcileDue('weekly', '2026-06-17', '2026-06-09')).toBe(true);  // 8d
    expect(reconcileDue('monthly', '2026-06-17', '2026-06-01')).toBe(false); // 16d
    expect(reconcileDue('surprise', '2026-06-17')).toBe(false);
    expect(reconcileDue('not_required', '2026-06-17')).toBe(false);
    expect(reconcileDue('weekly', '2026-06-17', null)).toBe(true); // never reconciled
  });

  it('initialReconcileStatus: not_required / not_due_yet / pending', () => {
    expect(initialReconcileStatus({ reconcileEnabled: false }, '2026-06-17')).toBe('not_required');
    expect(initialReconcileStatus({ reconcileEnabled: true, reconcileCadence: 'not_required' }, '2026-06-17')).toBe('not_required');
    expect(initialReconcileStatus({ reconcileEnabled: true, reconcileCadence: 'weekly' }, '2026-06-17', '2026-06-15')).toBe('not_due_yet');
    expect(initialReconcileStatus({ reconcileEnabled: true, reconcileCadence: 'daily' }, '2026-06-17')).toBe('pending');
  });

  it('canCloseDay: a blocking reconciliation does NOT block when Not Due Yet', () => {
    const base = { operationalApproved: true, settlementStatus: 'settled' as const };
    expect(canCloseDay({ ...base, reconcileStatus: 'not_due_yet', tracks: { reconcileEnabled: true, reconcileBlocksClose: true } })).toBe(true);
    expect(canCloseDay({ ...base, reconcileStatus: 'pending', tracks: { reconcileEnabled: true, reconcileBlocksClose: true } })).toBe(false);
  });
});
