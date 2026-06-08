import { describe, it, expect } from 'vitest';
import {
  // lifecycle (5G)
  ALL_STATUSES, DEFAULT_TRANSITIONS, defineLifecycle, lifecycleRegistry,
  canTransitionFor, isTerminalFor, transitionFor, ComplianceTransitionError,
  // queue (5G)
  classifyFailure, isRetryable, planFailure, planResubmission,
  // certificate (5G)
  daysUntilExpiry, isExpired, certificatesExpiringWithin, planRotation,
  createPausedSignatureProvider, PausedSignatureError, CertificateRegistry,
  certificateRegistry, type ComplianceCertificate,
  // catalog
  COUNTRY_COMPLIANCE_CATALOG, getCountryEntry, countriesBySupport,
  // metadata
  emptyComplianceMetadata, metadataFromAssembled,
  // item coding
  resolveItemCode, missingItemCodes, type ItemCodeMapping,
  // peppol
  validatePintAeInvoice, buildPintAeDocument, type PintAeInvoiceInput,
  // providers (5G)
  jordanProvider, uaePeppolProvider, buildJoInvoice, validateJoInvoice,
  complianceProviderRegistry, PausedConnectorError,
  assembleCompliance,
} from './index';

describe('5G lifecycle — full state set + country profiles', () => {
  it('has all 15 states and the new ones are reachable', () => {
    expect(ALL_STATUSES).toContain('validated');
    expect(ALL_STATUSES).toContain('accepted');
    expect(ALL_STATUSES).toContain('accepted_with_warning');
    expect(ALL_STATUSES).toHaveLength(15);
    expect(DEFAULT_TRANSITIONS.generated).toContain('validated');
    expect(DEFAULT_TRANSITIONS.submitting).toContain('accepted_with_warning');
  });

  it('country profiles restrict the default graph', () => {
    const zatca = lifecycleRegistry.get('zatca');
    expect(isTerminalFor(zatca, 'cleared')).toBe(true);
    expect(isTerminalFor(zatca, 'reported')).toBe(true);
    const eta = lifecycleRegistry.get('eta');
    expect(canTransitionFor(eta, 'submitted', 'accepted')).toBe(true);
    expect(isTerminalFor(eta, 'accepted')).toBe(true);
  });

  it('defineLifecycle merges overrides; transitionFor throws on illegal moves', () => {
    const p = defineLifecycle('custom', { draft: ['cancelled'] });
    expect(canTransitionFor(p, 'draft', 'generated')).toBe(false);
    expect(canTransitionFor(p, 'draft', 'cancelled')).toBe(true);
    expect(() => transitionFor(p, 'draft', 'generated')).toThrow(ComplianceTransitionError);
  });
});

describe('5G queue — failure classification + resubmission', () => {
  it('classifies failures', () => {
    expect(classifyFailure({ httpStatus: 429 })).toBe('rate_limit');
    expect(classifyFailure({ httpStatus: 401 })).toBe('auth');
    expect(classifyFailure({ httpStatus: 422 })).toBe('validation');
    expect(classifyFailure({ httpStatus: 503 })).toBe('transient');
    expect(classifyFailure({ network: true })).toBe('transient');
    expect(classifyFailure({ code: 'INVALID_SCHEMA' })).toBe('validation');
    expect(classifyFailure({ message: 'who knows' })).toBe('permanent');
  });

  it('retryable classes auto-retry; others are held + dead-lettered', () => {
    const now = new Date('2026-06-08T00:00:00Z');
    expect(isRetryable('transient')).toBe(true);
    expect(isRetryable('validation')).toBe(false);
    const transient = planFailure('transient', 0, now);
    expect(transient.action).toBe('retry');
    expect(transient.held).toBe(false);
    const validation = planFailure('validation', 0, now);
    expect(validation.action).toBe('dead_letter');
    expect(validation.held).toBe(true);
  });

  it('resubmission resets attempts + clears dead-letter', () => {
    const now = new Date('2026-06-08T00:00:00Z');
    const r = planResubmission(now);
    expect(r.attempts).toBe(0);
    expect(r.nextAttemptAt).toBe(now);
    expect(r.deadLetteredAt).toBeNull();
  });
});

describe('5G certificate — expiry, rotation, signature provider', () => {
  const now = new Date('2026-06-08T00:00:00Z');
  const cert: ComplianceCertificate = {
    id: 'c1', companyId: 'co', country: 'SA', regime: 'zatca', kind: 'sandbox',
    label: 'sbx', status: 'active', notAfter: '2026-06-28T00:00:00Z',
  };

  it('computes expiry + flags soon-to-expire active certs', () => {
    expect(daysUntilExpiry(cert, now)).toBe(20);
    expect(isExpired(cert, now)).toBe(false);
    expect(certificatesExpiringWithin([cert], 30, now).map((c) => c.id)).toEqual(['c1']);
    expect(certificatesExpiringWithin([cert], 10, now)).toEqual([]);
  });

  it('plans rotation for expiring/expired/revoked', () => {
    expect(planRotation(cert, now, 30).rotate).toBe(true);
    expect(planRotation(cert, now, 30).reason).toBe('expiring_soon');
    expect(planRotation({ ...cert, notAfter: '2026-06-01T00:00:00Z' }, now).reason).toBe('expired');
    expect(planRotation({ ...cert, status: 'revoked' }, now).reason).toBe('revoked');
    expect(planRotation({ ...cert, notAfter: '2027-01-01T00:00:00Z' }, now).rotate).toBe(false);
  });

  it('signature provider is paused by default', async () => {
    const sp = createPausedSignatureProvider('zatca');
    await expect(sp.sign('<xml/>', cert)).rejects.toBeInstanceOf(PausedSignatureError);
    const reg = new CertificateRegistry();
    await expect(reg.get('eta').sign('<xml/>', cert)).rejects.toBeInstanceOf(PausedSignatureError);
    expect(certificateRegistry.get('zatca').regime).toBe('zatca');
  });
});

describe('5G catalog — future countries without redesign', () => {
  it('lists the requested countries with support levels', () => {
    expect(getCountryEntry('SA', 'zatca')!.support).toBe('live_paused');
    expect(getCountryEntry('JO', 'jofotara')!.support).toBe('prepared');
    expect(getCountryEntry('AE', 'pint-ae')!.support).toBe('prepared');
    for (const cc of ['BH', 'QA', 'OM', 'KW', 'MA', 'TR', 'EU', 'GB', 'IN']) {
      expect(getCountryEntry(cc)).toBeDefined();
    }
    expect(countriesBySupport('planned').length).toBeGreaterThanOrEqual(9);
  });
});

describe('5G metadata', () => {
  it('empty + projection from an assembled document', () => {
    expect(emptyComplianceMetadata().complianceStatus).toBe('draft');
    const a = assembleCompliance(jordanProvider, {
      invoiceType: 'cash' as const, invoiceNumber: 'JO-1', issueDate: '2026-06-08',
      seller: { name: 'Acme JO', tin: '123' }, lines: [{ description: 'A', quantity: 1, unitPrice: 100 }],
    });
    const m = metadataFromAssembled(a, { internalInvoiceNumber: 'JO-1' });
    expect(m.documentUuid).toBe(a.documentUuid);
    expect(m.invoiceHash).toBe(a.invoiceHash);
    expect(m.previousInvoiceHash).toBe(a.previousInvoiceHash);
    expect(m.internalInvoiceNumber).toBe('JO-1');
    expect(m.qrPayload).toBeDefined();
  });
});

describe('5G item coding (ETA GS1/GPC/internal)', () => {
  const mappings: ItemCodeMapping[] = [
    { internalCode: 'SKU1', scheme: 'GS1', code: '0614141000036' },
    { internalCode: 'SKU1', scheme: 'EGS', code: 'EG-123' },
  ];
  it('resolves + reports gaps', () => {
    expect(resolveItemCode('SKU1', 'GS1', mappings)).toMatchObject({ code: '0614141000036', resolved: true });
    expect(resolveItemCode('SKU2', 'GS1', mappings).resolved).toBe(false);
    expect(missingItemCodes(['SKU1', 'SKU2'], 'GS1', mappings)).toEqual(['SKU2']);
    expect(missingItemCodes(['SKU1'], 'EGS', mappings)).toEqual([]);
  });
});

describe('5G UAE PINT-AE / PEPPOL', () => {
  const input: PintAeInvoiceInput = {
    profileId: 'urn:peppol:bis:billing:3.0', businessProcess: 'invoice',
    invoiceNumber: 'AE-1', issueDate: '2026-06-08',
    seller: { legalName: 'Acme AE', electronicAddress: { scheme: '0235', value: '100000000000003' } },
    buyer: { legalName: 'Buyer AE', electronicAddress: { scheme: '0235', value: '100000000000011' } },
    lines: [{ description: 'A', quantity: 2, unitPrice: 100, taxCategory: { code: 'S', percent: 5 } }],
  };
  it('validates + builds totals', () => {
    expect(validatePintAeInvoice(input)).toEqual([]);
    const doc = buildPintAeDocument(input);
    expect(doc.netAmount).toBe(200);
    expect(doc.vatTotal).toBe(10);
    expect(doc.totalAmount).toBe(210);
    expect(validatePintAeInvoice({ ...input, seller: { ...input.seller, electronicAddress: { scheme: '', value: '' } } }).map((i) => i.field)).toContain('seller.electronicAddress');
  });
  it('provider builds offline; submit paused', async () => {
    const doc = uaePeppolProvider.buildDocument(input);
    expect(doc.format).toBe('peppol-bis-3');
    expect(doc.totals).toEqual({ net: 200, tax: 10, total: 210 });
    await expect(uaePeppolProvider.submit!(input)).rejects.toBeInstanceOf(PausedConnectorError);
  });
});

describe('5G Jordan JoFotara', () => {
  const cash = { invoiceType: 'cash' as const, invoiceNumber: 'JO-1', issueDate: '2026-06-08',
    seller: { name: 'Acme JO', tin: '123' }, lines: [{ description: 'A', quantity: 2, unitPrice: 100 }] };
  it('builds (16% GST default) + QR; buyer optional', () => {
    expect(validateJoInvoice(cash)).toEqual([]);
    const inv = buildJoInvoice(cash);
    expect(inv.netAmount).toBe(200);
    expect(inv.taxTotal).toBe(32);
    expect(inv.totalAmount).toBe(232);
    const doc = jordanProvider.buildDocument(cash);
    expect(typeof doc.qr).toBe('string');
  });
  it('return invoice requires the original number', () => {
    const bad = validateJoInvoice({ ...cash, invoiceType: 'return' });
    expect(bad.map((i) => i.field)).toContain('originalInvoiceNumber');
  });
  it('submit paused', async () => {
    await expect(jordanProvider.submit!(cash)).rejects.toBeInstanceOf(PausedConnectorError);
  });
});

describe('5G provider registry self-registration', () => {
  it('registers all 5 providers incl. Jordan + UAE PEPPOL', () => {
    expect(complianceProviderRegistry.get('JO', 'jofotara')).toBeDefined();
    expect(complianceProviderRegistry.get('AE', 'pint-ae')).toBeDefined();
    expect(complianceProviderRegistry.list().length).toBeGreaterThanOrEqual(5);
  });
});
