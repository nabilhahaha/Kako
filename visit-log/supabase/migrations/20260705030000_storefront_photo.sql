-- Separate the storefront photo from the visit gallery.
-- Store Front Photo lives on the visit as dedicated columns (storage paths in
-- the same private visit-images bucket). Visit gallery photos keep using
-- visit_photos, now tagged with a type so the two never mix. Both columns are
-- nullable so existing visits keep working (they fall back to their first
-- gallery photo as the storefront until a dedicated one is captured).

alter table public.visits
  add column storefront_photo_url text,
  add column storefront_thumbnail_url text,
  add column storefront_taken_at timestamptz;

alter table public.visit_photos
  add column type text not null default 'visit'
  check (type in ('visit', 'storefront'));
