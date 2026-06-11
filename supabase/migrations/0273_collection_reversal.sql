-- ============================================================================
-- 0273 — erp_reverse_collection: governed reversal of a posted collection
-- ----------------------------------------------------------------------------
-- The compensating counterpart of erp_settle_collection (0267): unwinds each
-- allocation (lowers the invoice paid_amount and recomputes its status), restores
-- the customer balance by the amount that had been applied, and marks the
-- collection 'reversed' (allocations are kept for the audit trail). No GL journal
-- is involved (settle posts none), so there is nothing else to reverse.
-- Branch-access checked; idempotent (a reversed collection cannot be reversed
-- again). Consumed by the Critical Action standard via the collection.adjust /
-- collection reversal flow.
-- ============================================================================
-- Allow the 'reversed' terminal status on collections.
ALTER TABLE erp_collections DROP CONSTRAINT IF EXISTS erp_collections_status_check;
ALTER TABLE erp_collections ADD CONSTRAINT erp_collections_status_check
  CHECK (status = ANY (ARRAY['draft','settled','cancelled','reversed']));

CREATE OR REPLACE FUNCTION erp_reverse_collection(p_collection_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  col     erp_collections;
  v_total numeric := 0;
  alloc   RECORD;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT * INTO col FROM erp_collections WHERE id = p_collection_id FOR UPDATE;
  IF col.id IS NULL THEN RAISE EXCEPTION 'collection_not_found'; END IF;
  IF NOT erp_has_branch_access(col.branch_id) THEN RAISE EXCEPTION 'branch_access_denied'; END IF;
  IF col.status = 'reversed' THEN RAISE EXCEPTION 'already_reversed'; END IF;

  FOR alloc IN SELECT * FROM erp_collection_allocations WHERE collection_id = p_collection_id LOOP
    UPDATE erp_invoices
       SET paid_amount = GREATEST(0, paid_amount - alloc.applied_amount),
           status = (CASE
             WHEN GREATEST(0, paid_amount - alloc.applied_amount) <= 0 THEN 'issued'
             WHEN GREATEST(0, paid_amount - alloc.applied_amount) < net_amount THEN 'partially_paid'
             ELSE 'paid' END)::erp_invoice_status
     WHERE id = alloc.invoice_id;
    v_total := round(v_total + alloc.applied_amount, 2);
  END LOOP;

  UPDATE erp_customers SET balance = balance + v_total WHERE id = col.customer_id;

  UPDATE erp_collections
     SET status = 'reversed',
         applied_amount = 0,
         unapplied_amount = amount,
         notes = btrim(COALESCE(notes,'') || ' [reversed: ' || COALESCE(NULLIF(btrim(p_reason),''),'-') || ']'),
         updated_at = now()
   WHERE id = p_collection_id;

  RETURN jsonb_build_object('reversed', v_total, 'collection_id', p_collection_id, 'customer_id', col.customer_id);
END $$;

GRANT EXECUTE ON FUNCTION erp_reverse_collection(uuid, text) TO authenticated, service_role;
