import { describe, it, expect } from 'vitest';
import { applyNavProfile, profileRoleFor } from './nav-profiles';
import type { NavSection } from './navigation';
import { Circle } from 'lucide-react';
import type { BranchRole } from './types';

/** A broad set of sections covering everything a salesman might see, so we can
 *  assert the profile pulls the right hrefs into Primary and folds the rest. */
function sampleSections(): NavSection[] {
  const item = (label: string, href: string) => ({ label, href, icon: Circle });
  return [
    {
      title: 'nav.sections.field',
      items: [
        item('nav.items.today', '/today'),
        item('nav.items.journey', '/today/journey'),
        item('nav.items.repApp', '/field'),
        item('nav.items.vanStock', '/field/stock'),
      ],
    },
    {
      title: 'nav.sections.sales',
      items: [
        item('nav.items.pos', '/sales/pos'),
        item('nav.items.invoices', '/sales/invoices'),
        item('nav.items.orders', '/sales/orders'),
        item('nav.items.customers', '/customers'),
      ],
    },
    {
      title: 'nav.sections.finance',
      items: [
        item('nav.items.collections', '/collections'),
        item('nav.items.cashbox', '/cashbox'),
      ],
    },
    {
      title: 'nav.sections.catalog',
      items: [
        item('nav.items.products', '/products'),
        item('nav.items.dashboard', '/dashboard'),
      ],
    },
  ];
}

describe('profileRoleFor', () => {
  it('returns null for admin/manager (full system)', () => {
    expect(profileRoleFor(['admin'])).toBeNull();
    expect(profileRoleFor(['manager'])).toBeNull();
    expect(profileRoleFor(['salesman', 'admin'])).toBeNull();
  });

  it('maps driver to the salesman profile', () => {
    expect(profileRoleFor(['driver'])).toBe('salesman');
  });

  it('picks the most senior role when several are held', () => {
    expect(profileRoleFor(['salesman', 'supervisor'])).toBe('supervisor');
    expect(profileRoleFor(['accountant', 'branch_manager'])).toBe('branch_manager');
  });

  it('returns null for a role without a profile', () => {
    expect(profileRoleFor(['custom_role' as BranchRole])).toBeNull();
  });
});

describe('applyNavProfile', () => {
  it('builds a 5-item Primary + curated More for a salesman', () => {
    const out = applyNavProfile(sampleSections(), ['salesman']);
    expect(out).toHaveLength(2);
    const [primary, more] = out;
    expect(primary.title).toBe('nav.sections.primary');
    expect(primary.items.map((i) => i.href)).toEqual([
      '/today',
      '/sales/pos',
      '/collections',
      '/customers',
      '/field/stock',
    ]);
    expect(more.title).toBe('nav.sections.more');
    const moreHrefs = more.items.map((i) => i.href);
    // Primary hrefs are NOT repeated in More.
    for (const h of primary.items.map((i) => i.href)) {
      expect(moreHrefs).not.toContain(h);
    }
    // Field-relevant secondary screens stay in More…
    expect(moreHrefs).toContain('/sales/invoices');
    expect(moreHrefs).toContain('/sales/orders');
    expect(moreHrefs).toContain('/cashbox');
    // …but wrong-role / back-office screens are HIDDEN from the menu entirely
    // (allowlist), not merely demoted — this is the core of the simplification.
    expect(moreHrefs).not.toContain('/dashboard');
    expect(moreHrefs).not.toContain('/products');
  });

  it('hides every non-allowlisted visible item for the salesman', () => {
    const sections: NavSection[] = [
      {
        title: 'nav.sections.distribution',
        items: [
          { label: 'a', href: '/distribution/sales-summary', icon: Circle },
          { label: 'b', href: '/distribution/routes', icon: Circle },
          { label: 'c', href: '/warehouses', icon: Circle },
          { label: 'd', href: '/inventory/low-stock', icon: Circle },
          { label: 'e', href: '/sales/invoices', icon: Circle }, // allowlisted
        ],
      },
    ];
    const out = applyNavProfile(sections, ['salesman']);
    const more = out.find((s) => s.title === 'nav.sections.more');
    expect(more?.items.map((i) => i.href)).toEqual(['/sales/invoices']);
  });

  it('tags More items with their source section for sub-headers', () => {
    const out = applyNavProfile(sampleSections(), ['salesman']);
    const more = out.find((s) => s.title === 'nav.sections.more')!;
    const invoices = more.items.find((i) => i.href === '/sales/invoices');
    expect(invoices?.group).toBe('nav.sections.sales');
  });

  it('applies a hide denylist (no allowlist) for the warehouse keeper', () => {
    const sections: NavSection[] = [
      {
        title: 'nav.sections.main',
        items: [
          { label: 'a', href: '/inventory/requests', icon: Circle }, // primary
          { label: 'b', href: '/sales/pos', icon: Circle }, // hidden
          { label: 'c', href: '/collections', icon: Circle }, // hidden
          { label: 'd', href: '/reports', icon: Circle }, // kept in More
        ],
      },
    ];
    const out = applyNavProfile(sections, ['warehouse_keeper']);
    const more = out.find((s) => s.title === 'nav.sections.more');
    // /sales/pos + /collections are denied; /reports survives in More.
    expect(more?.items.map((i) => i.href)).toEqual(['/reports']);
  });

  it('only promotes a primary item when its href is actually visible', () => {
    // Salesman who cannot reach /collections — that primary slot drops out.
    const sections: NavSection[] = [
      { title: 'nav.sections.field', items: [{ label: 'x', href: '/today', icon: Circle }] },
    ];
    const out = applyNavProfile(sections, ['salesman']);
    const primary = out.find((s) => s.title === 'nav.sections.primary');
    expect(primary?.items.map((i) => i.href)).toEqual(['/today']);
  });

  it('de-duplicates More by href', () => {
    // /sales/invoices is allowlisted for the salesman; appears in two sections.
    const sections: NavSection[] = [
      { title: 'a', items: [{ label: 'a', href: '/sales/invoices', icon: Circle }] },
      { title: 'b', items: [{ label: 'b', href: '/sales/invoices', icon: Circle }] },
    ];
    const out = applyNavProfile(sections, ['salesman']);
    const more = out.find((s) => s.title === 'nav.sections.more');
    expect(more?.items.filter((i) => i.href === '/sales/invoices')).toHaveLength(1);
  });

  it('leaves sections unchanged for admin/manager', () => {
    const sections = sampleSections();
    expect(applyNavProfile(sections, ['admin'])).toBe(sections);
    expect(applyNavProfile(sections, ['manager'])).toBe(sections);
  });

  it('leaves sections unchanged for elevated users (super-admin / platform owner)', () => {
    const sections = sampleSections();
    expect(applyNavProfile(sections, ['salesman'], { isSuperAdmin: true })).toBe(sections);
    expect(applyNavProfile(sections, ['salesman'], { isPlatformOwner: true })).toBe(sections);
  });

  it('leaves sections unchanged for a role without a profile', () => {
    const sections = sampleSections();
    expect(applyNavProfile(sections, ['custom_role' as BranchRole])).toBe(sections);
  });

  it('builds a Primary for the supervisor profile', () => {
    const sections: NavSection[] = [
      {
        title: 'nav.sections.field',
        items: [
          { label: 'a', href: '/approvals/queue', icon: Circle },
          { label: 'b', href: '/supervisor', icon: Circle },
          { label: 'c', href: '/reports', icon: Circle },
          { label: 'd', href: '/settings', icon: Circle },
        ],
      },
    ];
    const out = applyNavProfile(sections, ['supervisor']);
    const primary = out.find((s) => s.title === 'nav.sections.primary');
    expect(primary?.items.map((i) => i.href)).toEqual([
      '/approvals/queue',
      '/supervisor',
      '/reports',
    ]);
    const more = out.find((s) => s.title === 'nav.sections.more');
    expect(more?.items.map((i) => i.href)).toEqual(['/settings']);
  });
});
