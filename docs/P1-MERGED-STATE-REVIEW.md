# VANTORA — P1 Merged-State Review Package

> Final review after the Electrical P1 work merged to the base branch. All four
> approved actions complete. **No P2/P3 started.** Live state verified against the
> production project.
>
> **Screenshot note (honest):** no browser/egress to the app host in this
> environment, so this package gives exact **navigation paths + rendered
> structure + live data counts** instead of image captures. Static PNG mockups
> available on request; no fabricated screenshots.

---

## Completed actions

| # | Action | Result |
|---|---|---|
| 1 | Merge PR #54 (Electrical role defaults) | ✅ merged |
| 2 | Merge PR #55 (Electrical P1 screens) | ✅ merged |
| 3 | Add sample Supplier Returns to Demo Electric | ✅ **8 records** seeded (varied statuses + lines) |
| 4 | Apply non-destructive demo-cleanup | ✅ **9 active tenants** (1/vertical, Demo Electric primary); 30 archived (`is_active=false`, reversible) |

---

## 1. New screens

| Screen | Route | Permission | Live data (Demo Electric) |
|---|---|---|---|
| Serial Numbers | `/electrical/serials` | `electrical.rma` | 500 serials (440 in stock) |
| Warranties | `/electrical/warranties` | `electrical.rma` | 20 (20 active) |
| RMA | `/electrical/rma` | `electrical.rma` | 10 (9 open) |
| Supplier Returns | `/purchases/returns` | `purchasing.return` | **8** (completed/approved/draft/cancelled) |

Each: server-rendered, read-only, bilingual (ar/en), RTL-aware, with empty
states. Status shown as colored badges. Plus **4 dashboard widgets** (Active
Warranties · Open RMAs · Serialized Products · Supplier Returns) visible only with
`electrical.rma`.

## 2. Navigation paths

- **Sidebar → Electrical → Serial Numbers** → `/electrical/serials`
- **Sidebar → Electrical → Warranties** → `/electrical/warranties`
- **Sidebar → Electrical → RMA** → `/electrical/rma`
- **Sidebar → Purchasing → Supplier Returns** → `/purchases/returns`
- **Dashboard** → 4 Electrical widgets (each links to its screen)
- **Sidebar → Wholesale → …** → multi-tier pricing (existing)

The **Electrical** nav section appears **only** for tenants whose roles hold
`electrical.rma` (seeded only to electronics tenants) — pack-scoped, invisible to
all other verticals.

## 3. Demo walkthrough (Electrical, ~5 min)

1. **Log in** as the Demo Electric admin → dashboard shows the 4 Electrical
   widgets (Active Warranties 20 · Open RMAs 9 · Serialized 440 · Supplier
   Returns 8).
2. **Multi-tier pricing:** Wholesale screens → show Retail / Semi-wholesale /
   Wholesale / Project tiers.
3. **Serial tracking:** Electrical → Serial Numbers → filter/scan a serial; show
   status (in stock / sold / RMA), warehouse, cost.
4. **Warranty lookup:** Electrical → Warranties → show auto-calculated end date +
   active/expired status.
5. **RMA:** Electrical → RMA → walk a record through requested → approved →
   repair / replace / refund.
6. **Supplier return:** Purchasing → Supplier Returns → show a completed
   defective-batch return (stock out + accounting).

## 4. Demo accounts

| Field | Value |
|---|---|
| Tenant | **Demo Electric** (electronics) |
| Company ID | `6541791e-0f81-4a11-9f61-51aa34db7ace` |
| Admin login | **`electric@demo.com`** (role `admin`) |
| Password | not stored/readable (Supabase Auth hashes it) — **reset to a known demo value on request** |
| Other demo tenants (active) | عيادة الحياة (clinic) · صيدلية الشفاء (pharmacy) · Demo Wholesale (FMCG) · مطعم اللقمة الهنية (restaurant) · صالون الجمال (salon) · مغسلة النظافة (laundry) · سوبر ماركت الخير (supermarket) · فندق النيل (hotel) |

> Per-role demo logins (cashier / technician / warehouse / accountant) do **not**
> exist yet — only the admin login. I can create them with known passwords on
> request (demo-tenant only).

## 5. Roles (Demo Electric — Electrical defaults)

Suggested at setup (display labels; editable): System Administrator · General
Manager · Branch Manager · Sales Manager · Sales Supervisor · Sales
Representative · Projects Sales Representative · Purchasing Manager · Warehouse
Keeper · Warehouse Supervisor · Accountant · Warranty Officer · RMA Officer ·
Driver / Delivery Representative. ("Show all roles" reveals the full catalog.)

## 6. Permissions (gating the new screens)

| Permission | Granted to (Demo Electric roles) | Gates |
|---|---|---|
| `electrical.rma` | **admin, manager, technician** | Serials, Warranties, RMA screens + nav + dashboard widgets |
| `purchasing.return` | admin, manager | Supplier Returns screen + nav |

These permissions are seeded only to the electronics business type → the
Electrical screens are pack-scoped and never appear for other verticals.

## 7. Customer demo checklist

- [ ] Log in as `electric@demo.com` (reset password to a known demo value first).
- [ ] Dashboard shows 4 Electrical widgets with non-zero counts.
- [ ] Wholesale tiers visible (Retail/Semi/Wholesale/Project).
- [ ] Serial Numbers screen lists 500 serials with status badges.
- [ ] Warranties screen shows active/expired statuses + end dates.
- [ ] RMA screen shows 10 records across statuses.
- [ ] Supplier Returns shows 8 records with amounts + statuses.
- [ ] Confirm the Electrical section does **not** appear when logged into a
      non-electronics demo tenant (e.g. the clinic or pharmacy demo).
- [ ] Integrations area shows only live tiles (no "Coming Soon").
- [ ] Companies list (platform owner) shows only the 9 clean demo tenants.
- [ ] (Recommended) Real-device mobile + RTL spot-check on the above.

---

## Verification (live)
Active tenants **9** · Demo supplier returns **8** · `electrical.rma` → admin,
manager, technician · admin login `electric@demo.com`. tsc + full suite (287) +
build green at merge.

## Held (not started)
All **P2** (owner module grouping, per-company connector allow-list, owner
integration view, Companies-list polish, built-feature visibility, empty-state/
button passes) and **P3** (Cash Customer, Global Search, Quick Actions, Feature
Flags, Impersonation, company-scoped permission editor, role-template UI,
dashboard polish) — tracked in `docs/P1-REVIEW-AND-PLATFORM-PLAN.md`.

*P1 complete and merged. Platform is in a clean, demo-ready state across all nine
active verticals; the Electrical demo flow is now fully presentable in-app.*
