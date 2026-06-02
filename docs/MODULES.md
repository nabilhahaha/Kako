# Kako — Modules, Business Types & Permissions Catalog

The single source of truth for **who sees what**. Effective access is computed
in `getUserContext()`:

```
visible module  = (module ∈ company's enabled modules)        -- erp_company_modules
                  AND (coarse module ⇒ also ∈ plan's modules) -- erp_plan_modules
effective perms = union of the user's roles' permissions, resolved per company
                  (erp_company_role_permissions, else global erp_role_permissions)
a nav section/item shows  ⇔  its `module` is visible AND the user has its `perm`
```
Company defaults come from the **business type** on signup
(`erp_business_type_modules`, `erp_business_type_roles`) and can be overridden
per company by the platform owner.

## Modules
| module | section / unlocks |
|---|---|
| `clinic` | العيادة (لوحة، استقبال، طبيب، مواعيد، مرضى، كشوفات، خدمات) |
| `hotel` | الفندق (غرف، حجوزات) |
| `restaurant` | المطعم/الكافيه (طاولات، أوردرات، مطبخ، تقفيل) |
| `salon` | الصالون (مواعيد، تذاكر، خدمات) |
| `pharmacy` | الصيدلية (سجل صرف الأدوية + FEFO) — **إضافة فوق الريتيل** |
| `laundry` | المغسلة (طلبات، سير العمل) |
| `market` | السوبر ماركت (الكاشير السريع) — **إضافة فوق الريتيل** |
| `wholesale` | الجملة (مستويات أسعار، فاتورة جملة) — **إضافة فوق التوزيع** |
| `distribution` | التوزيع (خطوط السير، تقرير، أهداف) + تطبيق المندوب/التقفيل اليومي/خطة الزيارات |
| `sales` | المبيعات (فواتير، عملاء، تقرير مبيعات) |
| `pos` | بند "بيع سريع" (نقطة بيع) |
| `sales_orders` | بند "أوامر البيع" |
| `returns` | بند "مرتجعات المبيعات" |
| `inventory` | المخزون (منتجات، أرصدة، جرد، صلاحية…) |
| `warehousing` | بنود المخازن/التحويلات/طلبات التحميل |
| `purchasing` | المشتريات (موردين، أوامر شراء) |
| `accounting` | الحسابات (شجرة، سندات، قيود، تقارير) |

`sales/inventory/purchasing/accounting/hotel/clinic/restaurant/salon/pharmacy/laundry/market/wholesale/distribution`
are **plan-gated** (coarse); `pos/sales_orders/returns/warehousing` are item-level
refinements driven by the business type only.

## Business type → modules (effective defaults)
| نشاط | الموديولات | النمط |
|---|---|---|
| clinic | accounting, **clinic** | خدمي (vertical فقط) |
| salon | accounting, **salon** | خدمي |
| laundry | accounting, **laundry** | خدمي |
| hotel | accounting, **hotel** | خدمي |
| restaurant | accounting, inventory, **restaurant** | طعام (vertical + مخزون) |
| cafe | accounting, inventory, **restaurant** | طعام |
| services | accounting, sales | خدمي عام (فواتير) |
| pharmacy | accounting, inventory, pos, purchasing, returns, sales, warehousing, **pharmacy** | ريتيل + سجل صرف |
| supermarket | accounting, inventory, pos, purchasing, returns, sales, warehousing, **market** | ريتيل + كاشير |
| auto_parts / bakery / bookstore / clothing / electronics / herbalist | accounting, inventory, pos, purchasing, returns, sales, warehousing | ريتيل |
| butchery | accounting, inventory, pos, returns, sales | ريتيل صغير |
| workshop | accounting, inventory, pos, returns, sales, warehousing | ورشة (لا vertical مخصص بعد) |
| general | accounting, inventory, pos, purchasing, returns, sales, sales_orders, warehousing, **distribution** | توزيع + counter |
| delivery | accounting, inventory, purchasing, returns, sales, sales_orders, warehousing, **distribution** | توزيع |
| wholesale | accounting, inventory, purchasing, returns, sales, sales_orders, warehousing, **distribution, wholesale** | توزيع + جملة |

**القاعدة:** نشاط له vertical خدمي (عيادة/صالون/مغسلة/فندق/مطعم) **لا** يأخذ `sales/pos`
العامة — البيع يتم داخل الـ vertical. الريتيل (صيدلية/سوبرماركت/ملابس…) **يأخذ** حزمة
الريتيل لأن جوهره بيع منتجات. التوزيع (general/wholesale/delivery) يأخذ `distribution`
(تطبيق المندوب/خطوط السير/تقارير) — وغيرهم لا.

## Roles → permissions (global defaults)
| role | permissions |
|---|---|
| admin / manager | كل الصلاحيات (`*`) |
| accountant | accounting.view, accounting.post, reports.view, sales.collect, suppliers.manage |
| cashier | sales.sell, sales.collect, customers.manage, + (vertical: restaurant/laundry/market/pharmacy/salon/hotel).manage* |
| salesman / driver | field.sales, sales.sell, sales.collect, customers.manage, inventory.view, stock_request.create |
| supervisor | sales.sell/discount/collect/return, customers.manage, inventory.view, reports.view, stock_request.approve |
| warehouse_keeper | inventory.view/adjust/transfer/count, stock_request.approve, purchasing.manage |
| doctor | clinic.doctor, reports.view (+ sales.sell/customers — dormant without sales module) |
| receptionist | clinic.reception, hotel.manage, salon.manage, sales.sell/collect, customers.manage |
| stylist | salon.manage (+ sales.sell/customers — dormant) |
| technician | customers.manage, inventory.view, sales.sell, stock_request.create |
| housekeeping | hotel.manage |
| staff | inventory.view |
| viewer | accounting.view, inventory.view, reports.view |

\* The vertical `*.manage` perms accumulate on shared roles (cashier/receptionist)
in the **global** defaults, but they are **dormant** unless the company's module is
enabled — module gating is the real boundary. Per-company role permissions
(`erp_company_role_permissions`, seeded on signup) stay scoped to the business type.

Clinic access is split: `clinic.reception` (استقبال/مواعيد/تحصيل) vs `clinic.doctor`
(كشف/تشخيص/روشتة) vs `clinic.manage` (admin/manager = الكل).

## Business type → role templates (which roles are offered)
- **clinic**: admin, manager, accountant, **doctor, receptionist**, cashier, viewer
- **hotel**: admin, manager, accountant, **receptionist, housekeeping**, cashier, viewer
- **salon**: admin, manager, **stylist, receptionist**, cashier, viewer
- **laundry / restaurant / cafe**: admin, manager, cashier, staff, viewer (+accountant for restaurant)
- **pharmacy / supermarket / retail**: admin, manager, accountant, cashier, warehouse_keeper, viewer (+staff for some)
- **electronics / workshop**: + **technician**
- **general / wholesale / delivery (توزيع)**: admin, manager, accountant, **salesman/driver, supervisor**, cashier, warehouse_keeper, viewer

## Verticals without a dedicated module (use the generic stack)
- **services** — generic service company → sales (invoices/customers) + accounting.
- **workshop** — repair shop → retail stack (parts via POS/invoices). A job-card
  vertical (parts + labour + repair status) is a candidate future module.
