# TIS Simplicity Model — Simple · Advanced · Expert

**Product direction:** Keep TIS intentionally simple. Not every capability is exposed to
every user. The primary user is a **Sales Supervisor / Area Manager**, and **most
companies should succeed without ever opening Advanced or Expert.**
**Status:** Governing UX principle (no implementation). Shapes all pending TIS work.
**Date:** 2026-06-19

---

## 1. The three levels (progressive disclosure)

| Level | Default | Audience | How it appears |
| :--- | :--- | :--- | :--- |
| **Simple** | **On** | Supervisor / Area Manager (everyone) | The only thing visible by default |
| **Advanced** | Off | Power users who opt in | One "Advanced" toggle reveals it |
| **Expert** | **Hidden** | Rare; gated | Hidden behind a toggle (+ optional permission/flag) |

**Rule:** the default screen shows **Simple only**. Advanced and Expert are collapsed
disclosures — never shown unless the user asks for them. Closing them returns to Simple.

---

## 2. Capability → level mapping

### Simple Mode (default — the whole job for most companies)
- **Upload** (Excel/CSV in)
- **Routes** (number of routes)
- **Working Days**
- **Balance By** — Workload · Sales Value · Customer Count
- **Generate** (Optimize)
- **Review** (map + Route/Day/Salesman views + metrics)
- **Export** (Excel/CSV out)

> This is the full Import → Configure → Optimize → Review → Plan → Export loop with the
> fewest possible knobs. A supervisor never needs more than this.

### Advanced Mode (opt-in)
- **Visit Duration** (global default + class/channel defaults)
- **Max Customers per Route**
- **Max Visits per Day**
- **Channel / Class rules**

> Feasibility validation (e.g. "requested routes can't fit — recommend N") surfaces here
> too, but the *recommendation* itself is shown inline in Simple when a plan is infeasible.

### Expert Mode (hidden by default)
- **Traffic**
- **Time Windows**
- **Capacity** (vehicle / load)
- **Advanced weighting**

> Hidden for everyone by default; revealed only on explicit request (and may be gated by
> permission/flag). Not part of the day-to-day manager flow.

---

## 3. Two orthogonal axes (don't conflate them)

- **Who may run optimization** → the `tis.run_optimization` permission (Salesman hidden;
  Supervisor/Area/Regional/Director allowed; Admin configurable).
- **Which settings are visible** → the Simple/Advanced/Expert tiers above.

A permitted user still lands in **Simple** by default; tiers control surface complexity,
permissions control access.

---

## 4. How this shapes pending work

- The **constraints UI** (assessment item A) ships tiered: **Simple** = Routes · Working
  Days · Balance By · Generate; **Advanced** reveals Max/route · Max visits/day · Visit
  Duration · Channel/Class; **Expert** (hidden) holds traffic · time windows · capacity ·
  weighting.
- **Visit Duration** (item D) defaults to a single **global default** (e.g. 20 min) in
  Advanced; class/channel overrides are optional — nobody must maintain per-customer data.
- **New Optimization** (item B) opens in Simple Mode, Excel-in/Excel-out, no live writes.
- Feasibility recommendations appear **inline in Simple** (no need to open Advanced to
  learn a plan won't fit).

**Design test for every new TIS setting:** *Does a supervisor need this to get a good
plan?* If no → it goes to Advanced or Expert, collapsed by default.
