import { describe, it, expect } from 'vitest';
import {
  // lifecycle
  canTransition, transition, isTerminal, ComplianceTransitionError, TERMINAL_STATUSES,
  // hash
  sha256Base64, GENESIS_PREVIOUS_HASH, chainInvoiceHash, verifyInvoiceHash,
  // queue
  backoffDelayMs, planRetry, isDue, DEFAULT_RETRY_POLICY,
  // certificate store
  isCertificateUsable, selectActiveCertificate, type ComplianceCertificate,
  // health
  summarizeProviderHealth, computeHealthStatus, type SubmissionRow,
  // provider + registry
  ComplianceProviderRegistry, complianceProviderRegistry, PausedConnectorError,
  // document
  assembleCompliance, canonicalize,
  // providers
  zatcaProvider, etaProvider, uaeProvider, ALL_COMPLIANCE_PROVIDERS,
} from './index';
import { EINVOICE_ENABLED } from './flags';

describe('compliance/flags', () => {
  it('defaults OFF', () => {
    const prev = process.env.KAKO_EINVOICE;
    delete process.env.KAKO_EINVOICE;
    expect(EINVOICE_ENABLED()).toBe(false);
    process.env.KAKO_EINVOICE = '1';
    expect(EINVOICE_ENABLED()).toBe(true);
    if (prev === undefined) delete process.env.KAKO_EINVOICE; else process.env.KAKO_EINVOICE = prev;
  });
});

describe('compliance/lifecycle', () => {
  it('permits the happy path and blocks illegal jumps', () => {
    expect(canTransition('draft', 'generated')).toBe(true);
    expect(canTransition('generated', 'queued')).toBe(true);
    expect(canTransition('queued', 'submitting')).toBe(true);
    expect(canTransition('submitting', 'cleared')).toBe(true);
    expect(canTransition('draft', 'cleared')).toBe(false);
    expect(canTransition('cleared', 'submitting')).toBe(false);
  });

  it('models retry + dead-letter from failed', () => {
    expect(canTransition('submitting', 'failed')).toBe(true);
    expect(canTransition('failed', 'queued')).toBe(true);
    expect(canTransition('failed', 'dead_lettered')).toBe(true);
    expect(canTransition('dead_lettered', 'queued')).toBe(true);
  });

  it('transition() throws on illegal moves', () => {
    expect(transition('generated', 'signed')).toBe('signed');
    expect(() => transition('cleared', 'generated')).toThrow(ComplianceTransitionError);
  });

  it('marks terminal states', () => {
    expect(isTerminal('cleared')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('queued')).toBe(false);
    expect(TERMINAL_STATUSES).toContain('reported');
  });
});

describe('compliance/hash (PIH chain)', () => {
  it('genesis is Base64(SHA-256("0"))', () => {
    expect(GENESIS_PREVIOUS_HASH).toBe(sha256Base64('0'));
  });

  it('first document chains onto genesis; next onto its predecessor', () => {
    const a = chainInvoiceHash('INV-A');
    expect(a.previousInvoiceHash).toBe(GENESIS_PREVIOUS_HASH);
    const b = chainInvoiceHash('INV-B', a.invoiceHash);
    expect(b.previousInvoiceHash).toBe(a.invoiceHash);
    expect(b.invoiceHash).not.toBe(a.invoiceHash);
  });

  it('is deterministic + verifiable', () => {
    const h = chainInvoiceHash('INV-A').invoiceHash;
    expect(chainInvoiceHash('INV-A').invoiceHash).toBe(h);
    expect(verifyInvoiceHash('INV-A', h)).toBe(true);
    expect(verifyInvoiceHash('INV-B', h)).toBe(false);
  });
});

describe('compliance/queue (retry + DLQ)', () => {
  it('backoff grows exponentially, capped at maxDelayMs', () => {
    expect(backoffDelayMs(1)).toBe(60_000);
    expect(backoffDelayMs(2)).toBe(120_000);
    expect(backoffDelayMs(3)).toBe(240_000);
    expect(backoffDelayMs(99)).toBe(DEFAULT_RETRY_POLICY.maxDelayMs);
  });

  it('schedules retries then dead-letters at the budget', () => {
    const now = new Date('2026-06-08T00:00:00Z');
    const first = planRetry(0, now);
    expect(first.action).toBe('retry');
    expect(first.attempts).toBe(1);
    expect(first.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());

    const last = planRetry(DEFAULT_RETRY_POLICY.maxAttempts - 1, now);
    expect(last.action).toBe('dead_letter');
    expect(last.nextAttemptAt).toBeNull();
  });

  it('isDue respects the schedule', () => {
    const now = new Date('2026-06-08T00:00:00Z');
    expect(isDue(null, now)).toBe(true);
    expect(isDue(new Date(now.getTime() - 1000), now)).toBe(true);
    expect(isDue(new Date(now.getTime() + 1000), now)).toBe(false);
  });
});

describe('compliance/certificate-store', () => {
  const base: ComplianceCertificate = {
    id: 'c1', companyId: 'co1', country: 'SA', regime: 'zatca', kind: 'sandbox',
    label: 'sbx', status: 'active', notBefore: '2026-01-01', notAfter: '2027-01-01',
  };
  const now = new Date('2026-06-08T00:00:00Z');

  it('usable only when active + within validity', () => {
    expect(isCertificateUsable(base, now)).toBe(true);
    expect(isCertificateUsable({ ...base, status: 'pending' }, now)).toBe(false);
    expect(isCertificateUsable({ ...base, status: 'revoked' }, now)).toBe(false);
    expect(isCertificateUsable({ ...base, notAfter: '2026-01-01' }, now)).toBe(false);
    expect(isCertificateUsable({ ...base, notBefore: '2026-12-01' }, now)).toBe(false);
  });

  it('selects production over sandbox among usable certs', () => {
    const prod: ComplianceCertificate = { ...base, id: 'c2', kind: 'production' };
    const chosen = selectActiveCertificate([base, prod], 'zatca', now);
    expect(chosen!.id).toBe('c2');
    expect(selectActiveCertificate([base], 'eta', now)).toBeUndefined();
  });
});

describe('compliance/health', () => {
  it('rolls submissions up per provider with status + error rate', () => {
    const rows: SubmissionRow[] = [
      { country: 'SA', regime: 'zatca', status: 'cleared', updatedAt: '2026-06-01T00:00:00Z' },
      { country: 'SA', regime: 'zatca', status: 'rejected', updatedAt: '2026-06-02T00:00:00Z' },
      { country: 'EG', regime: 'eta', status: 'generated', updatedAt: '2026-06-03T00:00:00Z' },
    ];
    const out = summarizeProviderHealth(rows);
    const sa = out.find((p) => p.regime === 'zatca')!;
    expect(sa.counts.total).toBe(2);
    expect(sa.counts.accepted).toBe(1);
    expect(sa.counts.rejected).toBe(1);
    expect(sa.errorRate).toBe(0.5);
    expect(sa.lastActivityAt).toBe('2026-06-02T00:00:00Z');
    expect(sa.status).toBe('down'); // 0.5 >= 0.25
  });

  it('computeHealthStatus traffic-lights', () => {
    expect(computeHealthStatus({ total: 0, pending: 0, inFlight: 0, accepted: 0, rejected: 0, failed: 0, deadLettered: 0 })).toBe('healthy');
    expect(computeHealthStatus({ total: 10, pending: 0, inFlight: 0, accepted: 10, rejected: 0, failed: 0, deadLettered: 0 })).toBe('healthy');
    expect(computeHealthStatus({ total: 10, pending: 0, inFlight: 0, accepted: 9, rejected: 1, failed: 0, deadLettered: 0 })).toBe('degraded');
    expect(computeHealthStatus({ total: 10, pending: 0, inFlight: 0, accepted: 9, rejected: 0, failed: 0, deadLettered: 1 })).toBe('down');
  });
});

describe('compliance/provider registry', () => {
  it('registers + resolves by country+regime; upsert replaces', () => {
    const reg = new ComplianceProviderRegistry();
    reg.register(zatcaProvider);
    reg.register(etaProvider);
    expect(reg.get('SA', 'zatca')!.id).toBe('zatca-2.0');
    expect(reg.get('EG', 'eta')!.id).toBe('eta-1.0');
    expect(reg.get('XX', 'none')).toBeUndefined();
    reg.register(zatcaProvider); // re-register = upsert, no dup
    expect(reg.list().filter((p) => p.regime === 'zatca')).toHaveLength(1);
  });

  it('the shared default registry has the built-ins self-registered', () => {
    expect(complianceProviderRegistry.get('SA', 'zatca')).toBeDefined();
    expect(complianceProviderRegistry.get('EG', 'eta')).toBeDefined();
    expect(complianceProviderRegistry.get('AE', 'fta')).toBeDefined();
    expect(ALL_COMPLIANCE_PROVIDERS).toHaveLength(3);
  });
});

describe('compliance/providers — offline surface real, submit PAUSED', () => {
  const zatcaInput = {
    invoiceType: 'simplified' as const, invoiceNumber: 'SA-1', issueDateTime: '2026-06-08T10:00:00Z',
    sellerName: 'Acme KSA', sellerVatNumber: '300000000000003',
    lines: [{ description: 'A', quantity: 2, unitPrice: 100, taxRate: 15 }],
  };

  it('ZATCA: builds doc + TLV QR + totals offline', () => {
    expect(zatcaProvider.validate(zatcaInput)).toEqual([]);
    const doc = zatcaProvider.buildDocument(zatcaInput);
    expect(doc.country).toBe('SA');
    expect(doc.totals).toEqual({ net: 200, tax: 30, total: 230 });
    expect(typeof doc.qr).toBe('string');
    expect(doc.qr).toBe(zatcaProvider.buildQr!(zatcaInput));
  });

  it('ZATCA: submit() throws PausedConnectorError', async () => {
    await expect(zatcaProvider.submit!(zatcaInput)).rejects.toBeInstanceOf(PausedConnectorError);
  });

  it('UAE: builds doc + totals offline; submit paused', async () => {
    const input = { invoiceNumber: 'AE-1', issueDate: '2026-06-08', sellerTrn: '100000000000003',
      lines: [{ description: 'A', quantity: 2, unitPrice: 100 }] };
    const doc = uaeProvider.buildDocument(input);
    expect(doc.totals).toEqual({ net: 200, tax: 10, total: 210 });
    await expect(uaeProvider.submit!(input)).rejects.toBeInstanceOf(PausedConnectorError);
  });
});

describe('compliance/document assembly', () => {
  const input = {
    invoiceType: 'simplified' as const, invoiceNumber: 'SA-1', issueDateTime: '2026-06-08T10:00:00Z',
    sellerName: 'Acme KSA', sellerVatNumber: '300000000000003',
    lines: [{ description: 'A', quantity: 1, unitPrice: 100, taxRate: 15 }],
  };

  it('assembles a generated record with UUID + chained hash + QR', () => {
    const a = assembleCompliance(zatcaProvider, input);
    expect(a.status).toBe('generated');
    expect(a.issues).toEqual([]);
    expect(a.documentUuid).toMatch(/[0-9a-f-]{36}/);
    expect(a.previousInvoiceHash).toBe(GENESIS_PREVIOUS_HASH);
    expect(a.qr).toBeDefined();

    const b = assembleCompliance(zatcaProvider, { ...input, invoiceNumber: 'SA-2' }, { previousHash: a.invoiceHash });
    expect(b.previousInvoiceHash).toBe(a.invoiceHash);
  });

  it('holds invalid input back in draft with issues', () => {
    const bad = assembleCompliance(zatcaProvider, { ...input, sellerVatNumber: 'bad' });
    expect(bad.status).toBe('draft');
    expect(bad.issues.map((i) => i.field)).toContain('sellerVatNumber');
  });

  it('canonicalize hashes the normalized content deterministically', () => {
    const doc = zatcaProvider.buildDocument(input);
    expect(canonicalize(doc)).toBe(JSON.stringify(doc.content));
  });
});
