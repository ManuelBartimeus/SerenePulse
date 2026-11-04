# API contract drafts

These drafts become Zod schemas in `packages/contracts` (MS-04/05/06). The OpenAPI 3.1 document is **generated** from those schemas, so this file describes intent and the generated file is the contract.

## 1. Public Survey API (`feedback.<domain>`, Hono Worker)

Every API request needs the `__Host-svs` cookie and an `Origin` equal to the survey host. Bodies are capped at 8 KB. Errors are `application/problem+json` (RFC 9457) with a stable `type`.

### `PATCH /api/v1/survey/answers`

```jsonc
// request
{ "seq": 7, "page": 2, "answers": { "csat": 4 } }
// 204 No Content. A stale seq is ignored silently (still 204)
```

### `POST /api/v1/survey/submit`

```jsonc
// headers: Idempotency-Key: <uuid generated once per session on the client>
{
  "answers": {
    "channel": "WALK_IN", "channelOther": null,
    "branch": "KASOA", "branchOther": null,          // branch: code | "OTHER" | null
    "product": "MOTOR", "productOther": null,
    "csat": 4, "ces": 5, "nps": 9,
    "factor": "SPEED", "factorOther": null,
    "comment": "…",
    "contact": { "consent": true, "phone": "0241234567", "firstName": "Ama" }
  },
  "turnstileToken": "…"
}
// 200
{ "reference": "FB-2026-000123", "contactMasked": "024 ••• 4567" }
```

### `POST /api/v1/survey/events`

`sendBeacon`, an array of ≤ 50 `{type, page, clientTs, detail}`. Returns 204. Best effort; never retried.

### `GET /healthz`

`200 {"status":"ok","db":"ok","version":"<git sha>"}` or `503` when the DB call fails.

### Error registry (`type` = `https://feedback.<domain>/errors/<code>`)

| code | HTTP | When | Customer message (SPEC ERROR HANDLING) |
|---|---|---|---|
| `already-shared` | 409 | Device inside the cooldown, or session already submitted with a different key | "You've already shared your feedback — thank you!" |
| `session-expired` | 410 | Session older than 24 h of inactivity | Page reloads into a fresh session; answers restored from `sessionStorage` |
| `validation-failed` | 422 | Answer set invalid for the bound version (`errors[]` per field) | Field-level messages |
| `verification-failed` | 403 | Turnstile token rejected (not an outage) | "Please tap Submit again so we can confirm you're not a robot." |
| `rate-limited` | 429 | Draft-write limit exceeded | "Please wait a moment and try again." |
| `bad-origin` | 403 | Origin check failed | n/a (not a customer path) |
| `unavailable` | 503 | DB unreachable | "We can't take feedback right now…" |

## 2. Portal RPC catalogue (Supabase, user JWT)

Every RPC: `SECURITY DEFINER`, `SET search_path = ''`, first statement `perform app.require_perm('<key>')`. SQLSTATE mapping in `packages/contracts/errors.ts`: `42501` → 403, `P0001` + `DETAIL` code → domain error, `40001` → retry, `P0409` (custom) → optimistic-lock conflict.

| Module | RPC | Permission |
|---|---|---|
| M01 | `admin_set_grants`, `admin_suspend_user`, `admin_reactivate_user` | `users.manage` |
| M01 | `me_complete_first_login` | authenticated |
| M02/M03 | `branch_deactivate`, `catalogue_reorder` | `config.directory` / `config.catalogues` |
| M04 | `survey_version_create_draft`, `_update`, `_validate`, `_request_publish`, `_preview_link` | `survey.edit` |
| M04 | `survey_version_approve_publish` (approver ≠ requester) | `survey.publish.approve` |
| M08 | `analytics_summary`, `_breakdown`, `_trend`, `_compare`, `_distribution`, `_funnel`, `_cases`, `_completion_time` | `analytics.view` (+ scope) |
| M10 | `response_propose_correction` / `response_approve_correction` | `responses.attribution.propose` / `.approve` |
| M11 | `flag_dismiss`, `flag_convert_to_case` | `flags.review` |
| M11 | `case_create` · `case_assign` · `case_start`/`case_add_note`/`case_record_investigation`/`case_resolve` · `case_close`/`case_reopen` · `case_escalate`/`case_de_escalate` · `case_record_follow_up` | `cases.create` · `cases.assign` · `cases.work` · `cases.close` · `cases.work` · `cases.work` |
| M11 | `pii.reveal_contact(case_id, reason)` | `pii.view` (+ assignment for officers) |
| M12 | `alert_acknowledge`, `alert_resolve` | `alerts.manage` |
| M14 | `notifications_mark_read` | own rows |
| M15 | `audit_verify_chain` | `audit.view` |
| M16 | `privacy_find_contact`, `privacy_erase_contact` | `pii.view` + `settings.manage` or Exec (audited) |

Analytics row shape (every analytics RPC):

```jsonc
{ "key": "KASOA", "label": "Kasoa", "value": 82.4, "n": 91, "low_sample": false,
  "benchmark": 78.1, "delta": 4.3, "target": { "value": 80, "status": "met" },
  "period": { "from": "2026-10-01", "to": "2026-10-31", "tz": "Africa/Accra" },
  "denominator": "valid CSAT answers", "filters_applied": { … }, "unverified_excluded": 3 }
```

## 3. Edge Functions

| Function | Caller | Auth | Purpose |
|---|---|---|---|
| `auth-sign-in` | Portal | none + Turnstile | Sign-in with lockout (A-139) |
| `invite-user` | Portal | JWT + `users.manage` | Admin API invite |
| `send-email` | pg_net | `JOBS_SHARED_SECRET` | Drain email jobs through Resend; budget guard |
| `export` | Portal | JWT + `exports.create` (+ `pii.export`) | CSV/XLSX/PDF → Storage → signed URL |
| `generate-report` | pg_net / Portal | jobs secret / JWT | Scheduled + on-demand PDF + XLSX |
| `render-qr-poster` | Portal | JWT + `config.qr_points` | A4/A5 PDF + SVG QR |
