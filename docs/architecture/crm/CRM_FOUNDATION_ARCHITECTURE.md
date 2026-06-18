# VANTORA — CRM Foundation Architecture (Approved)

**Status:** ✅ **APPROVED & frozen** — architecture only; **no code, no migrations,
no implementation** yet. Implementation planning deferred.
**Goal:** a generic, industry-neutral **CRM foundation** (accounts, contacts,
leads, opportunities/pipeline, a unified activity timeline, cases, campaigns) that
sits *on top of* the existing customer/field/sales primitives and serves every
vertical (FMCG field CRM, clinic/pharmacy patients, services, B2B).
**Discipline:** *reuse over rebuild; formalize what exists first; document gaps
separately; additive; flag-gated; multi-tenant + permission model preserved.*

> **Mostly greenfield, but on strong adjacent primitives — reuse them.** On `main`:
> `erp_customers` (rich accounts: hierarchy, route/salesman, credit, approval) with a
> **Customer 360** page (`customers/[id]/360`) and a Search provider; `erp_entity_notes`
> (generic notes on any entity), `erp_workflow_tasks` (tasks), `erp_visits`+compliance
> (field interactions), `erp_surveys`/`erp_survey_responses`, `erp_notifications`
> (comms), the activity feed + `erp_audit_logs`. **No** leads, contacts,
> opportunities/pipeline, campaigns, generic cases, or a unified timeline — those are
> the gaps (§ Gap register).

CRM does **not** duplicate sales documents; it owns the **pre-sale + relationship**
layer (lead→opportunity) and the **relationship spine** (account, contacts,
activities), handing off to the Sales Foundation at quote/order.

---

## A. Capability-by-capability (formalize vs gap)

1. **Accounts — EXISTS → formalize.** Reuse `erp_customers` as the CRM **account**
   (B2B outlet/company or B2C person), with the existing hierarchy, classification/
   channel (Sales §14), credit/AR context, and the **360 view**. No new account
   table — CRM augments the customer.
2. **Contacts — GAP.** Add `crm_contacts` (person under an account: name, role,
   phone/email, primary flag) — the people you deal with at an outlet/company.
   Reused by leads, opportunities, activities, comms.
3. **Leads — GAP.** Add `crm_leads` (source, owner, status new→qualified→converted/
   lost, score, contact info) — pre-account demand. **Lead routing/assignment +
   qualification** via Workflow; a converted lead creates an account (+contact) and
   optionally an opportunity.
4. **Opportunities & Pipeline — GAP.** Add `crm_opportunities` (account, owner,
   stage, value, currency, expected close, probability, win/loss reason) +
   configurable **pipeline stages** per company. Stage changes emit events; an
   opportunity hands off to a **sales quotation/order** (Sales §2-3). Forecasting
   from stage × value × probability.
5. **Activities & unified timeline — PARTIAL → formalize.** A CRM hallmark: a
   **single activity timeline per account/contact/opportunity**, built as a
   **projection** over already-existing sources — `erp_entity_notes` (notes),
   `erp_workflow_tasks` (tasks/follow-ups), `erp_visits` (field calls),
   `erp_notifications` (comms sent), `erp_events` (orders/invoices/payments), and
   `erp_audit_logs`. Add a thin `crm_activities` (calls/meetings/emails not already
   captured) + the timeline reader. Reuses the event bus + the Search projection
   pattern; no duplicate activity stores.
6. **Surveys & feedback — EXISTS → formalize.** Reuse `erp_surveys`/`responses`
   (already used in field visits) for satisfaction/NPS/merchandising feedback tied
   to an account/visit; surface on the 360 + timeline.
7. **Cases / Service tickets — GAP.** Add generic `crm_cases` (account, subject,
   priority, status, assignee, SLA) — complaints/service requests — with
   **SLA/escalation + routing via Workflow**. (Salon/clinic tickets stay
   vertical-specific; this is the neutral case model.)
8. **Campaigns & segmentation — GAP.** Add `crm_segments` (saved customer/lead
   filters) + `crm_campaigns` (target a segment via a channel, track responses).
   Segmentation reuses customer classification/channel/outlet-grade + Search
   filters; campaign sends reuse the notification/comms layer; responses feed leads/
   activities.
9. **Customer 360 — EXISTS → formalize/extend.** The `customers/[id]/360` page
   becomes the relationship hub: profile + credit/AR + open orders/invoices/returns
   + **timeline** (§5) + contacts + open opportunities/cases + visits/surveys. A
   read-projection; no new write model.
10. **Communications — EXISTS → reuse.** `erp_notifications` (in-app) + future
   channels (email/SMS/WhatsApp) via **egress-allow-listed connectors**; every
   send is an activity on the timeline.

---

## B. Integrations

- **Sales Foundation:** lead → opportunity → **quotation/order** hand-off (CRM owns
  pre-sale; Sales owns the document). Account = `erp_customers`; coverage/visits
  (Sales §7,15) are CRM field activities. Opportunity win can create a quote/order.
- **Workflow Platform:** lead routing/assignment, qualification, opportunity-stage
  approvals, **case SLA/escalation**, follow-up automation and reminders (the
  **tick** schedules next-actions / overdue tasks), campaign approval — all
  workflow definitions; comms/email connectors via the egress allow-list.
- **Search OS:** add **providers** for leads, contacts, opportunities, cases (find
  by name/phone/email/number); accounts already indexed. Deep-link to the 360.
- **Finance Foundation:** the 360 shows credit exposure / AR aging (read-only
  context); no posting from CRM itself (relationship layer, not financial).
- **Inventory:** none directly (CRM is pre-sale/relationship); product interest on
  opportunities references the catalog read-only.

## C. Multi-company support

RLS-first scoping (account/lead/opportunity/case → company) via platform primitives
(`erp_user_company_id`, `erp_is_platform_owner`, `(select auth.uid())`).
Per-company pipeline stages, lead sources, segments, case SLAs, and number
sequences. Ownership/assignment respects branch/territory access.

---

## D. Gap register (documented separately)

| Capability | State | Gap to add |
|---|---|---|
| Contacts | **Missing** | `crm_contacts` (people under accounts) |
| Leads | **Missing** | `crm_leads` + routing/qualification + convert→account |
| Opportunities & Pipeline | **Missing** | `crm_opportunities` + configurable stages + forecast |
| Activities (unified timeline) | **Partial** | `crm_activities` + **timeline projection** over notes/tasks/visits/events/comms |
| Cases / Service | **Missing** | generic `crm_cases` + SLA/escalation (Workflow) |
| Campaigns & Segmentation | **Missing** | `crm_segments` + `crm_campaigns` (reuse comms + Search filters) |

**Already present (formalize/reuse, not rebuild):** accounts (`erp_customers` +
360), notes (`erp_entity_notes`), tasks (`erp_workflow_tasks`), field visits
(`erp_visits`/compliance), surveys (`erp_surveys`/responses), communications
(`erp_notifications`), activity feed / audit.

---

## Design principles

CRM augments the customer rather than forking it; the **activity timeline is a
projection** over existing sources (reuse the event bus, not a new store);
pre-sale (lead/opportunity) hands off to the Sales document spine; approvals/SLA via
Workflow; discoverability via Search; comms via egress-allow-listed connectors;
additive + flag-gated; RLS-first multi-tenancy. No second customer model; no
per-industry CRM fork.

---

## Open questions for review

1. **Account model:** keep CRM account = `erp_customers` (recommended) vs. a separate
   CRM account that links to customer on conversion?
2. **Activity timeline:** pure read-projection over existing sources (recommended)
   vs. a materialized activity table fed by the bus?
3. **Pipeline:** single global pipeline vs. multiple per-company/team pipelines in V1?
4. **Cases:** generic `crm_cases` now, or defer until a service vertical needs it?
5. **Campaigns/comms channels:** in-app + email first; SMS/WhatsApp via connectors later?
6. **First consumer flow:** lead → qualify → opportunity → win → sales quote/order as
   the end-to-end CRM↔Sales validation.

*Architecture **APPROVED & frozen** — no code, migrations, implementation, or
branches. Implementation planning deferred until requested.*
