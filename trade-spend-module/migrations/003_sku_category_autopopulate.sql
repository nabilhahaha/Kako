-- ============================================================================
-- Trade Spend Native Module — Migration 003
-- Target Supabase project: "Roshen" (ref wrkugzssuoxneftzappa)
-- Purpose: auto-populate dash_sku_master.category for the UNAMBIGUOUS items —
--          those that appear with exactly ONE category across ALL historical
--          Trade Spend activities. (Matched on description, case-insensitive.)
--
-- STATUS: AUTHORED, NOT APPLIED. Run only after 001, and only after approval.
-- Multi-category (conflict) items are intentionally EXCLUDED here — see the
-- Conflict Report and migration 004.
-- ============================================================================

update public.dash_sku_master set category = 'Johnny Krocker 1KG'
 where lower(description) = lower('Roshen Johnny Krocker Coconut Wafer with Coconut Cream in Chocolate 4 X 1kg');
update public.dash_sku_master set category = 'Johnny Krocker 1KG'
 where lower(description) = lower('Roshen Sweets Johnny Krocker Choco 4 X 1Kg');
update public.dash_sku_master set category = 'Johnny Krocker 1KG'
 where lower(description) = lower('Roshen Sweets Johnny Krocker Milk 4 X 1Kg');
update public.dash_sku_master set category = 'Roshetto'
 where lower(description) = lower('Roshen Roshetto Dark Chocolate 200 X 34G');
update public.dash_sku_master set category = 'Roshetto'
 where lower(description) = lower('Roshen Roshetto Milk Chocolate 200 X 34G');
update public.dash_sku_master set category = 'Roshetto'
 where lower(description) = lower('Roshen Roshetto Peanut 200 X 34G');

-- Verify:
--   select sku, description, category from public.dash_sku_master
--   where category is not null order by category, description;
