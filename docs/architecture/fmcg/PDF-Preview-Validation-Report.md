# PDF Share — Preview Validation Report

**Feature:** Share-as-PDF (sale / collection / return), server-rendered from the print view.
**Branch:** `claude/fmcg-sell-collect-loop` · **PR #311** · Commit `b329452` (feature) → `5e6bee8` (latest).
**Flag:** `platform.share_pdf` — default **OFF** (when OFF, the current text share is kept; the feature is dark until enabled per tenant).

---

## 1. Summary

| Layer | Result |
| --- | --- |
| Local typecheck / tests / build | **PASS** — tsc clean, 1,459 unit tests, `next build` compiled successfully |
| Vercel build + deploy of the PDF function | **PASS** — `/api/pdf` serverless function created, deployment READY |
| Chromium dependency size within Vercel limits | **PASS** — bundle accepted (no function-size failure) |
| Function boot / import errors | **NONE** — no error/fatal runtime logs |
| Live Chromium render (authenticated) | **NOT VERIFIABLE HEADLESSLY** — needs a logged-in session past Vercel SSO + app auth |

**Verdict:** the deployment-level risk (heavy headless-Chromium dependency breaking the build or exceeding Vercel's function size) is **cleared on the preview**. The only remaining step — executing the live PDF render — requires a human-authenticated session and a quick manual tap-test before enabling the flag for the pilot.

## 2. Evidence

### 2.1 Serverless function was created
Vercel's `lambdaRuntimeStats` per deployment:
- Pre-PDF commits (e.g. `DahB88…`, `ABYWuz…`): **`{"nodejs":3}`**.
- Share-as-PDF commit `b329452` (`BG5jMUyF…`) onward, incl. latest `723hzm2…`: **`{"nodejs":4}`**.

The jump from 3 → 4 Node functions is the new `/api/pdf/[doc]/[id]` route. Its presence in a **READY** deployment proves Vercel accepted the function **including** `@sparticuz/chromium` + `puppeteer-core` (i.e. it fit the 250 MB unzipped / 50 MB zipped function limit and all imports resolved).

### 2.2 No runtime errors
Runtime logs (level = error/fatal) for the latest deployment `dpl_723hzm2SAea9GE9zUqPHizZRjUP2`: **no logs found** — no boot/import crash. (The function has not been invoked yet because the flag is OFF and no authenticated user has hit it.)

### 2.3 Why the live render couldn't be auto-tested
The `/api/pdf` route is protected by **two** gates, neither drivable from the automation sandbox:
1. **Vercel deployment protection (SSO):** every automated request to the preview returns Vercel's "Authentication Required" challenge before reaching the app function.
2. **App session:** the route calls `getUserContext()` and forwards the caller's Supabase auth cookie to Chromium so the print page renders under the user's RLS scope.

With no ERP credentials and no non-interactive way past Vercel SSO, the end-to-end Chromium render cannot be executed by automation. A temporary self-test endpoint would also be blocked by the same SSO layer.

## 3. How the feature behaves (by design)

- **Share** → `GET /api/pdf/{invoice|collection|return}/{id}` → headless Chromium navigates to the existing print page (auth cookies forwarded) → returns `application/pdf`.
- Client wraps the bytes in a `File` named with the document number (`INV-… / COL-… / RET-….pdf`) and calls `navigator.share({ files })`.
- **On generation failure:** a clear error is shown and the share sheet is **not** opened.
- **No file-share support:** the PDF is downloaded (never raw text).
- Output is **identical to the print view** (same template → Arabic/RTL, company logo, customer + date).

## 4. Recommended close-out (one manual step)

To confirm the live render before enabling for the pilot, on the preview:
1. Enable `platform.share_pdf` for the test company (one DB flag, or I can flip it).
2. Open a completed sale → tap **Share** → confirm an Arabic **INV-….pdf** reaches the share sheet.
3. Repeat for a collection (COL-…) and a return (RET-…).

Because Daily Summary Phase 1 is independent of this feature, it can proceed in parallel with this manual check.

---

*Prepared from Vercel deployment metadata + runtime logs and the local build. The PDF feature is flag-gated OFF; enabling it for the pilot should follow the one-step manual render check above.*
