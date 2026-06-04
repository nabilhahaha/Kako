-- Load-test seed: N customers + M products for one company, for staging benchmarking.
-- Usage: psql "$STAGING_URL" -v company="<uuid>" -v customers=25000 -v products=2000 -f seed.sql
-- (Run against a STAGING/branch DB only. Never production.)
\if :{?company}
\else
  \echo 'Set -v company=<uuid>'; \quit
\endif
INSERT INTO erp_customers(company_id, code, name, name_ar, phone, balance, payment_type)
SELECT :'company', 'LT-C'||lpad(g::text,7,'0'), 'LT Customer '||g, 'عميل '||g,
       '05'||lpad(g::text,8,'0'), (random()*10000)::numeric(14,2),
       (ARRAY['cash','credit'])[1+floor(random()*2)]
FROM generate_series(1, :customers) g
ON CONFLICT (company_id, code) DO NOTHING;
INSERT INTO erp_products_catalog(company_id, code, name, name_ar, unit, sell_price, cost_price, min_stock, is_active)
SELECT :'company', 'LT-P'||lpad(g::text,6,'0'), 'LT Product '||g, 'منتج '||g, 'piece',
       (random()*500)::numeric(14,2), (random()*300)::numeric(14,2), 10, true
FROM generate_series(1, :products) g
ON CONFLICT (company_id, code) DO NOTHING;
ANALYZE erp_customers; ANALYZE erp_products_catalog;
SELECT (SELECT count(*) FROM erp_customers WHERE company_id=:'company') AS customers,
       (SELECT count(*) FROM erp_products_catalog WHERE company_id=:'company') AS products;
