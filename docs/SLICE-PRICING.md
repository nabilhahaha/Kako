# Slice — Pricing Module (separate from customer master) — Design Review

> **Design for approval — no build yet.** A standalone **Pricing module**: a
> deterministic price-resolution engine layered over the existing base price +
> price lists + wholesale tiers, adding customer/segment/channel/branch pricing,
> effective dates, change history, a promotion-pricing hook (S5), and explicit
> **price priority rules**. Additive; reuses what exists; **independent of the
> customer record** (customers only *reference* segment/channel/branch — the
> engine reads those to resolve a price).

---

## 1. Goal (owner request)
Price Lists · Price List Items · Customer-specific · Channel-specific ·
Segment-specific · Branch-specific pricing · Effective dates · Price change
history · Promotion pricing · **Price priority rules**.

## 2. Grounding — what exists today
- **Base price:** `erp_products_catalog.sell_price` (and `cost_price`).
- **Price lists:** `erp_price_lists` (`branch_id` nullable → NULL = global,
  `is_default`, `is_active`) + `erp_price_list_items` (`price_list_id`,
  `product_id`, `unit_price`, UNIQUE per list+product). **Branch/global list
  pricing already exists.**
- **Tiers (= S3 "price group"):** `erp_wholesale_tiers` (company tiers) +
  `erp_wholesale_customer_tier` (`customer_id → tier_id`). Wholesale pricing logic
  in 0060; electrical multi-tier in 0096.
- **S3 customer dimensions:** `customer.segment_id` / `channel_id` / `region_id`
  / `area_id` / `branch_id` (company-managed master data) — the keys the engine
  prices against.
- **Gap:** no **effective dating**, no **price-change history**, no unified
  **priority resolution** across these sources, and no segment/channel pricing.

## 3. Proposed model (additive; reuse the above as inputs)
A single dimension-scoped **price-rules** table feeding one resolver — rather than
a table per dimension:

**`erp_price_rules`** (company-scoped, RLS like other tenant tables):
| Col | Notes |
|---|---|
| `id, company_id` | tenant |
| `product_id` *(nullable)* | a specific product; null + `category_id` = category rule (future) |
| `category_id` *(nullable)* | product-category scope (phase 2) |
| `scope_type` | `customer` \| `segment` \| `channel` \| `tier` \| `branch` \| `region` \| `area` \| `global` |
| `scope_id` *(nullable)* | the customer/segment/channel/tier/branch/… id (null for global) |
| `price_type` | `fixed` (unit price) \| `percent_off` \| `amount_off` (off base/list) |
| `value` | numeric |
| `min_qty` *(default 1)* | quantity break |
| `priority` | explicit integer; higher wins ties (default derived from `scope_type`) |
| `valid_from` / `valid_to` *(nullable)* | **effective dating** (null = open) |
| `is_active`, audit cols | |

Existing `erp_price_lists`/`items` stay as a **list source**; tiers stay as the
**`tier` scope**. The engine treats base `sell_price` as the floor fallback.

## 4. Price priority rules (the core decision)
Deterministic resolution for (product, customer, branch, qty, date). Proposed
order (first match wins), each filtered by effective date + `min_qty`:

1. **Promotion price** (from S5 — a hook; see §6)
2. **Customer-specific** (`scope_type='customer'`)
3. **Segment-specific**
4. **Channel-specific**
5. **Tier / price group** (`erp_wholesale_customer_tier`)
6. **Branch-specific** (rule, or `erp_price_lists.branch_id`)
7. **Price list** (default/global list item)
8. **Base** `sell_price`

Ties within a level broken by explicit `priority` then most-recent `valid_from`.
Resolver: `erp_resolve_price(product_id, customer_id, branch_id, qty, at_date)
→ { price, source, rule_id }` (SECURITY DEFINER, used at order/invoice line entry
to suggest a price; manual override allowed + logged).

## 5. Effective dates + change history
- **Effective dates:** `valid_from`/`valid_to` on every rule (and optionally on
  list items via a thin extension) — the resolver filters to `at_date`.
- **History:** `erp_price_change_log` (append-only: rule/list-item id, old/new
  value, changed_by, changed_at, reason) written by triggers on rule/list-item
  INSERT/UPDATE — a full audit of every price change. (Or reuse `erp_audit_logs`;
  a dedicated table gives better price reporting — **decision §7.4**.)

## 6. Promotion pricing (S5 boundary)
Pricing provides the **resolver + priority slot #1**; the actual promotion
definitions/lifecycle are **S5** (`erp_promotions`). When S5 lands, the resolver
queries active promos first. This slice ships the framework + the hook, not the
promo engine — kept as separate slices.

## 7. Decisions to confirm (Pricing)
1. **Model** — single `erp_price_rules` (dimension-scoped, recommended) vs a table
   per dimension (customer/segment/channel/branch price tables)?
2. **Priority order (§4)** — confirm the 8-level order, esp. **segment vs channel
   vs tier** ranking and that **customer-specific beats segment/channel**.
3. **Reuse vs migrate** — keep `erp_price_lists`/`items` + `erp_wholesale_tiers`
   as engine inputs (recommended) vs fold them into `erp_price_rules`?
4. **History store** — dedicated `erp_price_change_log` (recommended, better price
   reporting) vs reuse `erp_audit_logs`?
5. **Granularity** — product-level rules now, **category-level** rules as phase 2
   (recommended)?
6. **Application** — resolver suggests the line price on sales order/invoice with a
   **manual override** (logged)? Confirm the entry points.
7. **Phasing** — **P-a** model + resolver + priority + effective dates + history;
   **P-b** management UI + order/invoice integration; **P-c** promotion pricing
   (with S5). Confirm.
8. **Permission/nav** — manage under a new `pricing.manage` permission, **Sales →
   Pricing**? Confirm gating.

*(Design only — nothing built. On your §7 answers I'll slice **P-a** first
(schema + resolver + priority + effective dating + history, with rolled-back-live
verification and unit tests for the priority resolver), bring its design/verify
back, and hold every production migration for approval. Independent of the
customer master throughout.)*
