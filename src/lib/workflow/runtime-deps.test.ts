import { describe, it, expect } from 'vitest';
import { mapRunPatch } from './runtime-deps';

const stepNoById = new Map<string, number>([['s2', 2], ['s3', 3]]);

describe('mapRunPatch (runtime → erp_workflow_instances columns)', () => {
  it('maps active states to engine status=pending + precise runtime_state', () => {
    expect(mapRunPatch({ status: 'running' }, stepNoById)).toMatchObject({ status: 'pending', runtime_state: 'running' });
    expect(mapRunPatch({ status: 'waiting' }, stepNoById)).toMatchObject({ status: 'pending', runtime_state: 'waiting' });
  });

  it('maps terminal states to engine-compatible status + sets completed_at', () => {
    const done = mapRunPatch({ status: 'completed' }, stepNoById);
    expect(done).toMatchObject({ status: 'approved', runtime_state: 'completed' });
    expect(done.completed_at).toBeTruthy();
    expect(mapRunPatch({ status: 'rejected' }, stepNoById)).toMatchObject({ status: 'rejected', runtime_state: 'rejected' });
    expect(mapRunPatch({ status: 'failed' }, stepNoById)).toMatchObject({ status: 'cancelled', runtime_state: 'failed' });
  });

  it('maps currentStepId to both the uuid and the legacy step_no', () => {
    expect(mapRunPatch({ currentStepId: 's3' }, stepNoById)).toMatchObject({ current_step_id: 's3', current_step: 3 });
    expect(mapRunPatch({ currentStepId: null }, stepNoById)).toMatchObject({ current_step_id: null });
  });

  it('maps nextActionAt epoch→iso (and null), attempts, lastError', () => {
    const at = Date.UTC(2026, 0, 1);
    expect(mapRunPatch({ nextActionAt: at }, stepNoById).next_action_at).toBe(new Date(at).toISOString());
    expect(mapRunPatch({ nextActionAt: null }, stepNoById).next_action_at).toBeNull();
    expect(mapRunPatch({ attempts: 3 }, stepNoById)).toMatchObject({ attempts: 3 });
    expect(mapRunPatch({ lastError: 'boom' }, stepNoById)).toMatchObject({ last_error: 'boom' });
  });

  it('omits keys that are not in the patch', () => {
    expect(Object.keys(mapRunPatch({ attempts: 1 }, stepNoById))).toEqual(['attempts']);
  });
});
