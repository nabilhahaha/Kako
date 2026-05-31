# VANTORA — Platform Architecture Overview (one page)

A high-level map. Deep detail lives in [`ARCHITECTURE.md`](ARCHITECTURE.md);
this is the orientation view.

## Stack
- **Next.js 15** (App Router, RSC, Server Actions, Route Handlers) on Vercel.
- **Supabase Postgres 17** with **Row-Level Security on every table**; SECURITY
  DEFINER RPCs (pinned `search_path`, anon-revoked) for privileged operations.
- **pg_cron** (in-DB schedules), **pg_net** (async HTTP), **Supabase Vault**
  (integration credentials).
- Custom **i18n** (Arabic RTL + English LTR, parity-tested), HSL-token design
  system (navy/cyan).

## Tenancy & access
- **Companies → branches → users.** Every row is `company_id`-scoped; RLS helpers
  (`erp_user_company_id`, `erp_is_company_admin`, `erp_is_platform_owner`,
  `erp_is_platform_staff`, …) enforce isolation.
- **Three-layer permissions:** global defaults → business-type role templates →
  per-company overrides. Platform owner + internal staff tier sit above tenants.
- **Audit** everywhere via `erp_log_audit` → `erp_audit_logs`.

## The shared core (built once, inherited by all)
- **Entity Framework** (`src/lib/erp/entities.ts`) — neutral entity registry;
  standard fields contract (`company_id`, `branch_id`, `created_*`, `updated_*`,
  `status`, `external_id`); notes/attachments; per-entity capabilities (import,
  export, API, audit, custom fields).
- **Data engines** — Import (xlsx/csv/json), Export, Mapping Templates.
- **Extensibility** — Custom Fields (JSONB-on-row) + Dynamic Forms.
- **Workflow/Approval Engine** — entity-agnostic, conditional + parallel,
  SLA/escalation, notifications.
- **Billing & Subscriptions**, **Platform Ownership & Staff**.
- **Integration layer** — inbound `/api/v1`, outbound webhooks, connector
  framework + sync engine (see [`INTEGRATION.md`](INTEGRATION.md)).

## Modules on the core
Modules are **config, not code paths** — gated by *plan entitlement ∩ business
type ∩ per-company marketplace toggle*, never `if (businessType === …)`. A module
is independently adoptable and degrades gracefully when siblings are off. See
[`MODULE-CATALOG.md`](MODULE-CATALOG.md) and
[`MODULE-OWNERSHIP-MATRIX.md`](MODULE-OWNERSHIP-MATRIX.md).

## Request → data path
RSC/Server Action or `/api/*` route → Supabase client (user session = RLS, or
service-role for the inbound API / sync dispatcher) → entity-registry writers /
RPCs → RLS-enforced tables → audit. External systems reach the same entity
writers through `/api/v1` (inbound) and receive webhooks (outbound).

## Environments
Ephemeral cloud dev container; production Supabase project + Vercel. Migrations
are additive/idempotent, applied via a reviewed process (staging → guarded
production). Secrets live in runtime env / Vault, **never** in the app DB.
