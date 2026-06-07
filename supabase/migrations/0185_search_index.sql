-- ============================================================================
-- 0185: Search OS Phase 1 — unified search index + ranking RPC
-- ----------------------------------------------------------------------------
-- Platform-wide search (Search OS V1). Additive, reuse-over-rebuild:
--   * erp_search_documents — ONE denormalized index (a projection; not a source
--     of truth). All entity-specific column knowledge lives in the TS provider
--     registry; this SQL knows only the GENERIC index schema.
--   * erp_search(...) — ranking RPC, SECURITY INVOKER so the index RLS tenant-
--     isolates results automatically. Category gating is passed in p_types.
-- No semantic/vector (out of V1) — no embedding column. Flag-gated in the app
-- (KAKO_SEARCH, default OFF); the schema is inert until the app uses it.
-- Depends on 0018 (erp_user_company_id / erp_is_platform_owner), 0005 (companies).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;
-- pg_trgm is already enabled on the platform.

CREATE TABLE IF NOT EXISTS erp_search_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid REFERENCES erp_companies(id) ON DELETE CASCADE,   -- null = global (e.g. global templates)
  branch_id    uuid,                                                  -- optional branch scope (denormalized; no FK)
  entity_type  text NOT NULL,                                         -- 'customer','product','invoice',...
  entity_id    text NOT NULL,                                         -- source PK (text; mirrors workflow record_id)
  title        text NOT NULL,
  subtitle     text,
  body         text,
  identifiers  text[] NOT NULL DEFAULT '{}',                          -- normalized codes/barcodes/phones/VAT/CR/doc#
  href         text NOT NULL,                                         -- deep-link route
  permission_key text,                                                -- reused capability key; null = no extra gate
  metadata     jsonb NOT NULL DEFAULT '{}'::jsonb,                    -- status/amount/date for display + filters
  trgm_text    text NOT NULL DEFAULT '',                              -- maintained by trigger (fuzzy/prefix)
  search_vector tsvector,                                             -- maintained by trigger (simple + unaccent, weighted)
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_erp_search_doc UNIQUE (entity_type, entity_id)        -- one document per source record (upsert key)
);

-- search_vector + trgm_text maintenance (trigger may use STABLE unaccent freely;
-- avoids the immutable-function-in-index pitfall by indexing a stored column).
CREATE OR REPLACE FUNCTION erp_search_documents_maintain() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.search_vector :=
      setweight(to_tsvector('simple', unaccent(coalesce(NEW.title,''))), 'A')
    || setweight(to_tsvector('simple', unaccent(array_to_string(coalesce(NEW.identifiers,'{}'),' '))), 'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(NEW.subtitle,''))), 'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(NEW.body,''))), 'C');
  NEW.trgm_text := unaccent(lower(
      coalesce(NEW.title,'') || ' ' || coalesce(NEW.subtitle,'') || ' '
      || array_to_string(coalesce(NEW.identifiers,'{}'), ' ')));
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_erp_search_documents_maintain ON erp_search_documents;
CREATE TRIGGER trg_erp_search_documents_maintain BEFORE INSERT OR UPDATE ON erp_search_documents
  FOR EACH ROW EXECUTE FUNCTION erp_search_documents_maintain();

-- Indexes: FTS, fuzzy/prefix (plain column), identifier exact/contains, FK coverage.
CREATE INDEX IF NOT EXISTS idx_erp_search_fts     ON erp_search_documents USING gin (search_vector);
CREATE INDEX IF NOT EXISTS idx_erp_search_trgm    ON erp_search_documents USING gin (trgm_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_erp_search_ident   ON erp_search_documents USING gin (identifiers);
CREATE INDEX IF NOT EXISTS idx_erp_search_company ON erp_search_documents (company_id);
CREATE INDEX IF NOT EXISTS idx_erp_search_type    ON erp_search_documents (company_id, entity_type);

-- RLS: tenant isolation (same primitives as the rest of the platform).
ALTER TABLE erp_search_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS erp_search_documents_tenant ON erp_search_documents;
CREATE POLICY erp_search_documents_tenant ON erp_search_documents FOR ALL
  USING (erp_is_platform_owner() OR company_id IS NULL OR company_id = erp_user_company_id())
  WITH CHECK (erp_is_platform_owner() OR company_id = erp_user_company_id());

-- ── Ranking RPC ─────────────────────────────────────────────────────────────
-- SECURITY INVOKER (default): RLS on erp_search_documents tenant-isolates the
-- results. Category gating (permissions) is applied by the caller via p_types.
-- Scoring: exact identifier >> prefix identifier > lexical (ts_rank) > fuzzy
-- (trigram) + recency. q_digits matches phone/barcode/VAT regardless of format.
CREATE OR REPLACE FUNCTION erp_search(p_query text, p_types text[] DEFAULT NULL, p_limit int DEFAULT 50)
RETURNS TABLE (
  entity_type text, entity_id text, title text, subtitle text, href text,
  metadata jsonb, score real, match_kind text
)
LANGUAGE sql STABLE AS $$
  WITH params AS (
    SELECT
      nullif(btrim(p_query), '')                                     AS raw,
      unaccent(lower(btrim(coalesce(p_query,''))))                   AS qnorm,
      nullif(regexp_replace(coalesce(p_query,''), '\D', '', 'g'), '') AS qdigits
  ),
  tsq AS (
    SELECT CASE WHEN (SELECT qnorm FROM params) <> '' THEN websearch_to_tsquery('simple', (SELECT qnorm FROM params)) END AS q
  ),
  scored AS (
    SELECT d.entity_type, d.entity_id, d.title, d.subtitle, d.href, d.metadata,
      (CASE WHEN (SELECT qnorm FROM params) = ANY (d.identifiers)
             OR ((SELECT qdigits FROM params) IS NOT NULL AND (SELECT qdigits FROM params) = ANY (d.identifiers))
            THEN 1000 ELSE 0 END)::real AS s_exact,
      (CASE WHEN EXISTS (
            SELECT 1 FROM unnest(d.identifiers) i
            WHERE i LIKE (SELECT qnorm FROM params) || '%'
               OR ((SELECT qdigits FROM params) IS NOT NULL AND i LIKE (SELECT qdigits FROM params) || '%'))
            THEN 400 ELSE 0 END)::real AS s_prefix,
      (coalesce(ts_rank_cd(d.search_vector, (SELECT q FROM tsq)), 0) * 50)::real AS s_lex,
      (similarity(d.trgm_text, (SELECT qnorm FROM params)) * 20)::real AS s_trgm,
      (1.0 / (1 + EXTRACT(EPOCH FROM (now() - d.updated_at)) / 86400.0))::real AS s_recency
    FROM erp_search_documents d
    WHERE (p_types IS NULL OR d.entity_type = ANY (p_types))
      AND (
        ((SELECT q FROM tsq) IS NOT NULL AND d.search_vector @@ (SELECT q FROM tsq))
        OR similarity(d.trgm_text, (SELECT qnorm FROM params)) > 0.2
        OR (SELECT qnorm FROM params) = ANY (d.identifiers)
        OR EXISTS (SELECT 1 FROM unnest(d.identifiers) i WHERE i LIKE (SELECT qnorm FROM params) || '%')
        OR ((SELECT qdigits FROM params) IS NOT NULL AND EXISTS (
              SELECT 1 FROM unnest(d.identifiers) i WHERE i LIKE (SELECT qdigits FROM params) || '%'))
      )
  )
  SELECT entity_type, entity_id, title, subtitle, href, metadata,
         (s_exact + s_prefix + s_lex + s_trgm + s_recency) AS score,
         CASE WHEN s_exact > 0 THEN 'exact' WHEN s_prefix > 0 THEN 'prefix'
              WHEN s_lex > 0 THEN 'lexical' ELSE 'fuzzy' END AS match_kind
  FROM scored
  WHERE (SELECT raw FROM params) IS NOT NULL
  ORDER BY score DESC, title ASC
  LIMIT GREATEST(coalesce(p_limit, 50), 1);
$$;

-- Down (manual): drop function erp_search; drop trigger + function
--                erp_search_documents_maintain; drop table erp_search_documents.
