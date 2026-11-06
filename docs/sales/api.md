# Customer API: notes beyond the `api.ts` / `claims.ts` comments

Implementation: `apps/survey-worker/src/account/` (routes in `index.ts`). Database functions:
`supabase/migrations/202611130001…006_sales_*.sql`. The endpoint lists at the bottom of
`packages/proposals/src/api.ts` and `claims.ts` are authoritative; this page lists only what they do not say.

## Every request

* Errors are `application/problem+json` `{ title, status, detail?, errors?: FieldError[] }`; validation is
  **422 with `errors[]`**. Responses are `cache-control: private, no-store` (catalogue: public, 5 min).
* **Every non-GET request**, signed in or not (`otp/start`, `otp/verify`, `quick-quote`, …), needs header
  `x-requested-with: serene-account` and an `Origin` equal to the site, otherwise **403**. The landing
  site's quick-quote widget must send the header too.
* `RL_API` limits every `/api/account/*` and `/api/verify` request per IP (429 + `retry-after`).
* Signed-out requests to signed-in routes: **401** (a stale cookie is cleared).
* A record that is not the caller's is a plain **404**, the same as a missing one.

## Differences and additions

| Endpoint | Note |
|---|---|
| `POST /otp/start` | 422 `errors[{field:'phone'}]` for non-Ghana-mobile numbers. 429 `{retryAfterSeconds}` for 1 code / 30 s and 5 codes / hour per phone. `simulatedCode` only while `sales_sms_mode` is `simulated` (or `arkesel` without the `ARKESEL_API_KEY` secret). `turnstileToken` is verified when sent and the secret is configured. |
| `POST /otp/verify` | Wrong code: 422 `errors[{field:'code'}]` with attempts left; locked (5 wrong): 429; expired/used: 422. Cookie `__Host-serene_account` (local http: `dev-serene_account`). |
| `PATCH /me` | `phone`, `customerNo`, `createdAt` are ignored; unknown keys are 400. Identity-check status is staff-only and never in `CustomerProfile`. |
| `POST /quick-quote`, `POST /proposals/:id/quote` | Referral: **422** `{ title: 'Referred to an underwriter', status: 422, detail: refer.join(' '), refer: string[] }`. Quick quote takes partial answers, no session, body ≤ 16 KB. `validUntil` = today + `sales_quote_validity_days`. |
| `GET /proposals/:id` | `ProposalDetail.history` (added, optional): `{ at, event, fromStatus?, toStatus?, note?, by: 'customer'|'serene'|'system' }[]`. Staff never appear by name. |
| `POST /proposals/:id/files` | Multipart `fieldId`, `file` (`kind` optional; the form field's `kind` is used). Type from the file's bytes (JPEG, PNG, WebP, HEIC, PDF), else **415**; also 415 when the field does not accept that family. > 10 MB: 413. Kinds `id_front`, `id_back`, `ghana_card` are refused (400, L.I. 2523). Returns 201 `ProposalFile`. |
| `GET /files/:fid` | Serves proposal **and claim** files (owner only), `content-disposition: attachment`, `nosniff`. |
| `POST /proposals/:id/submit` | 422 `errors[]` field names: form field ids, `confirmations.<id>`, `signature`, `signature.signedName`. Confirmations required: every `GLOBAL_CONFIRMATIONS` id plus the form's. Signature PNG ≤ 300 KB. `answersSha256` = SHA-256 of the cleaned answers as JSON with keys sorted at every level. |
| `POST /proposals/:id/payments` | 201. MoMo: `network` + Ghana mobile number; card: Luhn, `cardExpiry` MM/YY not expired, 3-digit `cardCvc`. Only a masked account is stored. 409 when not quoted or the quote expired. |
| `POST /payments/:ref/simulate` | `{approve:false}` and the test numbers (MoMo ending `0000`, card `4000 0000 0000 0002`) fail the payment. Approval is idempotent. If the certificate cannot be built: **500** `We could not produce your certificate.`; the payment stays pending. 404 unless `sales_payment_mode` is `simulated`. |
| `GET /policies/:id` | `PolicyDetail.signatureUrl` (added, optional) when the certificate has a signature image. |
| `GET /policies/:id/signature` | The signature image recorded at issue (owner only); 404 when none. |
| `POST /policies/:id/renew` | 201 `ProposalDetail` (new draft; previous answers; cover from the day after expiry, or today if expired, for one year; files and signature not copied). 409 for a cancelled policy. |
| `POST /policies/:id/claims` | 201 `ClaimDetail` with status **`draft`** (added to `ClaimStatus`: documents still being added). Only on an active policy; incident date not in the future and inside the cover period (422 `errors[{field:'incidentDate'}]`); `claimType` must fit the product line (`claimTypesFor`). |
| `POST /claims/:id/files` | Multipart `kind`, `file`; `kind` must be one of the claim type's documents. While `draft` or `info_requested`. |
| `POST /claims/:id/submit` | draft → received. Missing required documents: 422 `errors[{ field: <kind>, message: 'Please attach: <label>.' }]`. |
| `GET /api/verify` | Needs both `certificate` and `reg` (registration or policy number), else 422. Unknown or mismatched: `{ found: false }`. Only initials of the holder. |
