# Role Template & Company Override Policy — Validation Report (RULE 9)

**Mandatory, platform-wide. Implemented additively** in migration `0226` +
`src/lib/role-templates/` (flag `KAKO_ROLE_VERSIONING`, default OFF). All behaviors
proven by `src/lib/role-templates/role-templates.test.ts`.

## Policy → implementation map
| Rule | Requirement | How enforced |
|---|---|---|
| **1** | Company creation copies the template into an independent company role | Existing: `erp_seed_company_roles()` copies template → `erp_company_roles`/`erp_company_role_permissions` (0021/0022). Version recorded in `erp_company_role_versions.adopted_version` (0226) |
| **2** | Company A's changes affect Company A only | **Structural**: per-company rows under company-scoped RLS (`erp_user_company_id()`). Pure engine operates on one company's data only — test "company isolation" proves two companies upgrade independently |
| **3** | Platform template edits affect new companies only | Editing a template = publishing a **new version** in `erp_role_template_versions`; adoption is per-company + explicit. No backfill |
| **4** | Existing companies unchanged after template updates (no auto/silent/forced) | Nothing reads the new version for an existing company until it explicitly adopts it (`planUpgrade` is invoked only on request) |
| **5** | Template versioning (v1/v2/v3) | `erp_role_template_versions (role_key, version_no, status, snapshot)`, UNIQUE(role_key, version_no) |
| **6** | Upgrade explicit, never automatic | Upgrade = an explicit write of `adopted_version` + applying `planUpgrade`. No trigger/cron propagates |
| **7** | Platform Owner sees current / latest / upgrade-available per company | `versionStatus(versions, roleKey, adoptedVersion)` → `{ currentVersion, latestVersion, upgradeAvailable }` over the two tables |
| **8** | Company overrides survive upgrades | `planUpgrade(oldBase, newBase, override)` → `effective = (newBase ∪ override.added) \ override.removed`; scope + field overrides preserved. Test: "Can Approve Returns = YES survives" |

## Validation results (pure-engine tests)
- ✅ **Versioning** — `latestPublished` ignores drafts (v3 draft → latest = v2); `upgradeAvailable(1,2)=true`, `(2,2)=false`.
- ✅ **Current/latest/upgrade-available** — `versionStatus` returns the Platform-Owner view.
- ✅ **Override preservation** — after upgrade v1→v2, a company that **added** `returns.approve` keeps it, a company that **removed** `sales.collect` keeps it removed, and the new base's `sales.return` is added. Scope override (`area`) and field override (`margin: hidden`) survive.
- ✅ **Company isolation** — two companies upgrading the same template produce independent results; A's grant `x` never appears for B; B's revoke `b` never affects A.
- ✅ **Template isolation** — platform templates live in a global table (`erp_role_template_versions`); companies never write it (RLS `WITH CHECK (erp_is_platform_owner())`); company copies are separate rows.

## Isolation guarantees (multi-tenant)
- `erp_role_template_versions`: globally **readable** (templates are defaults), **writable only by the platform owner**.
- `erp_company_role_versions` + `erp_company_role_permissions`: **company-scoped RLS** — a tenant can only see/modify its own rows. Company B can never see, modify, or be affected by Company A's roles/permissions/versions.

## Verdict
**The mandatory policy is satisfied.** Platform templates define versioned defaults; companies own
independent copies; company customizations affect only themselves; template changes affect only future
companies unless an **explicit** upgrade is requested; and overrides are preserved across upgrades —
all additive, multi-tenant-safe, audit-first.
