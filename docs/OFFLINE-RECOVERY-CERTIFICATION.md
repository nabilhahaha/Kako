# Offline Recovery Certification

**Result:** ✅ CERTIFIED — full recovery verified

- Edition: `retail`
- OS / environment: `linux x64` (logic certification in Linux CI container; on-hardware macOS/Windows runs are part of P1/P2)
- Build: `9ecb9b0`
- Timestamp: `2026-06-05T22:41:36.014Z`
- Restore path: physical `pg_restore` (custom-format dump)

## Procedure
create real data → physical backup → simulate total loss (`TRUNCATE … CASCADE`) → restore → verify.

## Verification (BEFORE must equal AFTER)

| Check | Before | After | Result |
|---|---|---|---|
| entity counts | `{"customers":1,"suppliers":1,"products":1,"invoices":1,"installment_plans":1,"stock_adjustments":1}` | `{"customers":1,"suppliers":1,"products":1,"invoices":1,"installment_plans":1,"stock_adjustments":1}` | ✅ PASS |
| customer balance | `1500` | `1500` | ✅ PASS |
| supplier balance | `300` | `300` | ✅ PASS |
| inventory quantity | `48` | `48` | ✅ PASS |
| installment schedules + paid | `{"paid":200,"schedules":6}` | `{"paid":200,"schedules":6}` | ✅ PASS |
| customer statement | `{"closing":1500,"entries":3}` | `{"closing":1500,"entries":3}` | ✅ PASS |
| supplier statement | `{"closing":300,"entries":1}` | `{"closing":300,"entries":1}` | ✅ PASS |

Loss simulation wiped the data to: customers=0, products=0, invoices=0 (proving the restore — not residual data — recovered everything).

## Sign-off
> All entity counts, customer/supplier balances, inventory quantities, installment schedules + paid amounts, and customer/supplier statement signatures matched exactly after restoring from a physical backup following total data loss. The offline store can recover from data loss. **Certified.**
