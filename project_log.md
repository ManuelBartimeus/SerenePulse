# Serene Pulse — project log

The running record of what has been built, decided and changed in the Serene Insurance
customer-feedback system, newest work at the bottom. Detailed design lives in `docs/`
(blueprint, architecture, ADRs, checkpoints); this log is the chronological story and the place
to look first.

**Live site (one address per environment)**

| Environment | Address |
|---|---|
| Production | https://serene.eliteservicesagency3.workers.dev |
| Staging | https://serene-staging.eliteservicesagency3.workers.dev |

On each: `/` landing site · `/admin` staff portal · `/customerfeedback` customer survey.

**Stack.** pnpm workspace, TypeScript (strict). Cloudflare Workers (Hono) serve the whole site;
the portal is React 19 + Vite + TanStack Router/Query + Tailwind; Supabase (PostgreSQL 17, Auth,
Edge Functions, pg_cron, pgmq, Vault) in London (eu-west-2); GitHub Actions for CI and continuous
deploys (staging → production). Repository: `ManuelBartimeus/SerenePulse`.

---

## 2026-11-04 — Phase 0 blueprint and platform foundation (MS-00, MS-01)

* **Blueprint** (`docs/00-phase0-blueprint.md`): understanding, requirements, assumptions
  A-136…, architecture, data model, API, UI wireframes, security threat model, test plan,
  deployment, roadmap MS-00…MS-13; traceability matrix (`docs/traceability.md`); ADRs 0001–0008.
* **Decisions from Nii:** no kiosks; "follow the most recommended path" for second approvers
  (D-36); host on Cloudflare `workers.dev` rather than a custom domain (D-37); Supabase projects
  recreated in London (D-38); production deploys without manual approval (D-39); Workspace/Gmail
  SMTP (D-40); backups as encrypted GitHub artifacts instead of R2 (D-41); no Sentry or uptime
  account (D-42).
* **Platform:** pnpm workspace, env validation (fail fast), survey Worker skeleton with `/healthz`
  and keep-alive cron, portal skeleton on the Serene design tokens, Supabase foundation migration
  (schemas, settings + history, hash-chained audit log, ops tables, pgmq outbox, Vault loader).
* **CI/CD:** lint, types, unit, pgTAP, SQL lint, secret scan, bundle scan → deploy staging →
  smoke test → deploy production. Nightly encrypted data-only backup; restore drill **passed**.
* **Scripts:** `env-check`, `sync-secrets` (GitHub, Worker, Supabase, local), `scan-bundles`,
  `restore-drill`.

## 2026-11-05 (morning) — Identity, access control and audit (MS-02)

* Roles (6), permissions (31) and grants with branch scope; custom access-token hook puts roles,
  permissions and scope in the JWT; RLS everywhere; audit triggers.
* Sign-in through the `auth-sign-in` Edge Function: lockout after 5 failures for 15 minutes,
  enumeration-safe messages, new-device notices; forced password change at first sign-in; 30-minute
  idle sign-out with warning; 12-hour session limit.
* Nii's decisions: passwords 8+ characters (D-43); sign-in is email + password only — no 2FA, no
  CAPTCHA (D-44).
* Seed System Administrator + Executive created in staging and production.
* Gmail rejected the account password (it needs a 16-character app password), so **invites and
  password resets are copied as links by an administrator** instead of emailed (D-45).
* Fix: CI's database had no default table privileges → explicit grants in migrations.

## 2026-11-05 — Survey foundation (MS-03, MS-04, MS-06 database)

* Directory and catalogues with the exact COMPANY CONTEXT seeds: 13 branches, 7 regions,
  8 products + Other, 7 channels (branch question only for walk-in/Other), 8 improvement factors,
  departments, Ghana public holidays 2026–2027.
* `packages/survey-engine`: question visibility, clearing, validation and length guardrails,
  mirrored exactly in SQL; a parity test checks both on 2,000 generated answer sets.
* Survey versions with four-eyes publishing; v1 (REQ §2.4–2.8) published by migration.
* Survey runtime: sessions, immutable responses, device cooldown, telemetry, envelope-encrypted
  consented contact details, idempotent submit.

## 2026-11-05 (afternoon) — Full build in parallel streams (MS-03…MS-13)

Six streams built in parallel against fixed contracts, then integrated:

* **Survey (MS-05/06):** server-rendered pages 1–5, 7.9 KB island, tap-to-advance, autosave and
  resume, consent + Ghana phone, Turnstile, no-JS form, telemetry, rate limiting. 24/24 browser
  tests on phone and desktop including accessibility.
* **Configuration screens:** Feedback form page, survey editor with live preview, directory,
  catalogues, settings (plus QR points and an SMS link guide — removed again on 2026-11-05 evening).
* **Analytics (MS-07/08, M10):** daily roll-ups, metric functions, dashboards, records explorer.
* **Cases and alerts (MS-10/11):** flagging, cases with working-day deadlines and Ghana holidays,
  escalation, contact reveal, alerts, in-app notifications, outbox and email sender.
* **Reports and privacy (MS-09/12/13):** CSV/XLSX exports, scheduled PDF/XLSX reports, retention
  jobs, data-subject requests, branch corrections, system status page.
* **Design:** Serene landing site (content from sereneinsurance.com, Rocket Money-style layout),
  redesigned portal shell and controls.

**Single site (user direction).** One Worker now serves everything on one address: landing at `/`,
portal at `/admin`, survey at `/customerfeedback` (`scripts/assemble-site.mjs` builds landing +
portal into it). The four old separate survey/portal Workers were deleted. Auth links, invite links,
CORS, Turnstile hostnames and Worker secrets moved to the new hosts.

**Font (user direction).** Plus Jakarta Sans, self-hosted, across landing, portal and survey.

Fix during integration: the analytics filter was re-parsed per row (a 100k-row export took 96 s);
now parsed once.

Verification at deploy (commit `d3869ba`): pgTAP 398/398 on a fresh database, unit 210,
Edge Function 40, both parity checks, survey e2e 24/24, no console errors on any live page.

Known open items at that point: Gmail app password needed for email; XLSX export of ~100k rows
exceeds the free Edge Function CPU limit; 600k-response load test not yet run; privacy-notice
contact details to be supplied in Settings; official logo vector; Kumasi North/Techiman phone
number to be confirmed.

---

## 2026-11-05 (evening) — Review fixes: simpler sidebar, plain language, cleaner pages

User feedback after reviewing the live site, and what was done:

1. **Sidebar too long** → rebuilt centrally in `apps/portal/src/pages/shell.tsx`: two direct
   links (Overview, Feedback form), Reports, and three collapsible sections (Insights, Feedback,
   Administration). Related screens became tabs inside one page, so each appears once:
   Cases + My cases; Flagged feedback + Flagging rules; Alerts + Alert rules + Targets; Reports =
   Download data + Scheduled reports + Report files; Audit log export is a button on Audit log;
   notifications open from the header bell. The section holding the current page opens
   automatically; others remember their open/closed state.
2. **Jargon** → one glossary, `apps/portal/src/lib/terms.ts`, used across the portal:
   CSAT % → *Satisfied customers*, average CSAT → *Average satisfaction*, NPS → *Recommendation
   score*, CES → *Ease of service*, negative rate → *Unhappy customers*, completion rate → *Survey
   completion*, main improvement factor → *Top area to improve*, promoters/passives/detractors →
   *Likely to recommend / Neutral / Unlikely to recommend*, SLA → *Response deadline*, P1–P4 →
   *Urgent / High / Normal / Low*, records → *Responses*, catalogues → *Lists & options*, survey
   versions → *Survey questions*, attribution correction → *Branch correction*. Each measure has a
   one-sentence explanation shown as helper text.
3. **Statistical clutter** (n = …, targets, low-sample badges, denominators) removed from every
   page. Honesty rules kept quietly: "No responses yet" instead of 0, and groups with too few
   responses are left out of rankings and greyed with a tooltip.
4. **Removed entirely:** SMS link guide, QR points (the Feedback form page keeps the main form
   link, its QR code and posters), Approvals. With Approvals gone, role grants take effect
   immediately (migration `202611110001_remove_grant_approvals.sql`); survey publishing and branch
   corrections keep their own confirm step inside their pages.
5. **Filters** → Period, Branch, Channel, Product visible; Region, Customer rating and Area to
   improve under "More filters"; source, QR point, survey version, branch status, recommendation
   group, unconfirmed responses and granularity removed (granularity moved into the trend chart).

6. **Multiple submissions from one device allowed (for now)** → the 24-hour device cooldown is
   switched off, not deleted: migration `202611110002_disable_device_cooldown.sql` lets
   `device_cooldown_hours` be `0` (= off) and sets it to `0`. Verified in the database: the same
   device can submit twice; setting it back to `24` blocks again, so re-enabling later is a single
   settings change (Administration › Settings). The thank-you page still shows after submitting
   (Back/reload never re-opens a filled form) and gains a **"Share more feedback"** button that
   starts a fresh, blank form. The Settings screen explains that 0 turns the cooldown off.

7. **Plain language in text the database writes** → migration
   `202611110003_plain_language_texts.sql` rewrites notification-type names, the seven default
   alert names/descriptions and the case-deadline messages ("Case … is past its response
   deadline" instead of "has breached its SLA").
8. **Sample data on production (D-46, Nii's explicit decision 2026-11-05, overriding Rule 14 for
   the pre-launch review)** → `node scripts/seed-demo.mjs <env>` (production also needs
   `--yes-sample-data-on-production`) clears all earlier feedback activity, then generates about
   four months of realistic activity: ~5,200 responses (~45 a day, branches closed on Sundays,
   online channels open), ~6,600 survey sessions including abandoned ones, flags, ~490 cases at
   every stage routed to the right department's officer, three alerts, notifications, and 12
   sample staff (`@demo.sereneinsurance.test`, random passwords never stored, so they cannot sign
   in). Call-back numbers use the test range 024 000 xxxx. **Before real customers start, run
   `node scripts/seed-demo.mjs production --clear`**: it removes every response, case, alert and
   notification and deactivates the sample staff, leaving configuration and real users.

_(Results of this round are appended below when verified and deployed.)_
