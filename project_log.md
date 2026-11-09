# Serene Insurance platform — project log

The running record of what has been built, decided and changed in Serene Insurance's online
platform: the public website, online buying (quotes, proposal forms, payment, certificates,
claims), the staff portal and the customer-feedback system (originally "Serene Pulse"). Newest work
is at the bottom. Detailed design lives in `docs/` (blueprint, architecture, ADRs, checkpoints,
`docs/sales/`); this log is the chronological story and the place to look first.

**Live site (one address per environment)**

| Environment | Address |
|---|---|
| Production | https://serene.eliteservicesagency3.workers.dev |
| Staging | https://serene-staging.eliteservicesagency3.workers.dev |

On each: `/` public website · `/account` customer app (buy, policies, claims) · `/admin` staff
portal · `/customerfeedback` customer survey.

**Stack.** pnpm workspace, TypeScript (strict). One Cloudflare Worker (Hono) serves the whole site
and the customer API; the public website is static HTML/CSS/vanilla JS from a dependency-free
builder; the customer app and staff portal are React 19 + Vite + TanStack Router/Query + Tailwind;
proposal forms, pricing and documents live in `packages/proposals` (pdf-lib, docx); Supabase
(PostgreSQL 17, Auth, Storage, Edge Functions, pg_cron, pgmq, Vault) in London (eu-west-2); GitHub
Actions for CI and continuous deploys (staging → production). Repository: `ManuelBartimeus/SerenePulse`.

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

**Verified and deployed (commit `aea0c4b`, 2026-11-05):** pgTAP 398/398 on a fresh database;
SQL lint clean; unit tests 213 (portal 71, survey Worker 49, metrics 30, survey engine 18,
contracts 5) plus Edge Functions 40; survey browser tests 26/26 on phone and desktop including
accessibility and the new "Share more feedback" flow; a signed-in tour of 15 portal pages with
realistic data showed no console errors and none of the removed jargon. CI and the automatic
deploy to staging and production passed.

**Sample data loaded on production** (`node scripts/seed-demo.mjs production
--yes-sample-data-on-production`): 4 earlier test responses cleared; 5,179 responses, 6,579
sessions, 3,238 flags, 501 cases, 475 call-back requests, 12 sample staff. Checked on production:
roll-ups cover all 5,179 responses, device cooldown is 0 (repeat submissions allowed), no role
grants are left pending, ~70% satisfied customers over the last 30 days, and every public path
responds (`/customerfeedback/new` → fresh form; old `/q/…` links → the form).

---

## 2026-11-05 (late evening) — Survey wording (survey v2) and accordion sidebar

User feedback and what was done:

1. **Survey form (published as survey version 2)** → migration `202611120001_survey_v2.sql`
   retires v1 and publishes v2 (published versions are never edited, FR-27; earlier responses
   stay linked to v1; the rating scales are unchanged, so trends continue). The definition is
   `packages/survey-engine/src/v2.json`, and a test checks that it matches the migration.
   * Page 5 no longer shows a heading: both "Additional feedback" and "We're sorry we fell
     short. What should we improve?" (low-score version) are gone. The page keeps a hidden
     heading ("Section 5 of 5") for screen readers and keyboard focus.
   * "What is the main thing we could improve? (optional)" → **"What main thing should we
     improve upon?"**, now **required**. Customers who have nothing to raise choose "Nothing,
     I am satisfied". If it is skipped: "Please choose what we should improve. If nothing,
     choose 'Nothing, I am satisfied'." The rule holds in the browser, in the no-JavaScript form
     and in the database.
   * "How likely are you to recommend Serene Insurance to someone you know?" → **"Would you
     recommend Serene to others?"** (still 0–10).
   * "What type of insurance policy did you get?" → **"What type of insurance policy did you
     buy?"** (its error message now says "bought").
   * The portal's survey preview and the "Lists & options" helper text follow the new wording,
     as do the wireframes in `docs/ui/wireframes.md`.
2. **Sidebar sections now work as an accordion** (`apps/portal/src/pages/shell.tsx`). Only one
   section is open at a time. Opening a section, or going to a page in another section, closes
   the one that was open. Going to Overview, Feedback form or Reports closes them all. The
   remembered open/closed state was removed, since the current page now decides.

**Verified:**
* pgTAP 399/399 on a fresh database, including the updated survey-version test; SQL lint clean.
* JS-vs-SQL survey parity test passes against the published v2.
* Unit tests 216 (survey engine 21 with three new v2 checks, survey Worker 49, portal 71,
  metrics 30, contracts 5) plus Edge Functions 40.
* Survey browser tests 26/26 on phone and desktop, including accessibility. They cover: the new
  Page 5 without a heading after a low score, the required improvement question (with and
  without JavaScript), and "Share more feedback".
* A signed-in local check of the sidebar: Insights › Branches, then Feedback › Cases, then
  Administration › Settings, then Overview. Exactly one section was open each time (none on
  Overview), with no console errors.

**Production deploy note.** The first production deploy (commit `fddb16f`) stopped safely at the
v2 migration because production had an open survey draft. That draft was version 2, opened in
the survey editor at 15:05 and never changed (identical to the live survey). Survey versions can
never be deleted, so the migration now takes over an *untouched* draft and publishes it as v2. A
draft with real edits still stops the migration, so nobody's work is overwritten. Both paths
were tested on a local database before redeploying. Staging had no draft and got v2 as a new
row, with the same result.

**Still open:** run `node scripts/seed-demo.mjs production --clear` before go-live; Gmail app
password for email; XLSX exports of ~100k rows exceed the free Edge Function CPU limit; load test
at 600k responses; privacy-notice contact details in Settings; official logo vector;
Kumasi North/Techiman phone number to confirm.

---

## 2026-11-06 — Online sales, full public website, streamlined staff portal, survey fixes

The user asked for nine changes in one round, plus four more during the work:

1. remove anything on the site that reads as AI-generated;
2. study nine competitors and grow the landing page into a full website, fully mobile-responsive;
3. phone-number sign-in (as Phoenix has) so customers can get a quote **and** fill the proposal form
   for any product, with a staged progress bar, digital signature and terms checkbox; the completed
   form must come out like Serene's paper form, viewable and downloadable by staff as PDF or Word;
   a certificate matching the sample, delivered to the customer and kept on both profiles; a
   simulated payment gateway;
4. remodel the admin portal: remove what is redundant, add the client database, proposals,
   certificates and so on;
5. make the feedback form submit fast, with a locking overlay and a loading-to-tick animation;
6. remove "Ease of the process" and "Pricing and charges" from the improvement question;
7. centre the 0–10 numbers on the recommendation page;
8. in proposal forms, show the parts people must read in the flow before they continue;
9. returning feedback visitors choose "Pick up where you left off" or "New feedback form", and
   pick-up lands on the first unanswered page.

Mid-task: research the proposal forms and quotes thoroughly, using Serene's legacy portal
(serene.sibapps.com); provide for identity capture and attachments such as vehicle photos;
re-word the staff sign-in page now that the portal is more than feedback; explain the "Serene CX" name.

### Research (written up in `docs/sales/`)

* **`research-ghana-insurance.md`**:
  * NIC motor third-party tariff effective 16 Feb 2026, by class of use, not engine size: private
    GH₵ 557, taxi/hiring GH₵ 744 … motorcycle GH₵ 331; extra seats GH₵ 15/25;
  * TPPD limit GH₵ 8,000 (the sample certificate's 6,000 is out of date);
  * 20% VAT/NHIL/GETFund on non-motor premiums, motor exempt;
  * travel zones and the Schengen EUR 30,000 minimum;
  * indicative non-motor rates (marked unverified);
  * Act 42 of 1958 still governs motor certificates;
  * Acts 772 (e-signatures) and 843 (data protection);
  * Ghana Card, GhanaPost GPS, plate formats (including the 2026 DVLA zone format), mobile prefixes;
  * legacy-portal product codes and fields.
* **Identity law change found during research:** the National Identity Register (Amendment)
  Regulations 2026, **L.I. 2523, enforced from 2 Nov 2026**, forbid insurers to request or keep
  photos or scans of the Ghana Card; identity must be checked biometrically with NIA. The NIC also
  made the Ghana Card mandatory for motor from 1 Jan 2026. So no form asks for card images. Every
  proposal takes the Ghana Card **number** and a **live face photo**, and staff record the NIA check
  on the customer. Foreign nationals give a passport page. Shared section: `packages/proposals/src/kyc.ts`.
* **Legacy portal** (public pages only): SibaDigital/SIBAGEN white-label by BIC Technologies. Its
  public JavaScript contains hard-coded NIC MID credentials and a payment merchant key, passwords
  are MD5-hashed in the browser, and a renewal lookup appears to return policyholder details by
  registration number without signing in. **Reported to the user for Serene to act on** (rotate
  those credentials). None of it is carried over.
* **`competitor-assessment.md`** (Star, SIC, Glico, Enterprise, Hollard, GUA, Vanguard, Phoenix /
  snap.insure, Sanlam Allianz):
  * **Adopted** (with where each is seen best):
    * phone + one-time-code sign-in;
    * price before personal details;
    * a plain vehicle-class picker mapped to the NIC tariff;
    * cover comparison;
    * certificate on payment;
    * MoMo-first checkout;
    * short-period motor cover;
    * one-tap renewal;
    * online claims with per-type checklists and visible status;
    * full claims guidance;
    * Get a quote · Cover details · Make a claim on every product;
    * a public certificate check with NIC `*920*57#`;
    * downloadable paper forms;
    * a branch finder.
  * **Rejected, with reasons:** a Gallery (only one competitor keeps one current; Phoenix's is
    empty), News (no content source), chatbot personas, pop-ups, counters, testimonials, promo sliders.

### Online sales (new)

* **`packages/proposals`**: the typed definition of every proposal form, shared by the customer
  app, the Worker and the staff portal.
  * Schema, validation (per step and whole form), product catalogue (28 products: motor, travel,
    personal accident and home sold instantly; the rest priced by an underwriter, as the market does).
  * **All 28 paper forms digitised** from `PROPOSAL FORMS (2).zip`, in paper wording and numbering.
    Notices the proposer must read are `read` blocks shown in the flow, with an "I have read this"
    tick where the paper requires it (requirement 8).
  * Pricing (`rating.ts`):
    * the 2026 tariff, extra seats, bus classes;
    * comprehensive 5% and fire & theft 1.25% of value, never below third party;
    * age loadings and referral rules;
    * short-period scale and higher-TPPD pricing;
    * travel by zone, length and age;
    * personal accident by occupation class;
    * home buildings and contents.
    All rates are editable by staff.
  * Claim types and document checklists; certificate content for motor (by class of use) and
    other lines; the HTTP contract.
* **Documents** (`@serene/proposals/render`, rendered in the browser so customer and staff get the
  same bytes):
  * the **completed proposal** as PDF and Word, laid out like the paper form: letterhead, paper
    title, numbered questions with answers on the dotted lines, ticked boxes, ringed YES/NO, the
    paper's tables, the signature over "Proposer's Signature";
  * an electronic-signature record page (verified phone, time, IP, answers SHA-256, confirmations,
    attached documents);
  * the **certificate of insurance** as a copy of the sample: yellow rule and "SERENE INSURANCE"
    down the margin, navy box, numbered items, clauses, facts, certify text, signatory, plus a QR
    code to `/verify`.
  * Wording fixes against the sample, to confirm with Serene: the Act's real name, "STATUTE(S)",
    "carriage of passengers".
  * We never draw a signature: an administrator uploads the signatory's image, and each issued
    certificate keeps the image in force when it was issued.
* **Database** (`202611130001…0006`, schema `sales`):
  * customers (with identity-check status), sign-in codes (HMAC only), sessions (hashed);
  * proposals with answers frozen after submission, events, files;
  * payments, policies (certificate snapshot), claims;
  * staff views and audited staff functions;
  * a new **Underwriter** role and permissions (customers, proposals, policies, products, claims);
  * a private Storage bucket; cron purges.
  * Numbers follow Serene's documents: `USR10001…`, `SE26MTP10001-E`, `C01-26-10001`,
    `PRP-26-000001`, `CLM-26-000001`.
* **Worker API** (`/api/account/*`, `/api/verify`) and the `/account` app:
  * phone + 6-digit code sign-in (30-day session cookie, CSRF header + origin checks, rate limits);
  * every lookup owner-scoped;
  * uploads type-checked by file content;
  * the submit flow re-validates everything on the server;
  * simulated MoMo and card payment;
  * idempotent policy issue;
  * a public certificate check that needs the certificate number **and** the registration or policy
    number, and shows initials only.
* **Customer app** (`apps/account`, React):
  * sign-in;
  * dashboard;
  * product picker for individuals and businesses;
  * the proposal wizard: numbered stepper (mobile: a "Step 3 of 9" bar and steps sheet), autosave
    and resume, a live price panel, camera capture with image compression, a face-photo screen with
    a guide, review, and a sign step (draw / type / upload);
  * payment;
  * policy page with certificate and proposal downloads;
  * renewals;
  * claims with document checklists and a status timeline;
  * profile.
* **Test modes (decision D-47):** no SMS or payment provider account exists yet, so both run in
  clearly labelled test mode.
  * **Sign-in:** the code is shown on screen instead of being texted.
  * **Payments:** no money is taken. Test values: MoMo numbers ending 0000 and card
    4000 0000 0000 0002 are declined.
  * The Arkesel SMS adapter is built and switches on with the `ARKESEL_API_KEY` Worker secret and
    setting `sales_sms_mode = 'arkesel'`. A Hubtel or Paystack gateway is the next integration.
  * **Until SMS is live, a phone number is not proven to belong to the person signing in, so real
    customers must not use the site before then.**

### Public website (rebuilt, requirements 1 and 2)

* 40 pages from a dependency-free static builder (`apps/landing`):
  * home with a working quick quote (motor and travel), the cover comparison, products for people
    and for businesses, how buying works, claims, certificate check, branches and about;
  * `/insurance/` and a page for each of the 28 products: cover, exclusions, who it's for, pricing
    basis, documents needed (from the form definitions), FAQs. The motor page has the full 2026
    tariff table, TPPD, the Brown Card and the short-period scale;
  * `/claims`, `/branches`, `/about`, `/verify`, `/help`, `/downloads` (the 28 paper forms),
    `/contact`, `/privacy`, `/terms`, a 404 page, `sitemap.xml` and structured data.
* **AI tells removed:** eyebrow labels, slogan headlines, icon-tile grids, floating badges, mock UI
  cards, decorative leaf/blob art, filler words and em-dash copy. The site now uses specific facts
  (GH₵ 557, GH₵ 8,000, 13 branches, one-week claim principle), tables and lists, and real photos.
* **Mobile:** tested at 320–1440 px: no horizontal scroll, 16 px text, 44 px targets, a full-height
  menu, zoom never disabled.
* **Correction during review:** the motor copy said injury cover "has no limit". Under the
  Insurance Act 2021 (s.255) a motor policy must have a stated maximum, so it now says claims are
  paid up to the NIC's limits.
* `/privacy` and `/terms` are written plainly and **need Serene's legal review**. The DPC
  registration number is a marked placeholder.
* `packages/proposals/src/landing-sync.test.ts` fails if the site's product, claim or document
  content drifts from the form definitions.

### Staff portal (requirement 4, renamed)

* **"Serene CX" → "Serene Staff Portal".** CX meant *customer experience*: right while the portal
  only handled feedback, but too narrow and too jargon-like now.
  * New sign-in panel: "Customers, proposals, policies and feedback in one place."
  * Decorative art removed.
  * Invite and password-reset email subjects renamed (applied to hosted Auth by
    `scripts/configure-auth.mjs`).
* **New sidebar:**
  * Overview: sales figures plus a satisfaction strip.
  * **Sales:**
    * Customers, with the identity check: Ghana Card number, face photo, "Mark verified" with the
      NIA reference;
    * Proposals: status queue; the form shown like the paper; Download PDF/Word; documents;
      underwriter pricing with automatic taxes; request information; decline; history;
    * Policies & certificates: preview, download, cancel;
    * Claims: status queue, working-day age, "decision overdue" after the one-week principle, actions;
    * Payments.
  * **Customer feedback:** Feedback insights (one page with tabs), Responses (with Download), Cases
    (tabs incl. flagged feedback), Feedback form.
  * **Administration:** Users & roles, Products & rates (sales settings, signature image upload,
    rate tables), Survey questions, Branches & regions, Lists & options, Settings (General, Data
    protection, System status), Audit log.
* **Removed:** Alerts, alert rules and targets; Survey completion; Case performance; Branch
  corrections; the separate Reports area (scheduled reports, report files). Old addresses redirect
  to the nearest page; database objects are untouched.

### Feedback form (requirements 5, 6, 7, 9)

* **Speed:** the delay was the bot check (Turnstile) starting only when Submit was pressed (about
  2 s). It now runs in the background before the last page, so click to request is about 56 ms. A
  `Server-Timing` header shows the two server calls.
* **Lock:** Submit shows a blurred full-screen overlay, makes the form inert and disables every
  input; the spinner draws into a tick ("Feedback received"). On failure everything is restored.
* **Options:** survey **v3** (`202611130010`) retires "Ease of the process" and "Pricing and
  charges"; old responses keep their labels. The sample-data generator is updated too.
* **Centring:** single digits sat about 5 px left of centre (a min-width span with left-aligned
  text). They now use a centring grid, 6 columns under 600 px and 11 above.
* **Resume choice** (`202611130011`): "Welcome back. You started this form on …" with two buttons:
  * **Pick up where you left off** restores the answers and opens the first page with an
    unanswered required question;
  * **Start a new feedback form** closes the old draft on the server.
  It works without JavaScript.

### Verification (local, before deploy)

* pgTAP **653/653** on a fresh database (18 files; 210 new sales tests, 20 survey v3/resume tests).
  Database lint at warning level is clean, and both JS↔SQL parity tests pass against the database
  (survey 26, metrics 31).
* **Unit tests 678:** proposals 311, survey Worker 149, portal 82, customer app 34, metrics 30,
  survey engine 25, contracts 7, Edge Functions 40. Root lint, prettier and typecheck are clean;
  `pnpm build` and the site assembly succeed; the bundle scan is clean (222 files).
* **Browser tests:**
  * survey 40/40 on phone and desktop (overlay, failure, resume with and without JS, start new,
    options gone, centring from 320 px);
  * public site 90/90 (every page at 360 and 1440: overflow, console/CSP errors, headings, text
    size, targets, axe; links; quick quote; menu; verify);
  * customer app 5/5 against the mock, and the **full purchase against the real Worker and
    database on phone and desktop**: sign-in, motor proposal with face photo, DVLA document and
    vehicle photos, live price, sign, MoMo payment, certificate download, policy page, claim.
* Visual checks of the motor certificate against the sample, and of the motor, fire and cyber
  proposal PDFs and Word files.

### Still open after this round

* **Before real customers:**
  * connect an SMS provider (with an NCA-registered sender ID) and a payment gateway;
  * underwriting to confirm the NIC 2026 circular, the TPPD limit, the indicative non-motor rates
    and the commercial-class certificate wording;
  * finance to confirm the VAT Act 2025 treatment;
  * legal review of `/privacy` and `/terms`;
  * supply the DPC registration number and the NIC licence number;
  * upload the signatory's signature image in Products & rates;
  * run `node scripts/seed-demo.mjs production --clear`.
* **Serene:** rotate the credentials exposed by the legacy portal.
* **NIA:** identity checks are recorded manually by staff from the face photo and card number; an
  NIA biometric API needs direct onboarding with NIA.
* **Carried over:**
  * Gmail app password;
  * XLSX export CPU limit at ~100k rows;
  * 600k-response load test;
  * official logo vector;
  * Kumasi North/Techiman phone number.

**Deployed (commit `3c87ffd`, 2026-11-06 10:47 UTC):** CI passed (lint, types, unit, Edge Functions,
build, bundle scan, pgTAP, SQL lint, both parity checks), then the automatic deploy ran migrations
and the Worker on staging and production. Both `/healthz` report version `3c87ffddbe2e`, and `/`,
`/account/`, `/admin/`, `/verify/` and `/customerfeedback` respond. The renamed staff email subjects
were applied to hosted Auth with `node scripts/configure-auth.mjs staging|production`.

---

## 2026-11-06 (afternoon) — New landing page and the nic.gov.gh design standard

User feedback on the deployed site, and what is being done:

1. **"You completely obliterated the landing page… bring back the landing page and make sure it
   looks perfect."** The rebuilt home page had become an information page. The user chose a **new**
   landing page (not a restoration of the old one), built on top of everything added in the
   morning: a split hero carousel with photo and two calls to action, the quick quote, quick
   actions, product cards with photos, how buying works, the cover comparison, the claims promise,
   why Serene, branches and certificate check, and a closing call to action.
2. **Design standard: https://nic.gov.gh/** for the whole site and the customer app, "from their
   font size, font type, to everything UI/UX except the theme colour". NIC's site was measured in
   Chromium at 1440, 1024, 768, 390 and 360 px (computed styles, fonts, spacing, components,
   menus, mobile behaviour). The result, mapped to Serene's colours and with NIC's own flaws
   corrected, is **`docs/site/design-system.md`**. Key points:
   * DM Sans throughout, with a tight heading scale (36 px section titles, 30 px page titles);
   * a 1280 px container, and section padding of 48/64/80 px;
   * a split colour-panel hero;
   * quick-link cards with icon tiles;
   * a 48×6 px accent bar;
   * 6 px buttons and 12 px cards;
   * a sticky 64 px header with dropdowns and a mobile sheet.
   We deviate on purpose where NIC is weak: hero calls to action, 44 px touch targets, no type
   shrink at tablet width, darker muted text for contrast, no one-line truncation on phones,
   visible form labels, consistent card corners, capped prose width.
3. **Typeface:** DM Sans replaces Plus Jakarta Sans across the platform (public site, customer app,
   staff portal, feedback form). It is self-hosted (`packages/ui/assets/fonts/dm-sans-*.woff2`,
   OFL), because the site's CSP allows fonts only from its own origin. Both the latin and
   latin-ext subsets are served, because the cedi sign (₵, U+20B5) is in latin-ext.
4. **Stock photography** for every product line: 16 photos from Pexels (Pexels License: free
   commercial use, no attribution required), people-centred and West African where available.
   * Logos, number plates and signs were softened.
   * Each photo is served as WebP at 640/1024/1600 px (plus 2400 px and a 4:5 mobile crop for the
     hero, and 480 px squares), 3.9 MB in all, with metadata stripped.
   * Credits and honest alt text are in `apps/landing/src/assets/stock/CREDITS.md` and
     `manifest.json`. Only the photos actually taken in Ghana are described as Ghanaian.
5. **Mobile, again the first priority:** every page of the public site and every screen of the
   customer app is tested at 320×568, 360×740, 375×667, 390×844, 393×873, 412×915, 430×932,
   768×1024, 820×1180, 1024×768, 1280, 1440 and landscape 844×390. The checks cover:
   * no horizontal scroll;
   * no clipped text;
   * 44 px tap targets;
   * 16 px inputs;
   * the on-screen keyboard not hiding the focused field;
   * safe-area insets;
   * the signature canvas and OTP boxes at 320 px;
   * ₵ rendering in DM Sans.

Also fixed: the scheduled **`health` workflow** had been failing every run since the move to one
site address (2026-11-05), because it still checked the four retired Workers. It now checks the
live site: `/healthz`, `/`, `/account/`, `/admin/`, `/customerfeedback` on production and `/healthz`
on staging.

### What was built (afternoon)

* **Public website** (`apps/landing`, all 40 pages restyled):
  * **New home page**, in order:
    1. split hero carousel: blue panel with yellow accent bar, white heading and two calls to action,
       beside a full-bleed photo. Three slides (motor; home & business; claims & verify), swipeable,
       keyboard-accessible, 44 px controls, no autoplay;
    2. the quick quote band;
    3. quick links: buy motor, renew, claim, check a certificate;
    4. photo product cards "For you" and "For your business";
    5. how buying online works;
    6. the motor cover comparison;
    7. claims promise;
    8. why Serene: icon row plus a navy band with yellow figures;
    9. branches and the certificate check;
    10. a closing navy call-to-action band.
  * **Inner pages:** title bands with breadcrumbs (a "‹ Parent" back link on phones), product
    photos, an "On this page" sidebar, tables that stack under 640 px, accordion FAQs.
  * **Header and footer:** a sticky 64 px header with dropdowns and a phone menu sheet (44 px rows,
    usable in landscape); a footer with WhatsApp and claims-line cards.
  * Photo credits at `/about/#credits`.
* **DM Sans has no cedi sign.** Every "GH₵" was silently drawn in a system font. A 1.8 KB companion
  face containing only ₵ was generated from DM Sans's own "C" with the same weight axis
  (`apps/landing/scripts/make-cedi-font.py`, permitted by the OFL). It is shared as
  `packages/ui/assets/fonts/dm-sans-cedi-wght.woff2` and declared with `unicode-range: U+20B5` on the
  site, the customer app, the staff portal and the survey. Tests read the font Chrome actually used
  to draw prices. "GH₵" is joined to the amount with a no-break space. Vite builds no longer inline
  `.woff2` files as `data:` URIs, which the CSP would block. Plus Jakarta Sans is removed everywhere.
* **Customer app** (`apps/account`):
  * NIC type scale, header and footer matching the public site; a phone menu drawer with 48 px rows;
    title bands with breadcrumbs;
  * dashboard quick links (Buy, Renew, Claim, Verify);
  * NIC numbered steps for the wizard: a sticky list on desktop, "Step n of N" with a progress bar
    and steps sheet on phones;
  * a sticky action bar that measures itself so it never covers a field; focused fields scroll
    clear of the keyboard;
  * a signature canvas that redraws crisply on rotation;
  * OTP boxes that fit at 320 px;
  * tables that become cards under 640 px; 44 px targets; hover styles only on devices that hover.
  * Input borders use `#8e8e95` (3.2:1) instead of NIC's `#e2e2e4`, which fails the WCAG 3:1 rule for
    input boundaries.
* **Staff portal and survey:** DM Sans only, no other visual change.

### Verification (afternoon, on the combined code)

* Lint, prettier and typecheck are clean. Unit tests pass: proposals 311, survey Worker 149,
  portal 82, customer app 34, metrics 30, survey engine 25, contracts 7, Edge Functions 40.
  `pnpm build`, the site assembly and the bundle scan (221 files) pass. No fonts are inlined.
* Public site browser tests **185/185**: every page at 320, 390, 768 and 1440 with full checks
  (overflow with the clip lifted, clipped text, tap targets and spacing, 16 px text and inputs,
  headings, images, anchors under the sticky header, console/CSP errors, axe); overflow at 360,
  375, 393, 412, 430, 820, 1024, 1280 and landscape 844×390; ₵ in DM Sans; touch-swipe carousel;
  menu in portrait and landscape; quick quote; verify; no-JavaScript.
* Customer app browser tests: all flows on phone-320, phone-360, phone-390, tablet-768 and
  desktop-1440. The all-screens-at-all-13-viewports pass takes about 6 minutes, so it now has its
  own 15-minute limit; it timed out once under load and then passed on its own. The purchase test
  ran against the real Worker at 320, 360, 390, 768 and 1440 (5/5).
* Survey browser tests 40/40 with the new font.
* Screens reviewed by eye: the landing page at desktop and at every phone width, the public pages
  at 360 and 1440, and the customer app's sign-in, wizard, documents, sign and success screens.

**Deployed (commit `f269b67`, 2026-11-06):** CI passed, then the automatic deploy ran on staging and
production. Both `/healthz` report version `f269b6791f15`. Every area returns 200 (`/`, product
pages, `/claims/`, `/verify/`, `/about/`, `/downloads/`, `/account/`, `/admin/`,
`/customerfeedback`), and the cedi font is served from `/fonts/`. A real-browser check of live
production at 390 px and 1440 px found:

* no horizontal overflow and no broken images;
* DM Sans loaded, with the 4:5 hero crop on phones and the 16:9 crop on desktop;
* no CSP errors. The only console entry is the customer app's expected 401 from `/api/account/me`
  when signed out, which sends the visitor to sign-in;
* live pricing correct (taxi third party GH₵ 744).

---

## 2026-11-09 — Staff portal: one-click sign-in, general sign-in wording, sidebar gear icon

User feedback and what was done:

1. **"I have to click Sign in twice."** Root cause, in `apps/portal/src/lib/session.tsx` and
   `pages/auth.tsx`:
   * After the sign-in function answered, `signIn` stored the session in Supabase and returned, and
     the page navigated at once.
   * React learned of the session only through Supabase's `onAuthStateChange` listener, which runs
     *after* that promise resolves. So the signed-in area rendered as signed out and sent the user
     back to sign-in.
   * By the second click the session was in place, so it worked.
   * **Fix:** `signIn` now puts the returned session into React state itself, and the sign-in page
     navigates only once the session is visible (an effect on `session`). It also sends an
     already-signed-in visitor straight on, and stays "Signing in…" until the move happens.
2. **A second bug found while testing:** opening a deep link while signed out (e.g.
   `/admin/customers`) redirected to `/sign-in?next=/sign-in`, so the requested page was lost.
   * While redirecting, the router already reports `/sign-in` and the auth gate renders once more.
   * **Fix:** the gate keeps the page asked for from its first render (`router.tsx`).
   * A new `safeNext()` accepts only same-site paths and never the sign-in page itself. `//host`
     and absolute URLs are rejected.
3. **Sign-in panel wording made general** (`ui/auth-card.tsx`): "Everything you need to serve our
   customers." / "The Serene Insurance workspace for staff across every branch."
4. **Administration gear icon looked oversized** (user, mid-task). The old gear path reached the
   edges of the 24-unit icon box (about 1.3 to 22.7), while every other sidebar icon sits within
   about 3 to 21, and its curves were slightly irregular. It is replaced by a calculated
   symmetric 8-tooth gear inside 3.5 to 20.5, with the same 1.75 px stroke (`ui/icons.tsx`).

**Tests added**

* `apps/portal/src/pages/auth.test.ts` (unit): `safeNext` and the password rules.
* **First browser tests for the staff portal:** `apps/portal/e2e/sign-in.e2e.ts`, run with
  `pnpm --filter @serene/portal e2e` against the local stack and the real `auth-sign-in` function
  (needs `PORTAL_E2E_EMAIL` / `PORTAL_E2E_PASSWORD`; see the config header). They cover:
  * one click opens the portal, with exactly one sign-in request and no bounce back;
  * a deep link returns to the requested page;
  * a wrong password shows an error and re-enables the button;
  * every sidebar icon draws inside the 2.5 to 21.5 frame;
  * the new wording.
* **Proved against the old code:** with the fixes set aside, the deep-link test failed with
  `next=/sign-in`, and the icon test failed on the old gear (reaching 22.5). With the fixes, all pass
  on phone and desktop (9 passed; the icon check runs on desktop only, where the sidebar is visible).
* Portal: lint, typecheck and build clean; unit tests 85 (up from 82).
* Not in CI yet: CI's local Supabase runs without the Edge runtime, so the portal browser tests run
  locally.

**Deployed (commit `8f3b07c`, 2026-11-09):** CI passed.

* The first staging deploy stopped at the Edge Functions step: the CLI's Docker bundler crashed
  (`failed to bundle function: exit 135`) on the unchanged `export` function, just after pulling a
  newer Edge runtime image. Production was skipped and kept running `f269b67`.
* The failed job was re-run unchanged and staging, then production, deployed successfully.
* If the crash recurs, switch the deploy to server-side bundling
  (`supabase functions deploy --use-api`), which does not use Docker on the runner.

Both `/healthz` report `8f3b07cf863a`. Checks on the live portal bundles: the new wording is
present and the old wording is gone; the new gear path ships in the sidebar chunk and the old gear
path is in none of the 23 chunks. `/admin/sign-in` returns 200.

---

## 2026-11-09 (afternoon) — Staff portal: images, proposal documents, zip download, "All" proposals

User feedback, in the user's order, and what was done:

1. **"The face photo and ID document photo don't show on the customer page… several pages where
   images are supposed to show don't have images showing."** Reproduced by running the built site
   through the site Worker locally, so the production headers applied. Every private image was blocked
   by the staff portal's Content-Security-Policy.
   * **Root cause:** private files (customer face photos, passport pages, proposal and claim
     documents, proposal signatures, the certificate signature preview in Products & rates) are shown
     through short-lived signed Storage links on the Supabase origin
     (`https://<project>.supabase.co`). The portal CSP was `img-src 'self' data: blob:`, so the
     browser refused all of them. It had been like this since online sales went live (2026-11-06).
     Nobody saw it in testing because the Vite dev server sends no CSP.
   * **Fix** (`apps/survey-worker/src/headers.ts`): `img-src` now also allows this project's own
     Supabase origin. That is one exact origin taken from `SUPABASE_URL`, never a wildcard.
   * **Found with it:** the certificate preview on a policy page (PDF drawn in the page and shown in
     an `<object>` from a `blob:` link) was blocked as well, because `object-src` fell back to
     `default-src 'self'`. It now has `object-src 'self' blob:`.
   * **Related hardening:**
     * Signed links last 5 minutes and were never renewed, so images on a page left open would
       break. They now refresh every 4 minutes (`files.ts`, `useSignedUrl`).
     * The per-file "Download" buttons used `<a download>` on a cross-origin link. Browsers ignore
       that, so a click opened the image in place of the portal. They now ask Storage to send the
       file as an attachment (`?download=<name>`).
2. **Proposals page shows "All" by default** instead of "Awaiting review". "All" is now the first
   tab (`format.ts`: `DEFAULT_PROPOSAL_TAB`). The Overview's "awaiting review" shortcut still opens
   that tab directly (`?tab=review`).
3. **"The PDF download is not working for the proposal."** This could not be reproduced locally on
   the same code and real-shaped data: staff PDF and Word, and the customer's own "My proposal form",
   all produced valid files through the production CSP. On production, every portal script chunk and
   the logo serve correctly. Production data was not read (staging has no proposals). What was done:
   * **Renderer checked against bad data:** the existing tests already render all 28 forms. A
     throw-away fuzz run also gave every answer of every form odd values (empty, null, wrong types,
     very long text, emoji, malformed dates). Result: see *Verification*.
   * **Downloads that browsers silently drop:** the file is built after the click (the renderer and
     signature load first). Some browsers, notably Safari on iPhone/iPad and some download-protection
     settings, ignore a download started after the click's moment has passed. The proposal PDF/Word
     (and the new zip) are now offered twice: started automatically, and as a **"Your file is ready…
     save …" link** that is a real click, which every browser honours (`useBuiltFile`,
     `BuiltFileNote` in `ui.tsx`). Failures show the error on the page and are logged to the console
     with the proposal number.
   * Customer app: the proposal PDF was sometimes named after the *policy* number
     (`Serene-proposal-SE26MCO10016-E.pdf`). It now always uses the proposal number from the server.
   * **If it still fails for the user, we need the browser and the message shown on the page** (or a
     screenshot) to go further.
4. **Identity check, vehicle documents and photos of the vehicle removed from the proposal form**,
   on the staff screen and in the downloaded PDF and Word. This also covers the customer's own
   download, which uses the same document model.
   * **Rule** (`printedFields()` in `packages/proposals/src/validate.ts`, used by
     `render/model.ts` and the portal's `form-view.tsx`): upload fields are not printed, and a
     section made only of uploads disappears.
   * A survey of all 28 forms showed the same kind of sections elsewhere: travel's Passports and
     Trip documents, home's "Your home", the property, premises, accounts, staff-list, shipping,
     vessel and project documents of the business forms, and the single upload lines inside
     data sections (e.g. motor's NCD renewal notice). They are treated the same way, so the forms
     stay consistent.
   * Kept: answers such as a company signatory's Ghana Card number, and paper notices such as
     Bonds' "other things to be provided". The **electronic signature record page still lists every
     attached file** (name, size, upload time), so the signed record stays complete.
5. **"Download all documents" on a proposal's Documents tab**: one zip of every attachment
   (`apps/portal/src/features/sales/attachments.ts`).
   * Files are fetched with the staff member's own session (Storage access rules apply; nothing is
     made public), four at a time, with progress on the button ("Preparing 3 of 8…").
   * Names are numbered in upload order and labelled with the form's question, e.g.
     `01 A photo of your face - face.png` (unique, safe on Windows and macOS). The zip is called
     `PRP-26-000027 documents.zip`.
   * Every file is checked against the SHA-256 recorded when the customer uploaded it. A
     `Contents.txt` lists each file, its type, size, upload time and whether its fingerprint matched.
     A mismatch (which should never happen) is flagged on screen and in the list.
   * Files are stored as they are (no recompression), so each one comes out byte-identical.
   * If any file can't be read, nothing is saved and the error says which file. Staff never get a
     silently incomplete set.
   * Library: `fflate` 0.8.3, already in the lockfile, pinned exactly, loaded only when the button
     is used.
   * Document tiles now show the form's question too ("A photo of your face · face.png" instead of
     "Id selfie · face.png").
6. **"Images are not showing on the document section of the proposal page."** Same root cause and
   fix as item 1.

### Tests added

* Worker: `headers.test.ts` checks the portal CSP for a production-style origin, a missing or
  invalid URL, no wildcard, and `object-src`. The portal-shell test in `index.test.ts` now asserts
  `img-src` and `object-src`.
* Proposals package: the motor document has no upload blocks or upload-only headings (model and
  Word XML) and keeps the files in the signature record. A per-form check runs on all 28 forms.
* Portal unit: `attachments.test.ts` (names, uniqueness, unsafe characters, contents list, a real
  zip round trip with byte and SHA-256 checks, all-or-nothing failure, empty set). The tab tests
  now expect "All" as the default.
* **Portal browser tests through the Worker** (`apps/portal/e2e/sales.e2e.ts`, run with
  `PORTAL_E2E_BASE_URL`; see `playwright.config.ts`), on phone and desktop:
  * Proposals opens on "All";
  * the customer page's face photo loads;
  * the proposal form has no upload sections and its signature image loads;
  * Download PDF gives a complete PDF and shows the save link;
  * every Documents thumbnail and the lightbox load;
  * each download link asks for an attachment;
  * the zip holds every file plus `Contents.txt` with all fingerprints matching;
  * the certificate preview shows;
  * no CSP violations anywhere.
* **Proved against the old code:** with the old CSP put back, the customer-photo, proposal and
  certificate tests failed (3 of 4; the "All" test does not depend on the CSP). With the fix, all
  8 pass.

### Verification (local, before deploy)

* Lint, prettier and typecheck clean across the workspace.
* Unit tests: proposals 340 (up from 311: the 28 per-form checks and the motor upload test), survey Worker 152 (up from
  149), portal 93 (up from 85), customer app 34, metrics 30, survey engine 25, contracts 7.
* `pnpm build` and the site assembly succeed; the bundle scan is clean (224 files). `fflate` ships as
  its own 8.8 KB chunk, loaded only when "Download all documents" is used.
* Portal browser tests through the Worker: 17 passed on phone and desktop (8 new sales tests and the
  existing sign-in tests); 1 skipped by design (the sidebar-icon check runs on desktop only).
* By eye: the proposal form now goes from question 7 straight to the Declaration, with the
  signature image showing; the Documents tab shows all 8 thumbnails and the new button; the
  downloaded PDF no longer contains the three sections, and its signature record still lists the
  files.
* A local-only staff account (`e2e-staff@serene.local.test`, System Administrator + Underwriter)
  was created in the **local** database for these browser tests. It does not exist on staging or
  production.
