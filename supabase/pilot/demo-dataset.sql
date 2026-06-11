-- ============================================================================
-- VANTORA — RICH FMCG DEMO DATASET for "Nile FMCG (DEMO)"  (tenant-scoped)
-- ----------------------------------------------------------------------------
-- Builds a realistic, RPC-consistent demo dataset for UI testing/demos:
--   • 25 products, 150+ customers across all branch routes, extra suppliers,
--     a wholesale price list, generous opening stock per warehouse + van.
--   • ~90 days of activity generated through the REAL FMCG RPCs (erp_van_sell,
--     erp_settle_collection, erp_van_return, erp_compute_van_reconciliation) so
--     invoices, collections, returns, credit notes, customer balances, AR and
--     van stock all stay internally consistent. Dates are then spread across the
--     last 90 days (deterministic by id) and propagated to each invoice's
--     children, so dashboards/reports show real trends.
--
-- SCOPE: only the company named below. Idempotent on the activity guard (skips a
-- rep-day already seeded). Run on a dedicated demo/staging Supabase project.
-- Does NOT touch other tenants. Master inserts are standard; ACTIVITY is RPCs.
--
-- NOTE on auth context: the generator sets request.jwt.claim.sub per rep before
-- each RPC so the functions run as that user (permission + van resolution).
-- ============================================================================
DO $demo$
DECLARE
  v_co uuid; r record; i int; v_lat numeric; v_lng numeric; v_code text;
  pool text[] := ARRAY['Al Faisaliah','Al Rawdah','Al Nakheel','Al Salam','Al Andalus','Al Yasmin','Al Murooj','Al Wurud'];
  v_cat uuid; v_pl uuid;
  rep_email text; v_rep uuid; v_br uuid; v_van uuid; v_wm uuid;
  d date; v_sess uuid; cust record; v_lines jsonb; v_sale record;
  reps text[] := ARRAY['van.rep01','van.rep02','van.rep03','van.rep04','van.rep05','van.rep06','cash.van01','cash.van06'];
BEGIN
  SELECT id INTO v_co FROM erp_companies WHERE name='Nile FMCG (DEMO)';
  IF v_co IS NULL THEN RAISE EXCEPTION 'Demo company not found'; END IF;
  SELECT id INTO v_wm FROM erp_profiles WHERE email='warehouse.manager@nile-group.test';

  ----------------------------------------------------------------------------
  -- MASTER DATA
  ----------------------------------------------------------------------------
  -- products → 25
  FOR i IN 18..24 LOOP
    SELECT id INTO v_cat FROM erp_product_categories WHERE company_id=v_co ORDER BY code OFFSET (i%5) LIMIT 1;
    INSERT INTO erp_products_catalog(company_id, code, name, name_ar, category_id, brand, unit,
        cost_price, sell_price, tax_rate, pack_size, barcode, expiry_days, created_source)
    SELECT v_co,'SKU-'||lpad(i::text,3,'0'),'Demo Product '||i,'منتج '||i,v_cat,
        (ARRAY['NileCola','CrispMax','DairyPure','FreshUp','HomeShield'])[1+(i%5)],'carton',
        (40+i*3)::numeric,(60+i*5)::numeric,15,'12x1','628000000'||lpad(i::text,3,'0'),365,'erp'
    WHERE NOT EXISTS (SELECT 1 FROM erp_products_catalog WHERE company_id=v_co AND code='SKU-'||lpad(i::text,3,'0'));
  END LOOP;

  -- customers across every route (van 7, cash 5, merch 4) — Saudi outlets
  FOR r IN
    SELECT rt.id route_id, rt.code rcode, rt.rep_id, rt.branch_id, b.city,
           CASE WHEN rt.code LIKE 'RT-V%' THEN 7 WHEN rt.code LIKE 'RT-C%' THEN 5 ELSE 4 END AS k
    FROM erp_routes rt JOIN erp_branches b ON b.id=rt.branch_id WHERE rt.company_id=v_co
  LOOP
    SELECT lat,lng INTO v_lat,v_lng FROM (VALUES
      ('Riyadh',24.71,46.67),('Jeddah',21.49,39.19),('Makkah',21.39,39.86),('Abha',18.22,42.51),
      ('Dammam',26.43,50.10),('Al Kharj',24.15,47.30),('Buraydah',26.33,43.97),('Taif',21.27,40.42),
      ('Madinah',24.52,39.57),('Khamis Mushait',18.31,42.73),('Jazan',16.89,42.57),('Najran',17.49,44.13),('Tabuk',28.38,36.57)
    ) AS c(city,lat,lng) WHERE c.city=r.city;
    FOR i IN 1..r.k LOOP
      v_code := 'CUST-'||r.rcode||'-'||lpad(i::text,2,'0');
      INSERT INTO erp_customers(company_id, branch_id, code, name, name_ar, phone, city,
        is_approved, approval_status, credit_limit, balance, payment_terms_days, payment_type,
        salesman_id, route_id, latitude, longitude, allowed_gps_radius, contact_person, created_source)
      VALUES (v_co, r.branch_id, v_code,
        pool[1+((i+length(r.rcode))%8)]||' '||r.city||' '||right(r.rcode,3)||'/'||i,
        'بقالة '||r.city||' '||right(r.rcode,3)||'/'||i,
        '+9665'||lpad(((abs(hashtext(v_code))%9000000)+1000000)::text,7,'0'), r.city,
        NOT (r.rcode LIKE 'RT-V%' AND i=4),
        CASE WHEN (r.rcode LIKE 'RT-V%' AND i=4) THEN 'pending' ELSE 'approved' END,
        CASE WHEN r.rcode LIKE 'RT-C%' THEN 0 ELSE 200000 END, 0,
        CASE WHEN r.rcode LIKE 'RT-C%' THEN 0 ELSE (ARRAY[15,30])[1+(i%2)] END,
        CASE WHEN r.rcode LIKE 'RT-C%' THEN 'cash' ELSE 'credit' END,
        r.rep_id, r.route_id, v_lat+(i*0.004), v_lng+(i*0.004), 200, 'Mgr '||right(r.rcode,3), 'import')
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- extra Saudi suppliers
  INSERT INTO erp_suppliers(company_id, code, name, name_ar, phone, city, tax_number, balance, payment_terms_days)
  SELECT v_co, x.code, x.name, x.name_ar, x.phone, x.city, x.tax, 0, x.terms FROM (VALUES
    ('SUP-004','Almarai Company','شركة المراعي','+966-11-470-0000','Riyadh','SA-300000004',30),
    ('SUP-005','NADEC','نادك','+966-11-265-0000','Riyadh','SA-300000005',45),
    ('SUP-006','Tamimi Markets Supply','إمداد أسواق التميمي','+966-13-800-0000','Dammam','SA-300000006',30)
  ) AS x(code,name,name_ar,phone,city,tax,terms)
  WHERE NOT EXISTS (SELECT 1 FROM erp_suppliers s WHERE s.company_id=v_co AND s.code=x.code);

  -- wholesale price list (8% off)
  IF NOT EXISTS (SELECT 1 FROM erp_price_lists WHERE company_id=v_co AND name='Wholesale') THEN
    INSERT INTO erp_price_lists(company_id, name, name_ar, is_default) VALUES (v_co,'Wholesale','قائمة الجملة',false) RETURNING id INTO v_pl;
    INSERT INTO erp_price_list_items(price_list_id, product_id, unit_price)
    SELECT v_pl, p.id, round(p.sell_price*0.92,2) FROM erp_products_catalog p WHERE p.company_id=v_co;
  END IF;

  -- generous opening stock so 90 days of sales never deplete (vans 5000, main 50000)
  UPDATE erp_inventory_stock s SET quantity=GREATEST(s.quantity, CASE WHEN w.is_van THEN 5000 ELSE 50000 END)
  FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id WHERE w.id=s.warehouse_id AND b.company_id=v_co;
  INSERT INTO erp_inventory_stock(warehouse_id, product_id, quantity)
  SELECT w.id, p.id, CASE WHEN w.is_van THEN 5000 ELSE 50000 END
  FROM erp_warehouses w JOIN erp_branches b ON b.id=w.branch_id CROSS JOIN erp_products_catalog p
  WHERE b.company_id=v_co AND p.company_id=v_co
    AND NOT EXISTS (SELECT 1 FROM erp_inventory_stock s WHERE s.warehouse_id=w.id AND s.product_id=p.id);

  ----------------------------------------------------------------------------
  -- ACTIVITY (REAL RPCs) — ~90 days, Sun–Thu, 1–2 customers/rep/day
  ----------------------------------------------------------------------------
  FOREACH rep_email IN ARRAY reps LOOP
    SELECT id INTO v_rep FROM erp_profiles WHERE email=rep_email||'@nile-group.test';
    SELECT w.id, w.branch_id INTO v_van, v_br FROM erp_warehouses w WHERE w.assigned_to=v_rep AND w.is_van LIMIT 1;
    d := current_date - 89;
    WHILE d <= current_date LOOP
      IF extract(dow FROM d) NOT IN (5,6)
         AND NOT EXISTS (SELECT 1 FROM erp_work_sessions WHERE salesman_id=v_rep AND work_date=d) THEN
        INSERT INTO erp_work_sessions(branch_id, salesman_id, status, work_date) VALUES (v_br, v_rep, 'open', d) RETURNING id INTO v_sess;
        PERFORM set_config('request.jwt.claim.sub', v_rep::text, true);
        FOR cust IN SELECT id, payment_type, latitude, longitude FROM erp_customers
          WHERE company_id=v_co AND salesman_id=v_rep AND approval_status='approved'
          ORDER BY abs(hashtext(id::text||d::text)) LIMIT (1 + (abs(hashtext(d::text||rep_email))%2)) LOOP
          PERFORM erp_check_in_visit(cust.id, coalesce(cust.latitude,24.7), coalesce(cust.longitude,46.7), v_sess, NULL, true, d::timestamptz + interval '9 hours', d);
          v_lines := (SELECT jsonb_agg(jsonb_build_object('product_id',p.id,'quantity',4 + (abs(hashtext(p.code||d::text||cust.id::text))%9)))
                      FROM (SELECT id, code FROM erp_products_catalog WHERE company_id=v_co ORDER BY abs(hashtext(code||d::text||cust.id::text)) LIMIT 2) p);
          SELECT * INTO v_sale FROM erp_van_sell(v_br, cust.id, v_lines, NULL, CASE WHEN cust.payment_type='credit' THEN d+30 ELSE NULL END, NULL);
          IF (abs(hashtext('col'||cust.id::text||d::text))%10) < 6 THEN
            PERFORM erp_settle_collection(v_br, cust.id, round(v_sale.net_amount*0.6,2), 'cash', NULL, NULL, NULL, d); END IF;
          IF (abs(hashtext('ret'||cust.id::text||d::text))%100) < 15 THEN
            PERFORM erp_van_return(v_br, cust.id, jsonb_build_array(jsonb_build_object('product_id',(v_lines->0->>'product_id')::uuid,'quantity',1)),
              (SELECT id FROM erp_return_reasons WHERE company_id=v_co AND code='damaged'), v_sale.invoice_id, true, NULL, NULL); END IF;
        END LOOP;
        -- recent days: a van reconciliation (variance 0) by the warehouse manager
        IF d >= current_date - 3 THEN
          PERFORM set_config('request.jwt.claim.sub', v_wm::text, true);
          BEGIN
            PERFORM erp_compute_van_reconciliation(v_sess,
              (SELECT jsonb_agg(jsonb_build_object('product_id',product_id,'actual_qty',quantity)) FROM erp_inventory_stock WHERE warehouse_id=v_van));
          EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
        UPDATE erp_work_sessions SET status='closed' WHERE id=v_sess;
      END IF;
      d := d + 1;
    END LOOP;
  END LOOP;

  ----------------------------------------------------------------------------
  -- DATE SPREAD: RPCs stamp created_at = now() (txn start). Spread invoices over
  -- the last 90 days (deterministic by id) and propagate each invoice's date to
  -- its collection / return / credit note. Values (balances/stock) are unchanged.
  ----------------------------------------------------------------------------
  UPDATE erp_invoices i SET created_at = (current_date - (abs(hashtext(i.id::text))%90))::timestamptz + interval '10 hours'
  FROM erp_branches b WHERE b.id=i.branch_id AND b.company_id=v_co;
  UPDATE erp_invoices i SET due_date = (i.created_at::date + 30)
  FROM erp_branches b WHERE b.id=i.branch_id AND b.company_id=v_co AND i.due_date IS NOT NULL;
  UPDATE erp_sales_returns r SET created_at = i.created_at + interval '2 hours' FROM erp_invoices i WHERE r.invoice_id=i.id;
  UPDATE erp_credit_notes cn SET created_at = i.created_at + interval '2 hours' FROM erp_invoices i WHERE cn.invoice_id=i.id;
  UPDATE erp_collections c SET created_at = i.created_at + interval '1 hour', collection_date = i.created_at::date
  FROM erp_collection_allocations a JOIN erp_invoices i ON i.id=a.invoice_id WHERE a.collection_id=c.id;

  RAISE NOTICE 'demo dataset ready for Nile FMCG (DEMO)';
END $demo$;
