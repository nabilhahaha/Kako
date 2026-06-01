# VANTORA — Demo Accounts Plan & Runbook

> **Status: REVIEW — nothing applied to the live environment.** This document is
> the account plan; `supabase/demo/seed_demo_accounts.mjs` is the reviewable
> seeder (dry-run by default). Apply only after sign-off.

A complete demonstration environment across all nine demo tenants: one **admin**
login per tenant, plus **role-based** logins for the two primary demo paths
(**Clinic** and **Electrical**).

## Mechanism (same as real onboarding)

Accounts are created with the platform's supported flow — the **Supabase Auth
Admin API** (`admin.createUser`, exactly what the `admin-create-user` edge
function uses) — then assigned a role on the tenant's branch via
`erp_user_branches`:

1. `auth.users` — email + **bcrypt** password, email pre-confirmed (Auth Admin API).
2. `erp_profiles` — auto-created by the `erp_on_auth_user_created` trigger.
3. `erp_user_branches (user_id, branch_id, role)` — grants the role → permissions.

Passwords are only ever stored **bcrypt-hashed**; plaintext lives only in this
runbook.

## Credentials

- **Shared demo password:** `Demo@2026` (override at apply time with `DEMO_PASSWORD`).
- **Demo-only:** every account is in a curated demo tenant with no real data.
- **Guardrail:** never reuse this password for a real customer tenant. Rotate or
  tear down before any production pilot.

## Tenant admin logins (9)

Company IDs are the curated one-per-vertical KEEP list from
`supabase/demo/demo_tenant_cleanup.sql`.

| Vertical | Tenant | Admin email | Role |
|---|---|---|---|
| Electrical retail & wholesale | Demo Electric | `electric@demo.com` *(existing)* | `admin` |
| FMCG distribution / wholesale | Demo Wholesale | `admin.wholesale@demo.com` | `admin` |
| Clinic | عيادة الحياة | `admin.clinic@demo.com` | `admin` |
| Pharmacy | صيدلية الشفاء | `admin.pharmacy@demo.com` | `admin` |
| Restaurant | مطعم اللقمة الهنية | `admin.restaurant@demo.com` | `admin` |
| Salon | صالون الجمال | `admin.salon@demo.com` | `admin` |
| Laundry | مغسلة النظافة | `admin.laundry@demo.com` | `admin` |
| Supermarket / FMCG retail | سوبر ماركت الخير | `admin.supermarket@demo.com` | `admin` |
| Hotel | فندق النيل | `admin.hotel@demo.com` | `admin` |

> `electric@demo.com` already exists; the seeder re-syncs its password to the
> shared demo value (idempotent) rather than creating a duplicate.

## Role-based logins — Clinic (`doctor`/`receptionist`/`cashier` valid for `clinic`)

| Email | Role | Label | Demo purpose |
|---|---|---|---|
| `clinic.doctor@demo.com` | `doctor` | طبيب | **Core scenario:** patient visit / consultation |
| `clinic.reception@demo.com` | `receptionist` | موظف استقبال | Register patient, book appointment, collect |
| `clinic.cashier@demo.com` | `cashier` | أمين الصندوق | Visit payment / invoice |

## Role-based logins — Electrical (`technician`/`cashier`/`warehouse_keeper` valid for `electronics`)

| Email | Role | Label | Demo purpose |
|---|---|---|---|
| `electric.technician@demo.com` | `technician` | فني | Serials / Warranty / RMA (holds `electrical.rma`) |
| `electric.cashier@demo.com` | `cashier` | أمين الصندوق | POS sale + serial pick |
| `electric.warehouse@demo.com` | `warehouse_keeper` | أمين المخزن | Stock / receiving |

**15 accounts total** (9 admins + 3 clinic + 3 electric).

## How to apply (after sign-off)

```bash
# Service-role key is read from the env only — never committed.
export NEXT_PUBLIC_SUPABASE_URL="https://<project>.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"

# 1. Dry run — prints the full plan, changes nothing:
node supabase/demo/seed_demo_accounts.mjs

# 2. Apply — create/update accounts + assign roles (idempotent):
node supabase/demo/seed_demo_accounts.mjs --apply

# Reversal — remove every demo account (cascades to profile + branch rows):
node supabase/demo/seed_demo_accounts.mjs --teardown --apply
```

**Recommended:** run `--apply` against a Supabase **branch / staging** project
first, verify logins, then promote.

## Expected outcome

- 15 demo logins active (existing `electric@demo.com` re-synced, not duplicated).
- Each lands on a role-appropriate view: doctor → clinic patient/visit screens;
  receptionist → reception/appointments; technician → Electrical
  Serials/Warranty/RMA; cashier → POS.
- **No existing tenant data modified.** Fully reversible via `--teardown`.
- The seeder is **idempotent** — safe to re-run.
