# Company Onboarding Wizard — UX & Product Design Package

**Design only — no implementation.** A business-friendly, **mobile-first**, wizard-driven
experience that lets a **non-technical Company Admin** stand up an entire company. Honors
the frozen Core UX principle: no RLS / tables / `reports_to` / permission-matrix internals;
visual, guided, safe by default.

## Design principles
- **Mobile-first**: every step works one-handed on a phone; desktop is an enhancement.
- **Template-first**: pick an industry → everything pre-filled → admin edits, rarely builds from scratch.
- **One concept per screen**: each step asks for one clear thing in business language.
- **Always safe**: autosave + resume, undo, non-destructive, can't break the company.
- **Show the effect, not the mechanism**: "Who can see what" previews instead of policy/`reports_to`.
- **Bilingual / RTL**: Arabic & English, full RTL mirroring.

---

## 1. Complete user journey

**Persona:** "Mona", an operations manager (non-technical) setting up her FMCG distributor.
**Entry:** Platform Owner creates the company + emails Mona an invite → she lands in the wizard.

```
Invite ─► Welcome ─► Company basics ─► Pick industry ─► Organization ─► Reporting
        ─► Roles ─► Products ─► Units ─► Invite users ─► Review ─► GO-LIVE ─► Dashboard
                         (autosave + resume at any point; re-editable later from Settings)
```

| Stage | Mona's goal | She feels | Success signal |
|---|---|---|---|
| Welcome | "What do I need to do?" | oriented | sees a short checklist + time estimate |
| Basics | enter company facts | quick | 6 fields, mostly pre-filled |
| Industry | "start from something" | relieved | picks FMCG → rest pre-built |
| Organization | draw my branches/teams | in control | drag-drop chart appears |
| Reporting | who manages whom | clear | sees "who sees what" preview |
| Roles | what each job can do | confident | toggles in plain words |
| Products | classify my products | familiar | folder tree + import |
| Units | pack/carton sizes | guided | "1 carton = 24 units" form |
| Users | invite my team | done | invites sent |
| Go-Live | "am I ready?" | reassured | green checklist → Activate |

**Exit:** company is live; the same builders live under **Settings → Company Setup** for
ongoing edits.

---

## 2. Navigation model (wizard shell)

- **Top:** company name · step title · **Save & exit** (resumes later).
- **Progress rail:** vertical on desktop, **horizontal scrollable chips** on mobile; each
  chip shows ✓ done / ◐ in-progress / ○ to-do. Tap a done step to revisit.
- **Bottom action bar (sticky):** `Back` · `Save` · **`Next`** (primary). `Next` is enabled
  only when the step's required minimum is met (with inline hints, never a dead end).
- **Resume:** re-entering the wizard returns to the last incomplete step; a banner shows
  "3 of 9 done — pick up where you left off".
- **Skip-safe:** non-blocking steps offer "I'll do this later" (flagged in the Go-Live
  checklist, not lost).

```
 MOBILE shell                          DESKTOP shell
┌─────────────────────────┐          ┌───────────┬───────────────────────────┐
│ Acme Foods   [Save&exit]│          │ ① Basics ✓│  Step title                │
│ ●─●─◐─○─○─○─○─○─○  (3/9) │          │ ② Industry│  ───────────────────────  │
│─────────────────────────│          │ ③ Org    ◐│  [ screen content ]        │
│                         │          │ ④ Report  │                            │
│   [ screen content ]    │          │ ⑤ Roles   │                            │
│                         │          │ ⑥ Products│                            │
│                         │          │ ⑦ Units   │                            │
│─────────────────────────│          │ ⑧ Users   │                            │
│ [Back]  [Save]  [Next ▸]│          │ ⑨ Review  │  [Back]      [Save] [Next ▸]│
└─────────────────────────┘          └───────────┴───────────────────────────┘
```

---

## 3. Screen-by-screen flow (mobile-first wireframes)

### Step 0 — Welcome
Purpose: orient + set expectations. One CTA.
```
┌─────────────────────────┐
│  👋 Welcome, Mona       │
│  Let's set up Acme Foods│
│                         │
│  You'll do 9 quick steps│
│  ~15 min · save anytime │
│                         │
│  ✓ Your branches & teams│
│  ✓ Who reports to whom  │
│  ✓ Roles, products, units│
│                         │
│      [ Start setup ▸ ]  │
└─────────────────────────┘
```

### Step 1 — Company basics
Validation-light, mostly pre-filled by the Platform Owner.
```
┌─────────────────────────┐
│ Company basics          │
│ Name   [ Acme Foods    ]│
│ Country[ Egypt        ▾]│
│ Currency [ EGP        ▾]│
│ Time zone[ Africa/Cairo▾]│
│ Logo   [  ⬆ upload ]    │
│                         │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 2 — Pick your industry (template)
The pivotal "template-first" moment — seeds Org, Roles, Products, Units.
```
┌─────────────────────────┐
│ What kind of business?  │
│ ┌────────┐ ┌────────┐   │
│ │ 🥫 FMCG │ │💊Pharma│   │
│ └────────┘ └────────┘   │
│ ┌────────┐ ┌────────┐   │
│ │🚚Distrib│ │🛒Retail│   │
│ └────────┘ └────────┘   │
│  ○ Start blank          │
│  "FMCG sets up regions, │
│   teams, reps, roles &  │
│   product levels for you"│
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 3 — Organization (drag-and-drop chart)
Visual tree. Tap **+** to add under a node; long-press to drag/move; tap a node to edit/
assign. Levels are renamable; "Add level" tucked in "More".
```
┌─────────────────────────┐
│ Your organization       │
│  Acme Foods             │
│   └ North Region        │
│      └ Cairo Area       │
│         └ Cairo Branch  │
│            └ Team Hany ⋮│
│               └ + add   │
│  [＋ Add branch]        │
│  ⚙ More: rename levels  │
│ Tip: drag a box to move │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```
Node editor (bottom sheet on mobile):
```
│ Team Hany               │
│ Name [ Team Hany       ]│
│ Manager [ pick person ▾]│
│ Members [ + add people ]│
│ [Delete]        [Done]  │
```

### Step 4 — Reporting (who reports to whom)
Same tree, manager lens + the **plain-language visibility preview**.
```
┌─────────────────────────┐
│ Who reports to whom?    │
│  Mona (Director)        │
│   └ Sara (Regional)     │
│      └ Hany (Supervisor)│
│         └ Ali (Rep)     │
│         └ Omar (Rep)    │
│ Drag a person under     │
│ their manager.          │
│ ┌─ Preview ───────────┐ │
│ │ Hany will see: Ali &│ │
│ │ Omar's customers,   │ │
│ │ visits, sales.      │ │
│ └─────────────────────┘ │
│ ⚠ 1 person has no manager│
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 5 — Roles & permissions (plain language)
Cards per role; **capability groups with descriptions**; clone/preset.
```
┌─────────────────────────┐
│ Roles (from FMCG preset)│
│ [Sales Rep]  [Supervisor]│
│ [Cashier] [Accountant]…  │
│  ▸ Sales Rep            │
│   Selling               │
│    ☑ Sell to customers  │
│    ☑ Collect payments   │
│   Cash                  │
│    ☐ Open the cash box  │
│   "This role can sell & │
│    collect, not settle."│
│  [Clone role] [+ New]   │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 6 — Products (hierarchy + import)
Folder-style levels (renamable) + drag products in / bulk import.
```
┌─────────────────────────┐
│ Product structure       │
│ Category ▸ Brand ▸ SKU  │
│  Beverages              │
│   └ Cola Co             │
│      └ Cola 330ml       │
│      └ Cola 1L          │
│  [＋ Add level] [Import] │
│  🔍 find product…       │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 7 — Units of measure (guided)
No factors/maths exposed — sentence-style forms + live preview.
```
┌─────────────────────────┐
│ How are products packed?│
│ Base unit  [ Piece    ▾]│
│ 1 Pack   =  [ 6 ] Pieces│
│ 1 Carton =  [ 4 ] Packs │
│ ┌ Preview ─────────────┐│
│ │ 1 Carton = 24 Pieces ││
│ └──────────────────────┘│
│ Barcode (optional) [   ]│
│ ☑ Apply to all in Brand │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 8 — Invite users & assign
Invite by phone/email, pick role + place on the chart.
```
┌─────────────────────────┐
│ Invite your team        │
│ [ + Invite person ]     │
│  Ali  · Sales Rep · Team│
│  Hany · Supervisor      │
│  …                      │
│ [ Import from file ]    │
│ 3 invited · 0 pending   │
│ [Back]  [Save]  [Next ▸]│
└─────────────────────────┘
```

### Step 9 — Review & Go-Live
Business-language checklist; one **Activate** CTA.
```
┌─────────────────────────┐
│ Ready to go live?       │
│ ✓ Company details       │
│ ✓ Organization chart    │
│ ✓ Reporting set         │
│ ✓ Roles ready           │
│ ✓ Products & units      │
│ ◐ 1 user pending invite │
│                         │
│   [ Activate company ✓ ]│
│  "You can edit anything │
│   later in Settings."   │
└─────────────────────────┘
```

---

## 4. Mobile-first UX patterns
- **Touch targets** ≥ 44px; sticky bottom action bar; thumb-reachable primary CTA.
- **Tree on mobile** = indented list with **+ / ⋮** per row; **long-press-drag** to re-parent;
  "move to…" picker as a fallback for accessibility.
- **Editors** open as **bottom sheets**, not modals (one-handed).
- **Progress** = horizontal scrollable chips; **previews** collapse into expandable cards.
- **Import** = file picker + camera (scan a list) where useful.
- **Offline-tolerant**: autosave drafts locally; sync on reconnect.

## 5. Validation rules (business language, never technical)
| Step | Rule | Message |
|---|---|---|
| Basics | name, country, currency required | "Add a company name to continue." |
| Industry | one selection (or blank) | — |
| Organization | ≥1 branch-level node | "Add at least one branch." |
| Reporting | every non-top person has a manager | "Omar still needs a manager." |
| Roles | ≥1 admin-capable role; SoD presets safe | "Keep at least one admin role." |
| Products | ≥1 level + a root node | "Add your first category." |
| Units | one base unit; pack/carton > base | "A carton should be bigger than a piece." |
| Users | ≥1 active admin user | "Invite at least one admin." |
| Global | unique names per level; no cycles | "That would make a team report to itself." |

Validation is **inline + non-blocking where possible** (warn, allow "fix later"), with a
**hard gate only at Go-Live**.

## 6. Go-live checklist (the only hard gate)
```
✓ Company details complete
✓ Organization chart has ≥1 branch
✓ Everyone has a manager (or is top)
✓ Roles defined (≥1 admin)
✓ Product structure + base units
✓ ≥1 admin user active
( ◐ optional items can remain — shown, not blocking )
        → [ Activate company ]
```
On Activate: company status → live, dashboard opens, builders move to **Settings → Company
Setup** (same components, re-runnable, non-destructive).

## 7. Reusable component & interaction library (for the design system)
- **HierarchyTree** (org / reporting / product) — add, rename, drag-reparent, assign.
- **NodeCard / NodeEditor** (bottom sheet) — name, manager, members.
- **PersonPicker** — search users; assign role + node.
- **CapabilityGroup** — labeled permission group + description + toggles.
- **VisibilityPreview** — "X will see …" plain-language panel (renders the frozen subtree result).
- **UoMForm** — sentence-style conversions + live preview.
- **TemplateGallery** — industry cards.
- **ProgressRail / StickyActionBar / GoLiveChecklist**.
- **EmptyState** (friendly first-run prompts), **UndoToast**, **AutosaveBadge**.

## 8. Cross-cutting UX
- **Empty states**: every builder opens with a friendly prompt + an example ("Add your
  first branch — e.g., Cairo Branch").
- **Errors**: human, actionable, no codes.
- **Accessibility**: keyboard tree nav, screen-reader labels, contrast, drag alternatives.
- **i18n / RTL**: Arabic + English, mirrored layout, localized examples.
- **Help**: one-line "what this means" per step; no manual required.

---

# Part II — Reuse & Coverage Audit (extend, don't rebuild)

**Finding:** the platform already has engines, tables, **and screens** for almost every
onboarding area — including an existing **`setup-wizard.ts`** (per-business-type profiles,
module toggles, auto-seeded roles via `erp_apply_setup_modules` / `erp_seed_company_roles`).
**The onboarding wizard is primarily an ORCHESTRATION + EXPOSURE layer** that walks the
admin through existing screens/engines in a guided, business-friendly order — not a set of
new isolated features.

## 1–2. Capability audit & classification
Legend: ✅ Implemented & reusable · ◐ Partial · ✎ Designed-not-implemented · ✗ Missing.

| Capability | Status | Existing engine / screen |
|---|:--:|---|
| Import jobs / Excel / CSV | ✅ | `erp_import_jobs`, `erp_import_mappings`; `settings/import`, `settings/data-onboarding` |
| Customer import | ✅ | import system (`customer.import`) |
| Product import | ✅ | import system (`product.import`) |
| Supplier import | ✅ | import system + `suppliers`, `erp_suppliers` |
| Opening balance / inventory import | ◐ | `erp_van_opening_balances` + import; general opening-stock UI partial |
| User import | ✅ | import system (`user.import`); `settings/users`, `settings/staff` |
| ERP / integration settings | ✅ | `erp_integrations/api_keys/webhooks/sync`; `settings/integrations(/*)`, `settings/integration-hub` |
| Route / territory / journey plan | ✅ | `erp_routes/route_customers/territories/territory_customers/journey_plans`; `territory`, `distribution/routes`, `field/journey`, `sales/journey` |
| Approval workflows / change requests | ✅ | `erp_workflow_*`, `erp_change_requests(+entities/targets/values)`; `settings/workflows`, `approvals/queue`, `approval-center` |
| Credit limit / payment terms approval | ✅ | `erp_credit_limit_requests`, customer requests; `distribution/credit-requests` |
| Customer closure / reactivation approval | ✅ | customer requests (close/reactivate) + the P-series rules (just shipped) |
| Document numbering / invoice sequence | ◐ | `erp_sequences` (auto-numbering works); **admin-configurable numbering UI missing** |
| Tax / VAT / currency | ✅ engine / ◐ settings UI | `erp_country_vat/tax_determination_rules/tax_registrations/tax_ledger`, `lib/tax/*`, `settings/einvoice`; company tax/currency **onboarding settings UI** partial |
| Dashboard / module selection | ✅ | `erp_modules/company_modules/business_type_modules`; `settings/features`, setup-wizard toggles |
| Workflow / operating templates (Cash Van, Pre-Sales, Hybrid, Retail, Pharmacy) | ✅ engine / ◐ operating-mode selector | `erp_workflow_templates`, `workflow-builder/templates.ts`, `settings/workflows/templates`, van-sales; explicit **operating-model picker** partial |
| Multi-UoM | ✅ | `erp_product_uoms`, `settings/uom` |
| Role templates & permission overrides | ✅ | `erp_role_template_versions`, `erp_company_role_permissions`, `settings/permissions`, setup-wizard role seeding |
| Industry templates | ✅ engine / ◐ gallery | `setup-wizard.ts` SetupProfiles per `business_type`, `erp_business_type_modules`, `pharmacy/onboarding` |

**Net:** ~14 ✅, ~4 ◐, **0 ✗**. The onboarding mostly **wires/exposes** what exists.

## 3. Updated wizard structure (Core + Advanced; business-friendly)
Keep the core flow short; group power-user areas under **Advanced Setup** (collapsible,
optional, skippable — flagged in Go-Live, not lost).

```
CORE (most companies)                         ADVANCED SETUP (optional / skippable)
1  Company Basics                ✅            7  Approval Matrix            ✅ (workflows/templates)
2  Industry / Operating Template ✅◐ setup-wizard 12 Financial Settings (Tax/VAT/Currency) ✅◐
3  Modules & Workflow Template   ✅            13 Document Numbering         ◐
4  Organization Structure        ✎ builder    14 Integrations              ✅
5  Reporting Hierarchy           ✅ (reports_to)
6  Roles & Permissions           ✅            (Advanced steps are reachable from a single
8  Product Hierarchy             ✅◐            "Advanced Setup" card on the Review screen,
9  Multi-UoM                     ✅            so the Core path stays ~9 steps.)
10 Data Import                   ✅
11 Territory / Routes / Journey  ✅
15 Users                         ✅
16 Dashboards                    ✅
17 Review / Sandbox / Go-Live    ✅◐ (sandbox = future)
```
Each step **embeds or deep-links the existing screen** in wizard chrome (progress rail +
Back/Next), so onboarding reuses the real engines and the same screens remain available
later under Settings.

## 4. Existing Platform Reuse Map
| Existing capability | Current location / module | How it appears in onboarding | Req/Opt | Gap / missing UI |
|---|---|---|:--:|---|
| Smart Setup Wizard (business profiles, modules, role seed) | `lib/erp/setup-wizard.ts` + platform/companies | **Steps 2–3 & 6 reuse it** (industry, modules, suggested roles) | Req | wrap in wizard chrome; richer gallery |
| Module/feature selection | `settings/features`, `erp_company_modules` | Step 3 (Modules) | Req | — |
| Workflow templates | `settings/workflows/templates` | Step 3/7 (operating + approval templates) | Req(core)/Opt(advanced) | operating-mode (Cash Van/Pre-Sales/Hybrid) labels |
| Org / regions / branches | `settings/organization`, `regions`, `branches` | Step 4 (visual builder) | Req | **drag-drop org-chart UI (new)** |
| Reporting (`reports_to`) | `settings/users`, frozen `erp_user_subtree` | Step 5 (visual reporting) | Req | visual tree on top of existing data |
| Roles & permissions | `settings/permissions`, role templates | Step 6 | Req | plain-language grouping polish |
| Approval matrix / change requests | `settings/workflows`, `approvals`, change-request engine | Step 7 (Advanced) | Opt | guided "approval matrix" summary view |
| Product hierarchy | catalog + `settings/msl`/`outlet-grades` | Step 8 | Req | configurable product-levels UI |
| Multi-UoM | `settings/uom`, `erp_product_uoms` | Step 9 (guided form) | Req | sentence-style UoM form |
| Data import | `settings/import`, `settings/data-onboarding` | Step 10 (embed) | Req | reuse as-is |
| Territory / routes / journey | `territory`, `distribution/routes`, `field/journey` | Step 11 | Opt | reuse; optional for some templates |
| Tax / VAT / currency | `settings/einvoice`, `lib/tax/*`, company currency | Step 12 (Advanced) | Opt | company tax/currency **settings screen** |
| Document numbering | `erp_sequences` (auto) | Step 13 (Advanced) | Opt | **numbering config UI (new)** |
| Integrations | `settings/integrations(/*)`, `integration-hub` | Step 14 (Advanced) | Opt | reuse as-is |
| Users | `settings/users`, `staff`, import | Step 15 | Req | reuse + invite flow |
| Dashboards | `dashboard`, vertical dashboards, modules | Step 16 | Req | pick default dashboards |

## 5. Template Differences (how onboarding changes per template)
| Template | Operating model | Steps emphasized | Defaults seeded | Steps hidden/optional |
|---|---|---|---|---|
| **FMCG Cash Van** | Sell + collect from the van | Org→Reporting→**Routes/Journey**→Products→UoM→Van load/opening balance | van-sales workflow, Cash-Van approval template, Unit/Pack/Carton | Pre-sales delivery scheduling |
| **FMCG Standard / Pre-Sales** | Order now, deliver later | Org→Reporting→**Routes/Journey**→Products→**Credit/terms approval** | pre-sales workflow, delivery step, credit approvals | Van opening balance |
| **Distribution** | Multi-branch supply + suppliers | Org(Region→Branch)→**Suppliers/Purchasing**→Products→Routes→Tax | supplier import, purchasing module, pallet UoM | Field journey (optional) |
| **Pharmacy** | Dispensing + batches | Org(Branch)→Products(**Generic→Brand**)→**Batches/expiry**→Tax | pharmacy workflow (reuse `pharmacy/onboarding`), strip/box UoM | Routes/journey |
| **Retail / POS** | Store checkout | Org(Store)→Products(Dept→Category)→**POS/cashbox**→Tax | retail/POS workflow, each/pack UoM | Routes, journey, pre-sales |
| **Custom** | Admin-defined | Blank levels; all steps available | none (build from scratch) | none |

Template choice (Step 2) **pre-selects modules, workflow template, role set, product
levels, and UoM presets**, then the admin edits — minimizing steps per vertical.

## 6. Implementation Readiness
- **Wire immediately (existing engine + screen — embed/deep-link):** Company Basics,
  Industry/Modules (setup-wizard), Workflow templates, Roles & permissions, Multi-UoM,
  Data Import, Integrations, Suppliers, Territory/Routes/Journey, Approvals/Change
  Requests, Credit/terms & closure/reactivation approvals, Users, Dashboards, Reporting
  (`reports_to` data exists; frozen subtree).
- **Needs only UI exposure (engine exists, build a friendlier/visual screen):** Org-chart
  drag-drop builder, visual reporting tree, configurable product-levels builder,
  sentence-style UoM form, plain-language role grouping, company **tax/VAT/currency
  settings** screen, **document-numbering config** screen, operating-mode (Cash Van /
  Pre-Sales / Hybrid) selector labels.
- **Requires backend work (small):** `erp_org_levels/nodes` + `erp_product_levels/nodes`
  (configurable hierarchy tables), `erp_onboarding_state` (wizard resume), numbering-config
  persistence, opening-stock import mapping for non-van inventory.
- **Future roadmap:** sandbox/preview-before-go-live, full drag-drop org chart with live
  "who sees what" simulation, industry-template gallery polish, multi-node user assignment.

---

## Status
UX & product design package — **design only, nothing implemented**. Now includes the
**Reuse & Coverage Audit**, the 17-step Core+Advanced structure mapped to existing
capabilities, the **Existing Platform Reuse Map**, **Template Differences**, and
**Implementation Readiness**. Conforms to the frozen Reference Architecture Baseline and
Core UX principle. The onboarding wizard **reuses and exposes existing engines/screens**
rather than rebuilding them. Next design deep-dives (when scheduled): Org Structure
Builder, Product Builder, Role Template Builder.
