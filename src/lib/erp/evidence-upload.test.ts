import { describe, it, expect } from 'vitest';
import { evidencePath, uploadBackoffMs, uploadEvidence, EVIDENCE_BUCKET } from './evidence-upload';

describe('evidence-upload · evidencePath', () => {
  it('builds a company-prefixed path with a sane extension', () => {
    const p = evidencePath('co-1', 'capture', 'photo.PNG');
    expect(p.startsWith('co-1/capture/')).toBe(true);
    expect(p.endsWith('.png')).toBe(true);
  });
  it('defaults the extension to jpg', () => {
    expect(evidencePath('co-1', 'fe_visit', 'noext').endsWith('.jpg')).toBe(true);
    expect(evidencePath('co-1', 'fe_visit').endsWith('.jpg')).toBe(true);
  });
});

describe('evidence-upload · uploadBackoffMs', () => {
  it('grows 0.5s→8s cap', () => {
    expect(uploadBackoffMs(0)).toBe(500);
    expect(uploadBackoffMs(1)).toBe(1000);
    expect(uploadBackoffMs(4)).toBe(8000);
    expect(uploadBackoffMs(9)).toBe(8000);
  });
});

describe('evidence-upload · uploadEvidence (retry to a stable path)', () => {
  function fakeStorage(failTimes: number) {
    let calls = 0;
    const paths: string[] = [];
    return {
      get calls() { return calls; },
      get paths() { return paths; },
      storage: {
        from: (_b: string) => ({
          upload: async (path: string) => {
            calls++; paths.push(path);
            return calls <= failTimes ? { data: null, error: { message: 'network' } } : { data: { path }, error: null };
          },
        }),
      },
    };
  }
  // The fake storage ignores blob bytes; a minimal stub with name/type suffices.
  const file = { name: 'p.jpg', type: 'image/jpeg' } as unknown as Blob & { name?: string; type?: string };
  const nosleep = async () => {};

  it('retries on failure and returns the path on success — same path each attempt', async () => {
    const sb = fakeStorage(2);
    const path = await uploadEvidence(sb, 'co-1', file, 'capture', { sleep: nosleep });
    expect(path).toMatch(/^co-1\/capture\//);
    expect(sb.calls).toBe(3);                 // 2 failures + 1 success
    expect(new Set(sb.paths).size).toBe(1);   // idempotent: same object path retried
  });

  it('throws after exhausting retries', async () => {
    const sb = fakeStorage(99);
    await expect(uploadEvidence(sb, 'co-1', file, 'capture', { retries: 2, sleep: nosleep })).rejects.toThrow(/network/);
    expect(sb.calls).toBe(3);                 // initial + 2 retries
  });

  it('uses the evidence bucket', () => {
    expect(EVIDENCE_BUCKET).toBe('field-evidence');
  });
});
