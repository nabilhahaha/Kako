import { describe, it, expect } from 'vitest';
import {
  resolveSubscription,
  buildRenewWhatsAppUrl,
  freshTrial,
  type RoutePlannerSubscriptionInput,
} from './route-planner-subscription';

const NOW = Date.parse('2026-06-19T00:00:00.000Z');
const inDays = (d: number) => new Date(NOW + d * 86400000).toISOString();

function trialEndingIn(days: number): RoutePlannerSubscriptionInput {
  return { companyName: 'Acme', tenantId: 't1', isActive: true, planKey: 'trial', trialEndsAt: inDays(days), subscriptionStart: null, subscriptionEnd: null, createdAt: inDays(-1) };
}

describe('resolveSubscription', () => {
  it('reports an active trial with the right warning ramp', () => {
    expect(resolveSubscription(trialEndingIn(28), NOW).warning).toBe('ok');
    expect(resolveSubscription(trialEndingIn(7), NOW).warning).toBe('notice');
    expect(resolveSubscription(trialEndingIn(3), NOW).warning).toBe('warn');
    expect(resolveSubscription(trialEndingIn(1), NOW).warning).toBe('renew');
  });

  it('keeps full capabilities while the trial is live', () => {
    const v = resolveSubscription(trialEndingIn(10), NOW);
    expect(v.status).toBe('trial');
    expect(v.isActive).toBe(true);
    expect(v.capabilities).toEqual({ canUpload: true, canRunSplit: true, canApprove: true, canExport: true });
    expect(v.daysRemaining).toBe(10);
  });

  it('locks mutating actions once the trial has expired (view-only)', () => {
    const v = resolveSubscription(trialEndingIn(-1), NOW);
    expect(v.status).toBe('expired');
    expect(v.isActive).toBe(false);
    expect(v.capabilities).toEqual({ canUpload: false, canRunSplit: false, canApprove: false, canExport: false });
  });

  it('treats is_active=false as suspended regardless of dates', () => {
    const v = resolveSubscription({ ...trialEndingIn(20), isActive: false }, NOW);
    expect(v.status).toBe('suspended');
    expect(v.capabilities.canExport).toBe(false);
  });

  it('prefers a live paid subscription over the trial window', () => {
    const v = resolveSubscription({ ...trialEndingIn(-5), planKey: 'monthly', subscriptionEnd: inDays(20) }, NOW);
    expect(v.status).toBe('active');
    expect(v.plan).toBe('monthly');
    expect(v.isActive).toBe(true);
  });

  it('a fresh trial spans the full 30 days', () => {
    expect(resolveSubscription(freshTrial('Acme', 't1', NOW), NOW).daysRemaining).toBe(30);
  });
});

describe('buildRenewWhatsAppUrl', () => {
  it('embeds the company and tenant in a wa.me link', () => {
    const url = buildRenewWhatsAppUrl('Acme Foods', 'tenant-9');
    expect(url.startsWith('https://wa.me/')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Acme Foods');
    expect(decodeURIComponent(url)).toContain('tenant-9');
  });
});
