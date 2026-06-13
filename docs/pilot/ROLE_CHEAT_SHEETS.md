# VANTORA FMCG — Role Cheat Sheets (Pilot)

One page per role: how to log in, where you land, and your daily flow.
Pilot tenant: **VANTORA Pilot FMCG (DEMO)** on staging. All passwords: `test.123`.

With role-aware landing (U1) live, **each role now opens directly on its work
screen** — no hunting through the dashboard.

---

## 🧑‍💼 Company Admin — `admin@pilot.test`
**Lands on:** `/dashboard` (your company overview + one-tap quick actions).
**Daily flow**
1. Dashboard → review Month Sales, Receivables, Overdue (clickable KPI cards).
2. Quick actions bar → New Invoice / Record Collection / New Customer / Reports.
3. Settings → Staff to add users & assign roles; Marketplace for modules; Action Policies / Features for governance.
**Key screens:** Dashboard · Settings (Staff, Organization, Features) · Reports.

---

## 🏢 Branch Manager — (role `branch_manager`)
**Lands on:** `/manager` (branch cockpit).
**Daily flow**
1. Manager home → branch KPIs and team status.
2. Approvals (menu) → clear day-close / transfer requests.
3. Purchasing → raise / receive purchase orders; manage suppliers.
4. Customers → onboard / edit local customers.
**Key screens:** Manager · Approvals · Purchasing · Customers · Inventory.

---

## 👀 Supervisor — `supervisor@pilot.test`
**Lands on:** `/approvals/queue` (your inbox — your #1 daily job).
**Daily flow**
1. Approval Queue → filter by type/status; Approve/Reject with a comment.
2. Mobile: the **Approvals** bottom-nav tab opens the same queue in one tap.
3. Supervisor home → coverage, reconciliations, out-of-route monitoring.
**Key screens:** Approvals (Field tab) · Supervisor · Reports.

---

## 🚐 Salesman / Van Rep — `salesman@pilot.test`  *(= "Cash Van")*
**Lands on:** `/today` (your day, not a KPI page).
**Daily flow**
1. Today → start the day; work your route customers in sequence.
2. Sell → POS / quick-sale (fast) or a full invoice; price is locked (you can't change it).
3. Collect → record cash against the customer's balance.
4. Van load → request a stock transfer to your van (goes to your supervisor).
5. End of day → close the day (a coverage exception goes to your supervisor).
**Mobile:** bottom-nav Home / Today / Customers / Sell / Inventory; "More" has everything else.
**Key screens:** Today · POS · Collections · Van Transfer request.

---

## 📦 Warehouse Keeper — `warehouse@pilot.test`
**Lands on:** `/inventory/requests` (load requests waiting for you).
**Daily flow**
1. Load Requests → approve reps' stock requests / van transfers.
2. Receive POs → book in deliveries (updates stock + AP).
3. Stock → adjust, transfer between warehouses, run counts.
**Key screens:** Inventory (Requests, Stock, Transfers, Count) · Purchasing (Receive).

---

## 💰 Accountant — `accountant@pilot.test`
**Lands on:** `/collections` (chase AR — your daily job).
**Daily flow**
1. Collections → record customer payments; watch outstanding balances.
2. Accounting → post vouchers (GL), review the journal and financial reports.
3. AR Aging → see who's overdue; Suppliers → record supplier payments.
**Key screens:** Collections · Accounting (Vouchers, Journal, Reports, Aging) · Suppliers.

---

### Notes
- **Separation of duties** is enforced: a salesman can sell & collect but cannot post the GL, change prices/credit, or approve loads; a Viewer is read-only.
- **Pilot demo data** is loaded (route, 12 invoices, collections, open AR, and 4 pending approvals) so every role sees a live, working system on first login.
- **Approvals** is now a single menu entry with tabs (Field / Workflow / Center).
