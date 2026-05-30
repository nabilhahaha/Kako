# Egyptian e-invoicing (ETA) — integration foundation

This repo ships the **code foundation** for integrating with the Egyptian Tax
Authority (ETA) e-invoicing system. It is **inert until configured** — no ETA
calls happen during normal builds, tests, or runtime without credentials.

## What's already here (Phase 1 — code)

- `src/lib/eta/config.ts` — env-driven config + `isEtaConfigured()`; preprod &
  production endpoints.
- `src/lib/eta/types.ts` — the ETA Document model (schema v1) + a normalized
  builder input.
- `src/lib/eta/document-builder.ts` — pure `buildEtaDocument()` mapping an
  invoice → ETA Document (line/tax/total math; unit-tested).
- `src/lib/eta/codes.ts` — VAT codes, 5-dp rounding, UTC datetime, common units.
- `src/lib/eta/client.ts` — API adapter: `getEtaToken` → `submitDocuments` →
  `getDocumentStatus` (throws clearly if unconfigured).
- `src/lib/eta/signing.ts` — `DocumentSigner` interface + `UnconfiguredSigner`
  + canonical `serializeForSignature()` (see the caveat below).
- `supabase/migrations/0075_eta_einvoice.sql` — `erp_company_eta_settings`,
  product `eta_item_code/_type/_unit_type`, and per-invoice `eta_status/uuid/…`.

## What you must provide (Phase 2 — your side)

1. **Register the company** on the ETA portal and obtain **API credentials**
   (`client_id` / `client_secret`) for the **preprod** (sandbox) environment.
2. **Get an e-seal certificate** (accredited e-signature, e.g. via Egypt Trust /
   MCDR). ETA requires a **CAdES-BES signature** on every document.
3. **Decide the signing architecture** for SaaS: each tenant signs with its own
   certificate — either a local token agent at the client, or a cloud HSM.
   Implement a `DocumentSigner` accordingly and pass it to `signDocument()`.
4. **Map codes**: set each product's `eta_item_code` (EGS or GS1) and
   `eta_unit_type`; set the company's tax registration & `taxpayer_activity_code`
   in `erp_company_eta_settings`.

### Caveat on signing
`serializeForSignature()` implements the published ETA "Serialize" algorithm on
a best-effort basis. **Validate it against the ETA SDK test vectors**
(<https://sdk.invoicing.eta.gov.eg>) before signing real documents — a mismatch
will cause ETA to reject the signature.

## Environment variables

```
ETA_ENVIRONMENT=preprod        # or "production"
ETA_CLIENT_ID=
ETA_CLIENT_SECRET=
ETA_DOCUMENT_TYPE_VERSION=1.0
```

Set these only in the runtime environment (never commit them). With them unset,
`isEtaConfigured()` is false and the client refuses to call out.

## Go-live checklist

- [ ] Company registered on ETA; preprod credentials set.
- [ ] e-seal certificate obtained; `DocumentSigner` implemented & wired.
- [ ] `serializeForSignature()` verified against ETA SDK vectors.
- [ ] Product `eta_item_code`/`eta_unit_type` mapped; company settings filled.
- [ ] Migration `0075` applied (staging → production).
- [ ] End-to-end submit + status confirmed on **preprod**.
- [ ] Switch `ETA_ENVIRONMENT=production` and repeat with prod credentials.
