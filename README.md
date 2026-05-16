# FieldSync

Mobile-first field sales platform for Roshen FMCG, distributed by Relia
across Saudi Arabia. Built for eight distinct user roles — from
salesmen recording visits in the field to executives drilling down into
strategic KPIs.

- **Stack:** React 18 + TypeScript + Vite + Tailwind + Supabase
- **UI:** Hand-written shadcn/ui primitives, Leaflet maps, Recharts
- **State:** Zustand (auth) + TanStack Query (server)
- **Forms:** React Hook Form + Zod
- **RTL-first:** IBM Plex Sans Arabic + Inter, full mirrored layout

---

## Quick start

```bash
git clone <repo-url>
cd kako
npm install
cp .env.example .env       # fill in Supabase URL + publishable key
npm run dev                # http://localhost:5173
```

### Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | Strict TS check, no emit |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (configured via `eslint.config.js` if present) |

### Environment variables

Required in `.env` (Vite picks them up via `import.meta.env`):

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Publishable key (RLS-safe) |

The Supabase service-role key must **never** appear in this file — it
would be bundled into the client. Use it only from server-side
functions if/when you add them.

---

## Database setup

Three idempotent migrations need to be applied once, in order, via
**Supabase Dashboard → SQL Editor**:

| Migration | What it does |
|---|---|
| `supabase/migrations/0001_visit_reasons_and_buckets.sql` | `visit_reasons` join table, `visit-photos` and `near-expiry-photos` storage buckets, adds `public.visits` to the `supabase_realtime` publication |
| `supabase/migrations/0002_promotions.sql` | `promotions` table with role-gated RLS, near-expiry status convention |
| `supabase/migrations/0003_audit_logs.sql` | `audit_logs` table for admin trail (admin-only SELECT, authed INSERT) |

All migrations use `IF NOT EXISTS` / `ON CONFLICT` / `DROP POLICY IF
EXISTS` so re-running is safe.

### Realtime setup

Migration 0001 adds `public.visits` to the `supabase_realtime`
publication, which is equivalent to toggling **Dashboard → Database →
Replication → visits**. No further UI step is required, but if you
later add tables you want streamed to the supervisor's live map,
either add them to the publication via SQL or toggle them in the
Dashboard.

The supervisor live map subscribes to `INSERT` events on `visits`
and invalidates the map query so new rep positions appear within ~1s.
If the publication isn't enabled, the page silently falls back to
manual refresh — no errors are thrown.

### Storage buckets

Migration 0001 creates two public buckets:

- `visit-photos` — photos attached to a visit (uploaded by the
  presales rep during the visit wizard)
- `near-expiry-photos` — product photos for near-expiry registrations

Public read so that supervisors / regional managers can view photos
during approval. Authenticated insert; rep uploads go to
`{visit_id}/{uuid}.{ext}`.

---

## User roles

The system has **eight roles**, each with a tailored set of screens.
The `homeForRole()` helper routes the user to the right starting screen
after login.

| Role | Route prefix | Primary screens |
|---|---|---|
| `presales_rep` | `/salesman` | Dashboard, customers, customer-360, visit wizard (3-step), visit history, near-expiry registration |
| `presales_supervisor` / `cashvan_supervisor` | `/supervisor` | Team dashboard, live map, visit approvals, near-expiry approvals, visit requests, financial-data requests (5-min TTL) |
| `regional_manager_roshen` | `/regional` | Regional KPIs, distributor performance, coverage map, final-stage approvals |
| `trade_marketing_manager` | `/trade-marketing` | Channel dashboard, promotion calendar, listing reports, near-expiry analytics |
| `top_management_relia` / `top_management_roshen` | `/executive` | Single-page exec dashboard with auto-refresh, anomalies, drill-downs, PowerPoint export |
| `admin_relia` | `/admin` | System health, user management, raw-data upload, settings (visit reasons + products), audit log |

Role assignment lives in `public.users.role`. The login flow reads it
and routes accordingly; `RoleGuard` enforces it per route.

---

## Architecture

```
src/
├── App.tsx                    Router + role guards
├── main.tsx                   Entry: StrictMode + QueryClient + Router
├── index.css                  Design tokens (CSS vars) + RTL + utilities
│
├── lib/                       Pure logic, no React
│   ├── supabase.ts            Configured client (auto-refresh, persist)
│   ├── types.ts               DB-aligned TypeScript types
│   ├── schemas.ts             Zod validators for every form
│   ├── permissions.ts         Role → label, role → home redirect
│   ├── queryKeys.ts           Single source of truth for cache keys
│   ├── audit.ts               Fire-and-forget audit logger
│   ├── excelParser.ts         xlsx → preview + standard-field map
│   ├── pptx.ts                Executive PowerPoint generator
│   └── utils.ts               cn(), currency, number, initials
│
├── stores/
│   └── authStore.ts           Zustand: session, profile, init flag
│
├── hooks/                     One file per feature area, all TanStack Query
│   ├── useAuth.ts             Session bootstrap + sign-in/out
│   ├── useGPS.ts              Permission-aware geolocation
│   ├── useDashboard.ts        Salesman KPIs (RPC)
│   ├── useCustomers.ts        Customers list + 360 (RPC)
│   ├── useVisits.ts           Visit history + creation
│   ├── useNearExpiry.ts       Products + near-expiry creation
│   ├── useTeam.ts             Supervisor team + performance view
│   ├── useApprovals.ts        Pending queues + decision mutations
│   ├── useVisitRequests.ts    Supervisor → rep visit assignments
│   ├── useFinancialRequests.ts TTL-bounded data requests
│   ├── useLiveMap.ts          Map data + Realtime channel
│   ├── useRegional.ts         Region/channel/near-expiry aggregations
│   ├── usePromotions.ts       Promotion CRUD
│   ├── useRegionalApprovals.ts Final-stage near-expiry queue
│   ├── useCoverageMap.ts      Region-scoped customers with coords
│   ├── useExecutive.ts        Hero KPIs + daily trend + anomalies
│   ├── useAdminStats.ts       System-health KPIs
│   ├── useUsersAdmin.ts       Paginated users + edits
│   ├── useReasonsAdmin.ts     Visit reasons CRUD
│   ├── useProductsAdmin.ts    Products CRUD
│   └── useAuditLogs.ts        Paginated audit log reader
│
├── components/
│   ├── ui/                    Hand-written shadcn primitives
│   │   ├── button, card, input, label, badge, avatar,
│   │   ├── skeleton, dialog, progress, sonner, textarea
│   ├── shared/                Cross-role helpers
│   │   ├── PageHeader, EmptyState, ErrorState,
│   │   ├── SkeletonCard, KPICard, ConfirmDialog,
│   │   └── DataTablePagination
│   ├── auth/                  AuthGuard, RoleGuard, LoginForm
│   ├── layout/                AppShell, TopBar, Sidebar, BottomNav
│   ├── customer/              CustomerCard, GradeBadge, HealthScore
│   ├── visit/                 VisitTypePicker, ReasonsPicker,
│   │                          GPSCapture, PhotoCapture, VisitCard
│   ├── near-expiry/           NearExpiryForm
│   ├── supervisor/            TeamMemberCard, ApprovalCard,
│   │                          CountdownPill, LiveMap
│   ├── analytics/             ChartCard, BarStatChart, LineStatChart,
│   │                          PieStatChart, CoverageMap (DRY for
│   │                          regional + trade-marketing + executive)
│   └── admin/                 DropzoneArea, ColumnMapper
│
└── pages/                     One file per route
    ├── auth/LoginPage
    ├── salesman/*
    ├── supervisor/*
    ├── regional/*
    ├── trade-marketing/*
    ├── executive/ExecutiveDashboard
    ├── admin/*
    ├── UnauthorizedPage, NotFoundPage
```

### Design system

CSS custom properties in `src/index.css` drive the entire palette:

```
--primary             Roshen red, used sparingly for CTAs
--success / --warning / --info / --destructive
--card / --background / --border
--foreground / --muted-foreground
```

Chart palette mirrors these in `components/analytics/ChartCard.tsx`
so Recharts stays on-brand.

### Bundle strategy

`vite.config.ts` declares `manualChunks` so heavy libraries are
isolated:

| Chunk | Approx. gzip | Loaded when |
|---|---|---|
| `react-vendor` | 54 kB | Always |
| `supabase-vendor` | 54 kB | Always |
| `query-vendor` | 13 kB | Always |
| `form-vendor` | 22 kB | Forms |
| `leaflet-vendor` | 45 kB | Maps |
| `charts-vendor` | 116 kB | Analytics pages |
| `xlsx-vendor` | 114 kB | Raw-data upload |
| `pptx-vendor` | 127 kB | Executive export |
| `index` (app) | 107 kB | Always |

A salesman on a feature phone pays ~280 kB gzipped. An executive
exporting PowerPoint loads more, but only when they actually do it.

---

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full Vercel walkthrough,
production checklist, and post-deployment verification steps.

---

## Contributing

### Branch and commit conventions

- Branch off `main`: `feat/<short-name>`, `fix/<short-name>`,
  `chore/<short-name>`, `db/<short-name>`.
- Conventional-ish commit subject: `feat(scope): ...`, `fix(scope): ...`,
  `db: ...`, `ci: ...`, `chore: ...`.
- Keep migrations as separate commits with a `db:` prefix so they can be
  cherry-picked into a release.

### Pull requests

CI runs typecheck + production build on every PR
(`.github/workflows/ci.yml`). All PRs should:

1. Pass CI (green check)
2. Touch one logical concern (avoid mega-PRs)
3. Include any new env vars in `.env.example`
4. If schema changes are needed, add a numbered migration under
   `supabase/migrations/NNNN_*.sql` and document it in the PR body

### Code style

- TypeScript strict mode is on, including `noUnusedLocals` and
  `noUnusedParameters`. Don't leave dead code; rename unused params to
  `_x` only if you genuinely need them for type signatures.
- Avoid `any`. If the DB types make it unavoidable, narrow with a type
  predicate at the boundary.
- Keep components under ~250 lines. Split when they grow.
- Don't add comments that just describe what the code does. Comments
  belong only when explaining a non-obvious why.
- All user-visible strings in Arabic, all code identifiers in English.

### Adding a new screen

1. Create the page under `src/pages/<role>/`
2. Wire it in `src/App.tsx` (under the matching `RoleGuard`)
3. Add it to the role's nav in `src/components/layout/Sidebar.tsx`
4. Loading + empty + error + retry states are mandatory
5. Mobile-test at 375px before opening the PR

---

## License

Proprietary — Roshen × Relia. Not for external distribution.
