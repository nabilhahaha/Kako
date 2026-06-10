# VANTORA Staging — Schema Provisioning Runbook

Brings the dedicated staging project up to the **exact repository schema (PR #311)**
before any seed/demo data. My environment cannot reach Postgres directly (only
HTTPS), so the full 250-migration apply runs from a place that *can* reach the DB
— a GitHub Actions runner (recommended) or your machine.

## Target project
- **Name:** `vantora-staging`
- **Ref:** `rsjvgehvastmawzwnqcs`
- **DB host:** `db.rsjvgehvastmawzwnqcs.supabase.co` (port `5432`)
- **Status:** ACTIVE_HEALTHY (empty — no schema yet)

## What gets applied (the clean method)
`supabase/ci/setup-staging-project.sh`:
1. `supabase/ci/legacy-base.sql` — stubs the legacy FieldSync base tables that
   migrations 0001–0004 patch (a fresh project lacks them).
2. **all 250 `supabase/migrations/*.sql`** in filename order (identical to CI).
3. **schema-integrity verification** — fails loudly unless every key PR #311
   object exists (van-sales tables/RPCs, permission RPC, pricing rules, return
   reasons, 0268 scoped numbering index, …).

> It does **not** run `ci/bootstrap.sql` (that stubs a plain Postgres). A real
> Supabase project already provides `auth`/roles/extensions/storage, and we must
> not override Supabase's native `auth.uid()`. This mirrors the repo's
> `migrate-staging.yml` (migrations-only) + `legacy-base.sql` for a fresh project.

---

## ✅ Minimum manual step (recommended: GitHub Actions — no local tooling)

1. **Get the connection string.** Supabase dashboard → `vantora-staging` →
   **Project Settings → Database** → set/reset the **database password** → copy
   the **URI** connection string (direct, port 5432), e.g.
   `postgresql://postgres:<PASSWORD>@db.rsjvgehvastmawzwnqcs.supabase.co:5432/postgres`
2. **Add it as a repo secret.** GitHub → repo **Settings → Secrets and variables
   → Actions → New repository secret**:
   - Name: `STAGING_PROVISION_DATABASE_URL`
   - Value: the connection string from step 1.

That's it. **Tell me once the secret is set** — I'll trigger the
**“Provision staging schema”** workflow (`provision-staging.yml`) via the GitHub
API, watch it apply + verify the full schema, then immediately provision the two
reference tenants, demo users/passwords, run validation, verify all logins, and
deliver the login sheet + staging report + certification.

> The dedicated secret name avoids colliding with the auto-running
> `migrate-staging` workflow. Do **not** put this URL in `STAGING_DATABASE_URL`.

---

## Alternative: run it yourself (one command, needs a local checkout + psql)

```bash
DATABASE_URL='postgresql://postgres:<PASSWORD>@db.rsjvgehvastmawzwnqcs.supabase.co:5432/postgres' \
  bash supabase/ci/setup-staging-project.sh
```
Expected tail: `════ SCHEMA INTEGRITY OK — staging matches the repository (PR #311) ════`
then `DONE`. Tell me when it's green and I'll take over the seeding/verification.

---

## After the schema is applied (my part, via the Supabase API)
1. Provision **FMCG Reference Company** (Nile FMCG Distribution Group).
2. Provision **Clothing Store Reference Company**.
3. Create all demo users + set demo passwords (`Vantora#Demo1`), confirm emails.
4. Run the **109-assertion role validation** + workflow checks.
5. **Verify every login** (bcrypt match) and permissions.
6. Deliver the **Login Sheet**, **Staging Environment Report**, and **Final Demo
   Environment Certification**, plus the **tenant inventory** (the two new
   reference companies).

Nothing demo-related is written until the schema verification passes.
