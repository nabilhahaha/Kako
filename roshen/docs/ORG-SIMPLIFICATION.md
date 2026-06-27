# Organization Simplification — Region → City → Distributor

Applied in migration **0008_org_simplify_distributor_city_scope.sql**
(Roshen project `wrkugzssuoxneftzappa` only). Additive + one constraint relax;
no data dropped. Areas & Branches remain in the database for future expansion.

## UI

Organization screen now shows **three tabs only**:

1. **Regions**
2. **Cities**
3. **Distributors** (renamed from "Agents")

Areas and Branches are hidden from the UI. The sidebar "Agents" item is renamed
**Distributors** and deep-links to `/organization?tab=distributors`; the legacy
`/agents` route redirects there.

## Distributor fields

| Field | Source | Notes |
|---|---|---|
| Name | `agent.name` | required |
| Code | `agent.code` | required, unique per company |
| Region | derived via `city.region_id` | filters the City list in the dialog |
| City | `agent.city_id` (new) | required; primary location |
| Channel | `agent.channel_id` | optional **primary** channel, picked from `channel` |
| Active / Inactive | `agent.is_active` | |
| Assigned Area Manager | `agent.area_manager_id` (new) | optional FK → `profile` (role `area_manager`) |

`agent.branch_id` is now **nullable** (distributors hang off City, not Branch).

## Schema delta (0008)

- `agent.city_id` → `city(id)` (nullable, `on delete set null`)
- `agent.area_manager_id` → `profile(id)` (nullable, `on delete set null`)
- `agent.branch_id` → made **nullable**
- `org_level` enum → adds `'city'`
- `user_scope.city_id` → `city(id)` (nullable, `on delete cascade`)
- `my_area_ids()` → now also resolves **city scope** and **city-based
  distributors** (region/area/branch/agent resolve exactly as before)
- `agent_read` policy → also exposes city-based distributors that fall in an
  assigned region/city

## Channels

The `channel` table is flexible (per-company rows). Default Roshen KSA set
(seeded): Traditional Trade, Modern Trade, Wholesale, Cash Van, Discounter,
Key Account, Internal / GFF, E-commerce, B2B, Other (+ HoReCa, pre-existing).

- A distributor has **one primary channel** (`agent.channel_id`).
- **Raw Data Upload** still resolves channel **per row** via `value_mapping`
  (dimension `channel`), because one distributor file can contain multiple
  channels. The distributor's primary channel does not constrain row mapping.
- Channel management UI (Admin add/edit) is **not** a main Organization tab;
  proposed as a small section under **Settings** in a later step. Writes are
  already Admin-only (`channel_write` = `is_admin()`).

## Area Manager visibility (data model ready; assignment UI later)

`user_scope` now supports assigning, per Area Manager:
- **Region(s)** → `user_scope.region_id`
- **City/Cities** → `user_scope.city_id` (new)
- **Distributor(s)** → `user_scope.agent_id`

RLS (`my_area_ids()`) already resolves these. The assignment screen lives under
**Users & Scopes** and is a later step (Company Manager + Admin can write
`user_scope`; Area Managers stay read-only on master data).

## Roles

- **Admin** — add/edit Regions, Cities, Distributors (and Channels).
- **Company Manager** — view all; assign visibility scope to Area Managers.
- **Area Manager** — view only assigned Regions / Cities / Distributors;
  cannot edit master data in MVP.
