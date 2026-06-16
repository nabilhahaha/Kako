# 04 — User Journeys

## Primary journey: Field User conducts a market visit (offline-capable)

```
Sign in → Home (Today) → tap "Start Visit"
   → Select customer (search/recent or + new)
   → Select location → capture GPS (geofence ✓/⚠ out of range)
   → Choose visit type → enter objective → "Start visit" (status: in_progress)
   → DURING VISIT (any order, all work offline):
        • Photos: open camera → category → shoot → caption  (auto GPS + time)
        • Competitor: + observation → name/product/price/promo/quality → attach photo
        • Opportunity: + → title/value/priority/due
        • Issue: + → type/severity/owner/due
        • Voice note: record → stop → save (transcribe later)
        • Action plan: + → action/responsible/target date
   → Enter summary + outcome → "End visit" (status: completed)
   → Optional: "Generate Visit PDF" (works offline)
→ Sync: when online, queue flushes → badges go Pending → Synced
```

**Offline branch:** every step above persists to IndexedDB immediately and renders without network. The Sync Center (B5) shows pending items; the user can keep working and the queue flushes automatically on reconnect.

## Supervisor / Area Manager journey: oversight

```
Sign in → Home → review team's visits (area scope)
   → Visits map: see today's coverage by pin/cluster
   → Open a visit → review photos, competitor data, issues
   → Assign/owns action plans; reassign owners
   → Issues list: triage by severity, set owners & due dates
   → Dashboards (area): visits by user, actions due, issues by category
   → Generate Customer Visit History report for a key account
```

## Regional / Business Manager journey: intelligence & decisions

```
Sign in → Executive Dashboard (region/all scope)
   → KPIs: total visits, visits by city, pipeline value, competitor activity, market trends
   → Pipeline dashboard: opportunities by stage; push stuck deals
   → Competitor dashboard: pricing/promotion trends across markets
   → Reports hub → Market Intelligence Report (date range + region)
        → Edge Function builds server PDF → download/share/email
   → Drill into outlier areas → assign actions to area managers
```

## Platform Admin journey: setup & governance

```
Sign in → Settings/Admin
   → Regions & areas: define geography
   → Users & roles: invite users, assign role + region/area scope
   → Customers/competitor catalog: seed master data
   → Org settings: geofence radius, currency, languages, retention
   → Audit logs: review sensitive changes
```

## Viewer journey: read-only consumption

```
Sign in → Dashboards (scoped, read-only)
   → Browse visits/opportunities/issues within scope
   → Export reports → cannot create/edit
```

## Key journey rules
- **Fast entry first:** "Start Visit" is one tap from Home; defaults are pre-filled (last customer, current GPS, sensible visit type).
- **Never blocked by network:** all capture flows complete offline; sync is invisible until it fails, then surfaced for retry.
- **Context anchoring:** photos, competitor data, opportunities, issues, actions, and voice notes are always created *inside a visit* so every observation is geo/time/customer-stamped — except opportunities/issues which may also be created standalone (visit optional).
- **Scope everywhere:** lists, dashboards, and reports respect the signed-in user's role + geographic scope via RLS.
