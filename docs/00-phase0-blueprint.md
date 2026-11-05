# Phase 0 blueprint (MS-00): Serene Insurance Customer Feedback System

| | |
|---|---|
| Status | **Draft for Nii's approval.** MS-00 verification criterion: Nii reviews and approves this plan. |
| Date | 2026-11-04 |
| Codename | `serene-pulse` (A-01) |
| Authority | The master build prompt v1.0 (`docs/source/SERENE PROMPT.md`, cited **[SPEC]**) is authoritative for everything it decides. This blueprint adds what the spec asks Phase 0 to produce: the baseline audit, new assumptions and questions, platform verification, diagrams, threat model, traceability and wireframes. Where the two disagree, this document says so explicitly and records it in `docs/decisions/`. |
| Next sessions | Run in **State B**: read this file, `docs/traceability.md` and the latest checkpoint before changing code. |

Companion documents:

| Document | Contents |
|---|---|
| [architecture/system.md](architecture/system.md) | Context, container and deployment diagrams; service boundaries |
| [architecture/data-model.md](architecture/data-model.md) | ERD, schemas, key constraints, RLS model |
| [architecture/flows.md](architecture/flows.md) | Auth, authorisation, survey session, survey state machine, case lifecycle, analytics pipeline |
| [architecture/api.md](architecture/api.md) | Survey API contract draft, RPC catalogue, error codes |
| [security/threat-model.md](security/threat-model.md) | STRIDE for the open survey, portal and key handling |
| [ui/wireframes.md](ui/wireframes.md) | Low-fidelity wireframes and states for every screen |
| [traceability.md](traceability.md) | Requirement → milestone → test (living gap audit) |
| [external-actions.md](external-actions.md) | Everything Nii must do outside the IDE, with steps |
| [decisions/](decisions/) | ADR log |

---

## STEP 0: Starting state and baseline gap audit

**State A, greenfield** [D-32]. The working directory was empty on 2026-11-04. Nothing was ever implemented, so every item is `MISSING`. The audit below is the baseline later sessions diff against. Its living form is `docs/traceability.md`.

```text
## GAP AUDIT (baseline, 2026-11-04)

MODULE/FEATURE: M01–M17 (all modules)
STATUS: MISSING
FINDING: No code, schema, infrastructure or plan existed.
ACTION TAKEN: Scheduled per the roadmap in STEP 11 (MS-01…MS-13).

MODULE/FEATURE: FR-01′, FR-14′, FR-31…FR-46
STATUS: MISSING
FINDING: Specified in SPEC; not implemented.
ACTION TAKEN: Mapped to milestones and test IDs in docs/traceability.md.

MODULE/FEATURE: FR-02…FR-13, FR-15…FR-30 (REQ §17)
STATUS: MISSING (and NOT YET ENUMERABLE)
FINDING: The requirements document insurance_customer_feedback_system_requirements.md
  is not in the workspace. Only FR-01, FR-14 and FR-17 are named in SPEC.
ACTION TAKEN: Raised as Q-35. Traceability rows are placeholders until the file is added.
```

### Undocumented gaps found while planning

These are things the spec doesn't cover, or that won't work as written on the chosen platform, and that a production build would not ship without. Each one is fixed in the plan and disclosed here, per the GAP-PATCHING protocol.

| ID | Gap | Fix in the plan | Ref |
|---|---|---|---|
| UG-01 | Lockout after 5 failures assumes an auth hook. Supabase's *password-verification* hook is, as last known, a paid-plan (Team) feature. | Staff sign-in goes through a small Edge Function `auth-sign-in`. It checks `profiles.locked_until`, calls Auth server-side, counts failures, sends lockout and new-device emails, and returns the session for `supabase.auth.setSession()`. Verified in spike S-01. | A-139 |
| UG-02 | Idle timeout (30 min) and absolute 12 h re-authentication assume Supabase session time-boxing, which is a Pro feature as last known. | Idle timeout is enforced client-side (with a WCAG 2.2.1 warning). The 12 h absolute limit is enforced server-side in the custom access-token hook: it refuses to mint a token for a session older than 12 h, so the refresh fails and the user signs in again. | A-149 |
| UG-03 | Edge Functions have a per-request CPU limit (~2 s as last known). A 100k-row XLSX in one invocation may exceed it. | Spike S-03 at MS-01 measures it. Plan A: chunked generation across invocations (rows written as sheet XML parts to Storage, zipped in a final step). If it can't meet 60 s / 100k rows, Q-37 asks for approval of a fallback. | A-140 |
| UG-04 | A hash-chained audit log needs serialised inserts. If survey submits were audited, every submit would contend on one lock. | Customer submissions are business data, not administrative actions, so they're **not** audit-log events (they're immutable rows already). The chain is serialised with `pg_advisory_xact_lock` only for staff and system actions. | A-141 |
| UG-05 | Supabase direct database connections are IPv6-only; GitHub-hosted runners have no IPv6. | Backups and `db push` in CI use the **Session pooler** URI (`SUPABASE_DB_URL_*`). | env |
| UG-06 | The no-JS fallback says "Turnstile non-interactive mode", but Turnstile needs JavaScript. | No-JS submissions are accepted, stored as `unverified`, and excluded from KPIs by default. This is the same path as a Turnstile outage (A-135). The no-JS form is ~1% of traffic, and real feedback is never lost. | A-144, ADR-0006 |
| UG-07 | The survey client JS budget is ≤ 35 KB gz; the Sentry browser SDK alone is ~25 KB+. | No Sentry SDK on the survey client. Client errors go in the telemetry beacon and the Worker forwards them to Sentry. The portal and Worker use the SDK normally. | A-147 |
| UG-08 | Staging hostnames are not specified. | `feedback-staging.<domain>` and `cx-staging.<domain>`, both behind `X-Robots-Tag: noindex` and a demo-data watermark. | A-136 |
| UG-09 | If Serene ever puts a **shared tablet/kiosk** in a branch, the 24 h device cooldown would block every customer after the first. | Raised as Q-36. The data model reserves `qr_points.mode` (`poster`/`kiosk`) now, so supporting kiosks later is not a migration crisis. | Q-36 |
| UG-10 | Four-eyes survey publishing and two-person `pii.view` grants are defeated while one person (Nii) holds both Executive and System Administrator. | v1 of the survey is published by migration at launch, so no approval step is needed then. The first runtime publish, and any `pii.view` grant, need a second named approver (Q-38). Until then the portal blocks self-approval and says why. | Q-38 |
| UG-11 | Ghana mobile prefix lists change (new ranges are allocated). | Validation checks the structure (`+233` + 9 digits, leading 2 or 5; accepts `0XX XXX XXXX`). The prefix allow-list lives in `settings`, not in code. | A-145 |
| UG-13 | SPEC asks for a *monthly automated restore in CI* **and** an age private key *held offline by Nii*. CI can't decrypt without the key. | Keep the key offline (the stronger control). CI checks every backup's existence, size and freshness (heartbeat). The full restore drill runs monthly on Nii's machine with `scripts/restore-drill` into the local Docker Supabase ([runbook](runbooks/restore-backup.md)), and its evidence goes in the checkpoint. | ADR-0007 |
| UG-12 | The Cloudflare free rate-limiting rule counts by IP only, with a 10-second period. | Rule: `POST /api/v1/survey/*`, 60 requests / 10 s per IP, block 10 s. A full survey uses ≤ 4 requests, so ~15 simultaneous customers behind one carrier NAT stay well under it. Session and device limits are enforced in SQL. | A-143 |

---

## STEP 1: Understanding

Serene Insurance LTD is a Ghanaian general insurer with 13 branches in 7 administrative regions. It wants one public, mobile-first survey link and a portal behind it.

* **The link.** Serene sends it by SMS (sender "SERENE", sent from its own provider, outside this system) or prints it on static QR posters.
* **The survey.** Five pages in under a minute: channel, branch (walk-in only) and product; then CSAT, CES and NPS with tap-to-advance; then optional factor, comment and "contact me" consent. Answers are anonymous unless the customer opts in.
* **The portal.** Six staff roles get honest analytics: n everywhere, low-sample protection, no "response rate". They also get a central CX case queue with Ghana working-day SLAs, alerts, PDF/XLSX reports, exports, configuration and a tamper-evident audit log.

Constraints that shape every decision:

1. **Free tiers.** Cloudflare + Supabase [D-27], so there's no SLA, no PITR, and CPU, email and storage are capped.
2. **One maintainer** with intermediate experience [D-28, D-31], so the system needs few moving parts, runbooks for everything, and enforcement in the database.
3. **An open link with no identity** [D-33], so every integrity guarantee is per *session* and per *device*, never per customer.
4. **Slow, metered mobile networks.** The survey must render in one request and never wait on the network between pages.

## STEP 2: Requirements

The SRS is SPEC §PHASE 1: the amended FR table (FR-01′, FR-14′, FR-31…FR-46), the NFR table, the user-role table and M01–M17, all as amended by REQUIREMENT OVERRIDES. This blueprint does not restate them. Deltas found in Phase 0:

| Delta | Effect |
|---|---|
| FR-02…FR-30 are not enumerable (Q-35) | Traceability is incomplete until the REQ file is added. This doesn't block MS-01…MS-03. |
| Lockout, session limits, no-JS Turnstile, survey-client error reporting | Implemented as described in UG-01, UG-02, UG-06 and UG-07, not as SPEC literally assumed. Behaviour visible to users is unchanged. |
| Availability target | SPEC's NFR says 99.5% measured; A-33 says 99.9% survey. **The NFR row wins** (it's the later statement, and it fits free tiers). A-33 is marked superseded by D-27. |
| RPO/RTO | SPEC's NFR (RPO ≤ 24 h, RTO ≤ 8 h) supersedes A-37 (15 min / 4 h, which assumed PITR). |
| Monitoring stack | A-122 (free stack) supersedes A-17's OTel/Grafana. |

## STEP 3: Assumptions (new, continuing from A-136)

| ID | Assumption | Reason | Impact |
|---|---|---|---|
| A-136 | Staging hosts are `feedback-staging.<domain>` and `cx-staging.<domain>`, `noindex`, watermarked | Two environments need two hostnames on Serene's zone (D-29) | DNS, Worker routes |
| A-137 | pnpm workspaces with plain package scripts (no Turborepo/Nx); Node 22 LTS | Fewest tools for one maintainer; pnpm is fast and strict about phantom dependencies | Repo |
| A-138 | Survey Worker *Smart Placement* stays **off** by default; decide at MS-06 from measurements | SSR + session creation make one DB call, and edge placement keeps HTML close to Accra. Measure before changing | Latency |
| A-139 | Staff sign-in via an `auth-sign-in` Edge Function (lockout, new-device email) | UG-01 | M01 |
| A-140 | Large XLSX built in chunked Edge Function invocations; fallback needs approval (Q-37) | UG-03 | M13 |
| A-141 | Customer submissions are not audit-log events; audit chain serialised by advisory lock | UG-04 | M15 |
| A-142 | Response references come from a per-year sequence; gaps allowed; there is no public lookup by reference | Gapless sequences serialise inserts; with no lookup endpoint, sequential references reveal nothing | M07 |
| A-143 | Cloudflare rate rule 60 req / 10 s / IP on `POST /api/v1/survey/*` | UG-12 | M05 |
| A-144 | No-JS submissions are stored as `unverified` | UG-06 | M06, M08 |
| A-145 | Phone validated structurally; prefix allow-list in settings | UG-11 | M06 |
| A-146 | Portal served as a Workers *static-assets* project (not Pages) | Cloudflare's current recommended path; same free unlimited static requests; one deploy tool (wrangler) | Hosting |
| A-147 | No Sentry SDK in the survey client; errors forwarded through the beacon | UG-07 | M06, M17 |
| A-148 | Survey ships with the system font stack; the portal uses self-hosted Inter | Saves ~40 KB on the first survey page; SPEC allows this when the budget is at risk. Revisit only if the measured budget has room | Survey CSS |
| A-149 | 12 h absolute session limit enforced in the access-token hook; idle timeout client-side | UG-02 | M01 |
| A-150 | `qr_points.mode` column (`poster` default; `kiosk` reserved, unused until Q-36 is answered) | UG-09 | M05 schema |
| A-151 | Ghana public-holiday seed covers 2026–2027 from the official gazette; System Admin adds new years | D-18 needs holiday data; dates are announced yearly | M02 |
| A-152 | The access-token hook refuses password sign-ins while an account is locked, so direct Auth API calls are blocked too | Supabase's password-verification hook is paid, so guesses made directly against the Auth API are not counted toward the lockout; the IP rate limit bounds them | M01 |
| A-153 | One 24-hour expiry applies to every email link (invite and reset) | Supabase has a single email-link expiry setting, and invites need 24 h | M01 |

## Answers received 2026-11-04

| Decision | Answer | Applied as |
|---|---|---|
| Plan | **Approved** by Nii | MS-00 complete; MS-01 started |
| Q-35 → done | REQ file added (`docs/source/`) | Traceability FR-02…FR-30 imported |
| Q-36 → **D-35** | **No** shared tablets or kiosks | Device cooldown applies to every device; `qr_points.mode` stays reserved (default `poster`) and unused |
| Q-38 → **D-36** | "Follow the most recommended path" | Four-eyes stays mandatory, and self-approval is blocked by the database. Survey v1 is published by migration. The first runtime publish and any non-Executive `pii.view` grant wait for a second Executive account, and the portal says so on the approval screen. Recommendation stands: invite a second Executive before go-live (MS-09) |
| Q-37 | Not yet relevant | Asked only if spike S-03 fails |
| **D-37** (supersedes D-29, X-03) | Host on Cloudflare's **workers.dev** subdomain, not a Serene domain | `serene-pulse-survey[-staging].eliteservicesagency3.workers.dev` and `serene-pulse-portal[-staging]…`. Consequences: (1) no zone, so the WAF rate-limiting rule (A-143) is replaced by the Workers Rate Limiting binding plus the SQL limits; (2) SMS links and QR posters carry the workers.dev URL, so moving to a custom domain later means reprinting posters (a redirect from the old host can be kept); (3) staff email still needs a domain we can verify for SPF/DKIM, see Q-39 |
| D-38 | Recreate Supabase in London (Nii, 2026-11-04) | The empty eu-west-1 project "Serene Pulse" was deleted after verifying 0 tables, users and files. Creating replacements through the API was refused (403: the access token lacks create permission), so Nii creates `serene-pulse-production` and `serene-pulse-staging` (West EU, London) in the dashboard |
| D-39…D-42 | Continuous production deploys; Workspace SMTP (answers Q-39); no R2; no Sentry/uptime accounts | See [ADR-0008](decisions/0008-ops-simplifications.md) |
| D-43 (supersedes the 12-character minimum) | Passwords need 8+ characters (Nii, 2026-11-05) | The common-password list and lockout stay. Applied to local config, hosted Auth (`scripts/configure-auth.mjs`), the portal check and the seed script |
| D-44 | Sign-in is email and password only: no 2FA and no CAPTCHA (Nii, 2026-11-05) | Turnstile is removed from sign-in (it stays on the public survey). Compensating controls: lockout, the IP rate limit (20 per 5 minutes), new-device emails, and the TOTP recommendation at MS-09 |
| ~~**Q-39**~~ answered by D-40 | Staff emails (invites, password resets, alerts) need a sending domain verified with SPF/DKIM. workers.dev can't be verified. | Options: (a) add DNS records for email only on Serene's real domain (no hosting change); (b) Gmail/Google Workspace SMTP for Supabase Auth and alerts (≈500/day, an app password); (c) Resend's test sender, which only delivers to the Resend account owner, so it's unusable for staff |

## New questions (non-blocking unless noted)

| ID | Question | Blocks | Default if unanswered |
|---|---|---|---|
| **Q-35** | Please add `insurance_customer_feedback_system_requirements.md` (and this prompt, `SERENE PROMPT.md`, and `designmd-RocketMoney.md`) to `docs/source/`. The REQ document was not available in this session. | Traceability completeness (MS-00 sign-off); acceptance tests REQ §17.1/§17.2 (MS-06, MS-08) | Proceed with MS-01…MS-03, which SPEC fully specifies |
| **Q-36** | Will any branch offer the survey on a **shared** tablet or kiosk (one device, many customers)? | MS-05 design detail | No kiosk mode; the 24 h device cooldown applies to every device |
| **Q-37** | *(Only if spike S-03 fails.)* For exports above what one chunked XLSX run can build in 60 s, may large exports be CSV only, with XLSX capped (e.g. 50k rows)? | MS-09 | Ask again with spike numbers |
| **Q-38** | Who is the **second approver**: an Executive other than Nii, for survey publishing (four-eyes) and for granting `pii.view`? | First runtime survey change; first `pii.view` grant to someone other than an Executive | Self-approval blocked; the v1 survey is published by migration |

## STEP 4: Architecture

The SPEC §2.1 target architecture is adopted unchanged. Refined diagrams are in [architecture/system.md](architecture/system.md). Points refined in Phase 0:

* **Four deployables:** (1) `apps/survey-worker` (Hono, SSR + survey API + cron keep-alive); (2) `apps/portal` (Vite SPA as a static-assets Worker, A-146); (3) `supabase/` (migrations, RLS, SQL functions, pg_cron jobs); (4) `supabase/functions/*` (Deno Edge Functions: `auth-sign-in`, `invite-user`, `send-email`, `export`, `generate-report`, `render-qr-poster`).
* **Trust boundaries:** only the survey Worker, Edge Functions and CI hold the service-role key. The portal holds the anon key plus a user JWT. `survey`, `pii`, `audit` and `ops` are not exposed through the Data API.
* **Asynchronous work:** business events go to a pgmq outbox in the same transaction. A pg_cron job drains it every minute (flags, roll-ups, notifications), and email goes through pg_net → `send-email` with the budget guard.

### Platform verification spikes (MS-01, before any feature code)

Free plans change, and SPEC requires re-checking every limit (ADR-0002). These spikes turn "as last known" into measured facts.

| Spike | Verifies | Pass criterion | If it fails |
|---|---|---|---|
| S-01 | Custom access-token hook on free; password-verification hook availability | Hook adds claims; sign-in proxy works end to end | Already planned around (A-139) |
| S-02 | pg_cron, pgmq, pg_net, Vault available on free | Each extension enabled in staging | Raise before MS-02 |
| S-03 | Edge Function CPU and wall-clock limits for XLSX/PDF | 100k-row XLSX ≤ 60 s chunked | Q-37 |
| S-04 | Worker CPU for SSR Page 1 + submit | p99 CPU < 7 ms (10 ms limit) | Trim SSR, precompute HTML per version |
| S-05 | Cloudflare free rate-limit rule fields | Rule creatable as A-143 | Rely on SQL limits; record |
| S-06 | Latency Accra → Worker → Supabase London | Submit p95 ≤ 400 ms (from a Ghana vantage point or RUM) | Evaluate Smart Placement (A-138) |
| S-07 | `pg_dump` via pooler + `age` + R2 upload + restore | Restore into local Supabase passes row-count and audit-chain checks | Block MS-01 completion |

## STEP 5: Database

SPEC §2.3 is adopted in full. The ERD, schema boundaries and RLS model are in [architecture/data-model.md](architecture/data-model.md). Phase 0 additions: `qr_points.mode` (A-150); `profiles.last_password_change_at`; `auth_sign_in_attempts` (ip_hash, email_hash, outcome, at), which feeds lockout and the sign-in-spike alert; and a `survey.reference_seq_<year>` sequence created on demand (A-142).

## STEP 6: API

SPEC §2.4 is adopted. The contract drafts (survey endpoints with request and response schemas, the error-code registry and the RPC catalogue with required permissions) are in [architecture/api.md](architecture/api.md). The OpenAPI 3.1 file is generated from the shared Zod schemas in `packages/contracts` at MS-05/06, so code and docs cannot drift.

## STEP 7: UI

The screen inventory is SPEC STEP 7. Low-fidelity wireframes, states (loading, empty, error, low-sample, no-access) and the mobile transformations are in [ui/wireframes.md](ui/wireframes.md). Design tokens are SPEC E1–E10, implemented once in `packages/ui` and consumed by both apps. The survey uses the CSS custom properties directly; the portal maps them through a Tailwind preset.

Logo assets: `assets/serene-logo.png` (source) plus `assets/serene-logo.svg` and `assets/serene-logo-reversed.svg`. The SVGs are **interim traces, pending the official vector** (X-10), and must not be used for print.

## STEP 8: Security

The SPEC SECURITY section is adopted (ASVS L2 minus MFA by decision [D-23]). The STRIDE analysis, including ballot-stuffing and the service-role key, is in [security/threat-model.md](security/threat-model.md). Controls added in Phase 0: UG-01/UG-02 auth enforcement, a CI bundle scan for `sb_secret_`/`service_role` patterns in **both** apps' built output, and `env-check` refusing a secret-looking key in a public slot.

## STEP 9: Testing

The SPEC TESTING section is adopted. Tooling: Vitest (TS units), pgTAP via `supabase test db` (RLS, functions, SLA maths), Playwright (e2e, 6 viewports, throttled network), axe-core (in Playwright), Lighthouse CI (survey budgets), k6 (load, against a temporary project to protect quotas), fast-check (property tests for the survey engine and the JS↔SQL validator agreement). Test IDs follow `T-<module>-<nnn>` and are referenced from `traceability.md`. CI fails if a traced requirement has no test (A-89).

## STEP 10: Deployment

| Environment | Survey | Portal | Database | Deploy |
|---|---|---|---|---|
| local | `wrangler dev` :8787 | `vite` :5173 | `supabase start` (Docker) | n/a |
| staging | `feedback-staging.<domain>` | `cx-staging.<domain>` | Supabase project #1 (eu-west-2) | Automatic on merge to `main` |
| production | `feedback.<domain>` | `cx.<domain>` | Supabase project #2 (eu-west-2) | Manual approval (GitHub environment protection) |

Pipeline per deploy: `supabase db push` (forward-only, expand/contract) → Edge Functions deploy → `wrangler deploy --env <env>` for the survey and portal Workers → smoke test `/healthz` and a synthetic survey render. Secrets go to their destinations through `scripts/sync-secrets` (MS-01) from `.env`. Everything Nii must create or configure is in [external-actions.md](external-actions.md). **Nothing external has been created or verified yet.**

## STEP 11: Implementation roadmap

The SPEC roadmap MS-00…MS-13 is adopted, with these Phase 0 refinements:

| Milestone | Refinement |
|---|---|
| MS-00 | This document set. **Done pending approval**, except the traceability rows blocked by Q-35. |
| MS-01 | Starts with spikes S-01…S-07 and ADR-0002 (measured free-tier limits) before feature code. Adds `scripts/sync-secrets` and extends `scripts/env-check.mjs` into runtime fail-fast validation (Zod) in each app. |
| MS-02 | Adds the `auth-sign-in` Edge Function (A-139) and the hook-based 12 h limit (A-149). |
| MS-05 | Decided by Q-36 (kiosk) before poster work. |
| MS-09 | Raises the MFA (TOTP) recommendation and the optional pen-test, as SPEC requires. |

Release gates remain **R1 after MS-09** and **R2 after MS-13**.

```text
## IMPLEMENTATION CHECKPOINT (MS-00)

COMPLETED: Phase 0 blueprint, architecture/flow/ERD diagrams, API contract draft,
  threat model, wireframes, traceability baseline, ADRs 0001, 0003–0006 (0002 is
  completed at MS-01 with measured limits), external-actions list, environment
  template and env checker, interim SVG logo masters.
FILES CREATED: see the repository root README "What exists" section.
FILES MODIFIED: none (greenfield).
DATABASE CHANGES: none (design only).
API CHANGES: contract drafts only.
TESTS: n/a for MS-00. env-check.mjs was run: it generated 8 application keys and
  reports the remaining values per milestone.
SECURITY VERIFICATION: threat model written; .gitignore excludes all .env* except
  the example; no secret values in tracked files.
RESPONSIVE VERIFICATION: n/a (wireframes only).
PERFORMANCE VERIFICATION: n/a (no code); budgets defined.
GAPS FOUND & PATCHED: UG-01…UG-12 (above), in the plan.
EXTERNAL ACTIONS STILL NEEDED FROM YOU: X-01, X-02, X-03, X-05, X-07 before MS-01;
  X-06, X-08 before MS-02 (docs/external-actions.md). Q-35 (source documents).
KNOWN ISSUES: traceability FR-02…FR-30 placeholders (Q-35); SVG logo is an interim trace.
ASSUMPTIONS: A-136…A-153.
FREE-TIER USAGE: none yet (no projects exist).
NEXT MILESTONE: MS-01 Platform foundation, starting with spikes S-01…S-07.
```
