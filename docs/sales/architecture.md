# Online sales: architecture (2026-11-06)

Customers sign in with their phone number, get a quote, fill in the proposal form for any of
Serene's 28 products, attach ID and supporting photos/documents, sign electronically, pay
(simulated gateway for now) and download their certificate of insurance. Staff review proposals,
price the ones that need an underwriter, and see every customer, proposal, payment, policy and
certificate in the admin portal.

```
landing site (/)          customer app (/account)            staff portal (/admin)
 quick quote widget  ───►  phone sign-in, wizard, sign, pay   customers, proposals, policies
 /verify certificate        │ fetch /api/account/* (cookie)    │ supabase-js + RLS (staff JWT)
                            ▼                                  ▼
                   site Worker (Hono)  ── service key RPC ──► Supabase: schema `sales`
                    /api/account/*, /api/verify                 tables + SECURITY DEFINER RPCs
                    SMS (simulated|Arkesel), payments (simulated)   Storage bucket `customer-files`
```

## Packages and apps

| Path | Owner of | Notes |
|---|---|---|
| `packages/proposals` | form definitions, validation, products, rating, certificate content, API types, document renderers | Pure TS, runs in browser and Worker. `render/` (pdf-lib, docx) is browser-only and exported separately as `@serene/proposals/render`. |
| `apps/survey-worker/src/account/*` | `/api/account/*`, `/api/verify`, serving `/account` | Same Worker as the rest of the site. |
| `apps/account` | customer SPA (React 19, Vite, TanStack Router/Query, Tailwind 4), `base: '/account/'` | Assembled into `apps/survey-worker/public/account/` by `scripts/assemble-site.mjs`. |
| `apps/portal` | staff pages for sales | Existing app; streamlined. |
| `supabase/migrations/2026111300{01..09}_*.sql` | schema `sales` | Lead's range; the survey fixes use `202611130010+`. |

## Customer authentication (phone + one-time code)

* `POST /api/account/otp/start {phone}`: normalise to E.164 (+233 and 9 digits; Ghana numbers only);
  rate limits: 1 code per phone per 30 s, 5 per phone per hour, `RL_API` per IP; 6-digit code,
  valid 5 minutes, 5 attempts. Only an HMAC of the code is stored
  (`HMAC-SHA256(SURVEY_HMAC_KEY, "account-otp:" + challengeId + ":" + code)`, domain-separated so
  no new secret is needed). The response never reveals whether the phone is already a customer.
* SMS delivery is behind an interface. Setting `sales_sms_mode`: `simulated` (default until an SMS
  account exists: no SMS is sent and the response carries `simulatedCode`, which the app shows in a
  clearly labelled "Test mode" banner) or `arkesel` (needs Worker secret `ARKESEL_API_KEY` and
  sender ID setting `sales_sms_sender_id`). Production stays on `simulated` until Serene supplies an
  SMS account.
* `POST /api/account/otp/verify`: on success, create the customer if new (customer number
  `USR` + 5 digits from a sequence starting at 10001 so it never collides with the legacy portal's
  numbers), create a session (32 random bytes, only a SHA-256 hash stored), set cookie
  `__Host-serene_account=<token>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`.
  Sessions: 30 days absolute, 7 days idle, revocable (sign-out deletes the row).
  Every state-changing request also requires header `x-requested-with: serene-account` (CSRF:
  a cross-site form cannot set it) and an `Origin` matching the site.

## Data model (schema `sales`)

* `customers`: id, customer_no (unique), phone_e164 (unique), profile fields of `CustomerProfile`,
  marketing_consent + consent timestamps, status, created_at, last_sign_in_at.
* `otp_challenges`: id, phone_e164, code_hmac, expires_at, attempts, consumed_at, ip_hash, created_at.
  Purged after 24 h by pg_cron.
* `customer_sessions`: id, customer_id, token_hash (unique), created_at, last_seen_at, expires_at, user_agent.
* `proposals`: id, proposal_no (`PRP-26-000123`), customer_id, product_code, form_id, form_version,
  status (see `ProposalStatus`), answers jsonb, current_step, quote jsonb, premium, sum_insured,
  cover_start, cover_end, insured_subject, confirmations text[], signature jsonb (method,
  signedName, signedAt, ip, userAgent, answersSha256, storage path of the PNG), submitted_at,
  reviewed_by, reviewed_at, staff_message, created_at, updated_at. Answers are frozen once submitted
  (trigger) except while `info_requested`.
* `proposal_events`: append-only history (status changes, who, when, note) shown in both apps.
* `proposal_files`: id, proposal_id, customer_id, field_id, kind, storage_path, mime, size,
  original_name, sha256, created_at.
* `payments`: id, reference (`PAY-` + 10 chars), proposal_id, customer_id, amount, method, network,
  masked_account, provider (`simulated`), status, failure_reason, created_at, completed_at.
* `policies`: id, policy_no, certificate_no, customer_id, proposal_id, payment_id, product_code,
  cover_title, insured_subject, starts_on, expires_on, premium, sum_insured, certificate jsonb
  (`CertificateData` snapshot, immutable), status, issued_at.
* Number formats, following Serene's existing documents: policy `SE{yy}{code}{seq5}-E`
  (e.g. `SE26MTP10001-E`; code from `policyCode()`: MTP/MTF/MCO for motor, else the product code;
  `-E` = issued online, as on the legacy portal), certificate `C{nn}-{yy}-{seq5}` with
  `nn` = setting `sales_certificate_series` (default `01`, online channel), proposal `PRP-{yy}-{seq6}`.
* Storage bucket `customer-files` (private, 10 MB per file, images/PDF only):
  `{customer_id}/{proposal_id}/{file_id}.{ext}`; signatures `{customer_id}/{proposal_id}/signature.png`.
* Settings keys (existing `public.settings`): `sales_rates` (RateTables JSON), `sales_tppd_limit`
  (8000), `sales_sms_mode`, `sales_sms_sender_id`, `sales_payment_mode` (`simulated`),
  `sales_certificate_series`, `sales_certificate_signatory_title` ("CHIEF EXECUTIVE OFFICER"),
  `sales_certificate_signature_path` (storage path of an image uploaded by an administrator; until
  one is uploaded the certificate shows a dotted signature line only: we never draw a signature
  on anyone's behalf), `sales_quote_validity_days` (30).

Access: customers never touch tables. The Worker calls SECURITY DEFINER functions
(`public.account_*`, `public.verify_certificate`) granted to `service_role` only, each taking the
customer id resolved from the session. Staff read through RLS with new permissions:

| Permission | Meaning | Granted to |
|---|---|---|
| `customers.view` | customer records and KYC documents | executive, system_admin, underwriter, cx_admin, auditor |
| `proposals.view` | proposals, attachments, documents | executive, system_admin, underwriter, cx_admin, auditor |
| `proposals.review` | price, request information, decline, cancel | executive, underwriter |
| `policies.view` | policies, certificates, payments | executive, system_admin, underwriter, cx_admin, auditor |
| `policies.manage` | cancel a policy | executive, underwriter |
| `products.manage` | rates and sales settings, certificate signature image | executive, system_admin |

New role `underwriter` ("Underwriter": reviews and prices proposals, issues and manages policies;
organisation scope). Staff actions go through audited RPCs (`audit.append`).

## Proposal lifecycle

```
draft ──submit──► submitted ──(instant product, rating ok)──► quoted ──pay──► paid ──► issued
                      │                                          ▲
                      └─(underwriter product, or rating refers)─► under_review ──price──┘
                                                                      ├─► info_requested ──resubmit──► submitted
                                                                      └─► declined
quoted ──(validUntil passes)──► expired      any non-final state ──► cancelled
```

* Submit (Worker): load the form; `clean()` then `validateForm()`; require every
  `GLOBAL_CONFIRMATIONS` id plus the form's confirmations; require a signature PNG (≤ 300 KB);
  require each required file field to reference files that belong to this proposal; compute
  `answersSha256`; price with `priceProposal()` using `sales_rates`; store all in one RPC.
* Pay: `POST …/payments` creates a pending payment for `quote.total` (only when `quoted` and not
  expired). The simulated gateway validates the MoMo number (Ghana mobile) or card (Luhn, future
  expiry, 3-digit CVC) and keeps only a masked form. `POST /api/account/payments/:ref/simulate
  {approve}` stands in for the customer approving the MoMo prompt or 3-D Secure.
  Test values: MoMo numbers ending `0000` and card `4000 0000 0000 0002` are declined.
  On approval one RPC marks the payment succeeded, issues the policy with the next numbers, stores
  the certificate snapshot from `buildCertificate()`, and moves the proposal to `issued`; it is
  idempotent per payment reference.
* Customer and staff both see the history from `proposal_events`.

## Documents

Rendered in the browser by `@serene/proposals/render` from stored data, so the same bytes come out
for the customer and for staff:

* `renderProposalPdf(doc)` / `renderProposalDocx(doc)`: the completed proposal form laid out like
  Serene's paper form: logo and head-office letterhead, the paper title and subtitle, numbered
  questions with the answers written on the dotted lines, tick boxes ticked, YES/NO with the
  chosen answer marked, tables with the paper's columns, read-and-acknowledged notices, the
  declaration paragraphs, the signature image over "Proposer's Signature", date and the fields of
  the signature block; then a final page "Electronic signature record" (signed name, phone, time,
  IP, SHA-256 of the answers) and a list of attached documents.
* `renderCertificatePdf(cert, assets)`: A4 copy of Serene's sample motor certificate (yellow
  vertical rule with "S E R E N E  I N S U R A N C E" running down the left margin, logo, "SERENE
  INSURANCE GHANA LTD", act line, "CERTIFICATE OF INSURANCE", navy double border, numbered items,
  clauses, two-column facts, certify paragraph, signature line and "CHIEF EXECUTIVE OFFICER"),
  plus a small QR code to `/verify?certificate=…` and the issue date/time. Non-motor
  certificates use the same frame with their own items (general layout from `buildCertificate`).
* PDF fonts: Helvetica / Helvetica-Bold (pdf-lib standard fonts), so amounts are written
  `GHS 6,000.00` (the cedi sign is not in WinAnsi).

## Public certificate check

`/verify` on the landing site (form: certificate number + vehicle registration or policy number) →
`GET /api/verify` → `public.verify_certificate()`; returns status, product, cover, dates, insured
subject and the holder's initials only. Rate limited by `RL_API`.
