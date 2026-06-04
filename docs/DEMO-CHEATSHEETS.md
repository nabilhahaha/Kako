# VANTORA — Per-Vertical Demo Cheat Sheets

> One simple, repeatable scenario per vertical for a live customer demo. Each is
> ~3–5 minutes, uses the curated demo tenant, and follows the exact navigation
> paths in the app. Logins and the shared demo password are in
> [`DEMO-ACCOUNTS.md`](./DEMO-ACCOUNTS.md). Demo password: `Demo@2026`.

General tips
- The UI is **Arabic RTL by default**; use the language toggle (top bar) to show
  English LTR — layout mirrors fully.
- Every list screen now shows a consistent **empty state**, and detail screens a
  consistent **back link**, so a clean/empty tenant still looks intentional.

---

## 1. Clinic — عيادة الحياة · core scenario: patient visit
**Login:** `clinic.reception@demo.com` (reception) → `clinic.doctor@demo.com` (doctor)
1. **Reception → walk-in:** Sidebar → *Clinic → Reception* → **Walk In** / register a patient.
2. **Book/queue:** Sidebar → *Clinic → Appointments* → **Book**, or send the patient to the visit queue.
3. **Doctor exam:** log in as the doctor → *Clinic → Visits* → **Start Exam** → **Examine** → record the consultation → **Save and Finish**.
4. **Patient record:** *Clinic → Patients* → open a patient → history, vitals trend, allergies; **Back** link returns to the list.
5. **Collect:** *Clinic → Reception* (or the visit card) → **Collect** the visit fee.

## 2. Pharmacy — صيدلية الشفاء · core scenario: dispense + expiry
**Login:** `clinic`-style → use `admin.pharmacy@demo.com`
1. **Dispense:** Sidebar → *Pharmacy → Dispense* → **New Dispense** → add drugs → finalize. Back link returns to the list.
2. **Stock/expiry awareness:** Sidebar → *Inventory → Expiry* → show items inside the 90-day window (color-coded). Empty = clean "nothing expiring" state.
3. **Low stock:** *Inventory → Low Stock* → reorder view.

## 3. FMCG Distribution / Wholesale — Demo Wholesale · core scenario: sales invoice
**Login:** `admin.wholesale@demo.com`
1. **Invoice:** Sidebar → *Sales → Invoices* → create an invoice for a customer.
2. **POS (optional):** *Sales → POS* → quick counter sale.
3. **Customer statement:** *Customers* → open a customer → statement + **Print**; **Back** returns to the list.
4. **Wholesale tiers:** *Wholesale → Prices* → Retail / Semi-wholesale / Wholesale / Project tiers.

## 4. Electrical Retail & Wholesale — Demo Electric · core scenario: invoice + serial + warranty + RMA
**Login:** `electric@demo.com` (admin) or `electric.technician@demo.com` (technician)
1. **Dashboard:** 4 Electrical widgets (Active Warranties · Open RMAs · Serialized · Supplier Returns).
2. **Serial tracking:** Sidebar → *Electrical → Serial Numbers* → filter a serial → status / warehouse / cost.
3. **Warranty lookup:** *Electrical → Warranties* → auto-calculated end date + active/expired.
4. **RMA:** *Electrical → RMA* → walk a record requested → approved → repair/replace/refund.
5. **Supplier return:** *Purchasing → Supplier Returns* → a completed defective-batch return.

## 5. Restaurant / Café — مطعم اللقمة الهنية · core scenario: order + payment
**Login:** `admin.restaurant@demo.com`
1. **Open order:** Sidebar → *Restaurant → Orders* → **New Takeaway** / **New Delivery**, or *Tables* → **Open Table**.
2. **Build & send:** add items → kitchen (*Restaurant → Kitchen*).
3. **Pay:** open the order → settle/collect. Back link returns to orders.

## 6. Salon — صالون الجمال · core scenario: appointment + service invoice
**Login:** `admin.salon@demo.com`
1. **Book:** Sidebar → *Salon → Appointments* → **New** → **Book** (assign stylist).
2. **Arrive → ticket:** mark **Arrived** → *Salon → Tickets* → **New** → add services.
3. **Invoice:** open the ticket → checkout. Back link returns to tickets.

## 7. Laundry — مغسلة النظافة · core scenario: order + pickup/delivery status
**Login:** `admin.laundry@demo.com`
1. **New order:** Sidebar → *Laundry → Orders* → **New** → customer + delivery toggle → **Open Order**.
2. **Track status:** filter chips (received / washing / ready) → advance an order.
3. **Detail:** open an order → items + status; back link returns to the list.

## 8. Hotel — فندق النيل · core scenario: booking + check-in
**Login:** `admin.hotel@demo.com`
1. **Rooms:** Sidebar → *Hotel → Rooms* → room states.
2. **Booking:** *Hotel → Bookings* → create a booking (no overlap) → check-in (syncs room state) → payment.

---

## Pre-demo checklist
- [ ] Confirm the demo tenant is **active** (platform owner → *Companies*).
- [ ] Log in with the scenario's account (password `Demo@2026`).
- [ ] Spot-check **mobile + RTL** on the one scenario you'll present (POS, invoice, the new electrical screens).
- [ ] Electrical section appears **only** on the electronics tenant — confirm it's hidden on, e.g., the clinic tenant.
