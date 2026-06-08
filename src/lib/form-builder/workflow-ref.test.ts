import { describe, it, expect } from 'vitest';
import { buildFormStepConfig, readFormStepRef, hasFormReference } from './index';

describe('form-builder/workflow-ref', () => {
  it('builds a config fragment with optional version', () => {
    expect(buildFormStepConfig({ formCode: 'customer_data_update' })).toEqual({ form_code: 'customer_data_update' });
    expect(buildFormStepConfig({ formCode: 'x', formVersion: 2 })).toEqual({ form_code: 'x', form_version: 2 });
  });

  it('reads a reference back, ignoring foreign keys', () => {
    expect(readFormStepRef({ form_code: 'x', form_version: 3, table: 'erp_customers' })).toEqual({ formCode: 'x', formVersion: 3 });
    expect(readFormStepRef({ form_code: 'x' })).toEqual({ formCode: 'x', formVersion: undefined });
  });

  it('returns null / false when there is no reference', () => {
    expect(readFormStepRef({})).toBeNull();
    expect(readFormStepRef(null)).toBeNull();
    expect(readFormStepRef({ form_code: '' })).toBeNull();
    expect(hasFormReference({ table: 'x' })).toBe(false);
    expect(hasFormReference({ form_code: 'x' })).toBe(true);
  });
});
