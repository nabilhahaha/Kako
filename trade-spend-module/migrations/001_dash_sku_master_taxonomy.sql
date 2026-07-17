-- ============================================================================
-- Trade Spend Native Module — Migration 001
-- Target Supabase project: "Roshen" (ref wrkugzssuoxneftzappa)
-- Purpose: give dash_sku_master a permanent, structured product taxonomy so
--          Category becomes a read-only master attribute (single source of truth).
--
-- STATUS: AUTHORED, NOT APPLIED. Additive & non-breaking (nullable columns only).
--         Existing Dashboard / Trade Spend code ignores unknown columns, so this
--         cannot affect the running apps. Apply only after explicit approval.
--
-- Prepares for future growth: Brand > Category > Sub Category > Segment.
-- The extra fields may stay empty initially.
-- ============================================================================

alter table public.dash_sku_master add column if not exists brand        text;
alter table public.dash_sku_master add column if not exists category     text;
alter table public.dash_sku_master add column if not exists sub_category text;
alter table public.dash_sku_master add column if not exists segment      text;

comment on column public.dash_sku_master.brand        is 'Product taxonomy L1 (Trade Spend module). Read-only master attribute.';
comment on column public.dash_sku_master.category     is 'Product taxonomy L2. Single source of truth for Trade Spend category attribution.';
comment on column public.dash_sku_master.sub_category is 'Product taxonomy L3. Optional; may be empty initially.';
comment on column public.dash_sku_master.segment      is 'Product taxonomy L4. Optional; may be empty initially.';

-- Helpful index for the sales-attribution join path:
--   sales_fact.item_code -> dash_sku_master.sku -> category
create index if not exists idx_dash_sku_master_category on public.dash_sku_master (category);
