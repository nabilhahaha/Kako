# Configuration Governance — Draft / Sandbox / Publish (future Platform Admin feature)

> Status: **planned / not implemented**. Captured during FE-5e so later config
> surfaces are built draft-aware. No behavior ships from this doc.

## Goal
Company admins must be able to **test configuration changes before they affect
live users**. Every company-level configuration change moves through
`Draft → Sandbox/Pilot → Publish`, with a full audit trail and rollback.

**Hard rule:** *no draft configuration affects live users until it is explicitly
published.*

## In scope (config types that must become draft-aware)
- New role · new permissions
- New capture form (form definition)
- New scoring weights (`erp_fe_score_weights`)
- New alert threshold (`erp_fe_alert_thresholds`)
- New dashboard setting
- New workflow / escalation rule

## Admin flow
1. **Create in Draft** — change saved but inert for live users.
2. **Assign to a demo/test user or pilot group** — scope the draft to a sandbox
   audience.
3. **Preview / test as that user** — impersonate (or "view as") to validate.
4. **Validate** permissions, dashboard visibility, alerts and forms behave.
5. **Publish** to a target audience:
   All users · specific Role · Branch · Area · Route · Team · specific Users.

## Audit trail (required on every governed change)
`created_by` · `tested_by` · `published_by` · `published_at` · **rollback option**
(revert to the previous published version). Keep version history per config key.

## Proposed shape (sketch, to design later)
A generic envelope so any config type plugs in without bespoke tables:

```
erp_config_changes (
  id, company_id, config_type,        -- 'role'|'permission'|'form'|'weights'|'threshold'|'dashboard'|'workflow'
  config_ref,                          -- the target key/id the change applies to
  state,                               -- 'draft'|'sandbox'|'published'|'archived'
  version, supersedes,                 -- version chain for rollback
  payload jsonb,                       -- the proposed config
  audience jsonb,                      -- {scope:'all|role|branch|area|route|team|users', ids:[...]}
  pilot_audience jsonb,                -- sandbox testers
  created_by, tested_by, published_by, published_at, created_at
)
```
Resolution at read time: a user sees a config value from (a) a **published**
change whose audience matches them, OR (b) a **draft/sandbox** change only if
they are in its pilot audience ("view as" / impersonation). Live users never
resolve drafts.

## Alignment with what already exists (lowers future cost)
The FE-5 work already leans this way and should be the template:
- **Scoped resolution** is already the norm — weights resolve
  `rep → route → company → pack` (`erp_fe_resolve_weights`); thresholds resolve
  `company → global → fallback` (`erp_fe_threshold`). Adding a draft/published
  layer is an extra, audience-filtered tier on top of these resolvers.
- **Open classification** — `category`/`rule_key` (alerts) and weight `state`
  are free-form/extensible, so new governed configs need no schema churn.
- **Audit + RLS patterns** — `erp_audit_capture` triggers and company-admin RLS
  are already standard; the governance envelope reuses them.
- **Audience targeting** primitives exist: roles, branches, `region`/`area`,
  routes, teams (`reports_to` / `erp_fe_team`), and user ids.

## Notes
- Pair with the existing Workflow & Approval engine (see
  `WORKFLOW-ENGINE-ROADMAP.md`): publishing a governed change can itself require
  an approval workflow.
- Impersonation / "view as" must be permission-gated and fully audited.
