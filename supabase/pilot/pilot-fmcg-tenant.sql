-- ============================================================================
-- VANTORA Pilot FMCG tenant seed (idempotent). Applied live to vantora-staging.
-- Creates: 1 fmcg company (auto-seeds roles+modules via triggers), 1 branch,
-- a main + van warehouse, 8 FMCG products with stock, 5 customers, and 5 user
-- accounts (admin/salesman/supervisor/accountant/warehouse_keeper), password
-- test.123. Re-running is a no-op (guards on company name / user email).
-- Pilot scenarios S1-S11 were executed against this tenant — see
-- docs/audits/VANTORA-Pilot-Execution-Report.docx.
-- ============================================================================

DO $$
DECLARE v_co uuid; v_br uuid; v_wh uuid; v_pid uuid; i int;
  prods text[][] := ARRAY[
    ['PILOT-P01','Sunflower Oil 1L','زيت دوار الشمس ١ لتر','55','70'],
    ['PILOT-P02','White Sugar 1kg','سكر أبيض ١ كجم','22','28'],
    ['PILOT-P03','Egyptian Rice 1kg','أرز مصري ١ كجم','18','25'],
    ['PILOT-P04','Black Tea 250g','شاي أسود ٢٥٠ جم','30','42'],
    ['PILOT-P05','Bar Soap 120g','صابون ١٢٠ جم','6','9'],
    ['PILOT-P06','Tomato Paste 380g','صلصة طماطم ٣٨٠ جم','12','17'],
    ['PILOT-P07','Pasta 400g','مكرونة ٤٠٠ جم','9','13'],
    ['PILOT-P08','Powder Detergent 1kg','مسحوق غسيل ١ كجم','40','55']];
  custs text[][] := ARRAY[
    ['PILOT-C01','Al Nour Grocery','بقالة النور','20000'],
    ['PILOT-C02','El Salam Market','ماركت السلام','15000'],
    ['PILOT-C03','City Mini Market','سيتي ميني ماركت','30000'],
    ['PILOT-C04','Family Supermarket','سوبر ماركت العائلة','25000'],
    ['PILOT-C05','Corner Shop','محل الركن','8000']];
BEGIN
  IF EXISTS (SELECT 1 FROM erp_companies WHERE name='VANTORA Pilot FMCG (DEMO)') THEN RETURN; END IF;
  INSERT INTO erp_companies (name, name_ar, business_type, setup_done)
    VALUES ('VANTORA Pilot FMCG (DEMO)','فانتورا تجريبي (FMCG)','fmcg', true) RETURNING id INTO v_co;
  INSERT INTO erp_branches (company_id, code, name, name_ar)
    VALUES (v_co,'PILOT','Pilot Branch','الفرع التجريبي') RETURNING id INTO v_br;
  INSERT INTO erp_warehouses (branch_id, code, name, name_ar)
    VALUES (v_br,'PILOT-WH','Pilot Main Warehouse','المخزن الرئيسي') RETURNING id INTO v_wh;
  INSERT INTO erp_warehouses (branch_id, code, name, name_ar)
    VALUES (v_br,'PILOT-VAN','Pilot Van','سيارة المندوب');
  FOR i IN 1 .. array_length(prods,1) LOOP
    INSERT INTO erp_products_catalog (company_id, code, name, name_ar, unit, cost_price, sell_price, tax_rate, is_active)
      VALUES (v_co, prods[i][1], prods[i][2], prods[i][3], 'piece', prods[i][4]::numeric, prods[i][5]::numeric, 14, true)
      RETURNING id INTO v_pid;
    INSERT INTO erp_inventory_stock (warehouse_id, product_id, quantity, reserved_qty) VALUES (v_wh, v_pid, 1000, 0);
  END LOOP;
  FOR i IN 1 .. array_length(custs,1) LOOP
    INSERT INTO erp_customers (company_id, branch_id, code, name, name_ar, credit_limit, balance, is_approved, approval_status, customer_status)
      VALUES (v_co, v_br, custs[i][1], custs[i][2], custs[i][3], custs[i][4]::numeric, 0, true, 'approved', 'active');
  END LOOP;
END $$;

-- Pilot user accounts (Supabase auth.users + identities + erp_user_branches role).
DO $$
DECLARE v_co uuid; v_br uuid; v_uid uuid; v_sales uuid; i int;
  u_list text[][] := ARRAY[
    ['admin@pilot.test','Pilot Company Admin','admin'],
    ['salesman@pilot.test','Pilot Salesman','salesman'],
    ['supervisor@pilot.test','Pilot Supervisor','supervisor'],
    ['accountant@pilot.test','Pilot Accountant','accountant'],
    ['warehouse@pilot.test','Pilot Warehouse Keeper','warehouse_keeper']];
BEGIN
  SELECT id INTO v_co FROM erp_companies WHERE name='VANTORA Pilot FMCG (DEMO)';
  SELECT id INTO v_br FROM erp_branches WHERE company_id=v_co AND code='PILOT';
  FOR i IN 1 .. array_length(u_list,1) LOOP
    IF EXISTS (SELECT 1 FROM auth.users au WHERE au.email=u_list[i][1]) THEN CONTINUE; END IF;
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
      VALUES ('00000000-0000-0000-0000-000000000000', v_uid, 'authenticated','authenticated', u_list[i][1], crypt('test.123', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', u_list[i][2]), now(), now());
    INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      VALUES (v_uid::text, v_uid, jsonb_build_object('sub', v_uid::text, 'email', u_list[i][1]), 'email', now(), now(), now());
    INSERT INTO erp_user_branches (user_id, branch_id, role, is_default) VALUES (v_uid, v_br, u_list[i][3], true)
      ON CONFLICT (user_id, branch_id) DO UPDATE SET role=EXCLUDED.role;
    IF u_list[i][3]='salesman' THEN v_sales := v_uid; END IF;
  END LOOP;
  IF v_sales IS NOT NULL THEN UPDATE erp_customers SET salesman_id = v_sales WHERE company_id=v_co AND salesman_id IS NULL; END IF;
END $$;
