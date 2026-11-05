# MASTER SOFTWARE PROJECT BUILD PROMPT (FUSED / CONTINUATION EDITION)

## Populated for: Serene Insurance Customer Feedback System

| | |
|---|---|
| **Document status** | **v1.0, implementation-ready.** Every open question from v0.9 has been decided by Nii (see DECISIONS REGISTER). |
| **Populated on** | 2026-11-04 (v0.9 draft); decisions applied 2026-11-04 (v1.0) |
| **Source documents** | (1) `insurance_customer_feedback_system_requirements.md` v1.0 (business & functional requirements, cited as **[REQ §n]**). (2) `designmd-RocketMoney.md` (structural visual reference, cited as **[DS §n]**). (3) Company context and decisions supplied by Nii on 2026-11-04 (branch and product lists, logo, brand colours, answers to Q-01…Q-32), cited as **[D-nn]** or **[PERSON]**. (4) The original template text of this prompt. |
| **Brand asset** | `assets/serene-logo.png` (222 × 108 px PNG, transparent background), stored beside this file in `/mnt/project-files/serene-feedback-spec/assets/` |
| **Intended reader** | The engineering agent/team that will design, build, test and deploy the system. The maintainer after launch is Nii [D-28]. |

This version fuses the original Master Software Project Build Prompt with a
**continuation-and-completion operating layer**: use this when a project
*already has an implementation plan* (or partially existing codebase) and the
task is to drive it to a finished, production-grade, high-performance,
deployed website — auditing the existing work for gaps, patching them to
tier-one/grade-A standard, and never silently degrading quality with cheap
fallbacks.

Every new or amended section introduced by the fusion is marked
**[FUSED]** so you can see exactly what was added on top of the original
template.

---

## HOW TO READ THIS POPULATED SPECIFICATION

Every statement in this document carries a provenance tag. The build agent
must respect the tag when deciding how much latitude it has.

| Tag | Meaning | Build-agent latitude |
|---|---|---|
| **[REQ §n]** | Stated in the business requirements document, section *n*. | Implement exactly, **unless a [D-nn] decision overrides it** (overrides are listed in REQUIREMENT OVERRIDES). |
| **[D-nn]** | **Decision by the person (Nii).** Highest authority after this document's own text. | None. Changing it requires the person's approval. |
| **[DS §n]** | Taken from the design-reference audit. | Follow for structure and feel; Serene brand values (BRAND CONFIGURATION) override colours, type and identity. |
| **[A-nn]** | **Inferred assumption**, made by applying established production-grade practice where the intended behaviour can be reasonably determined. Listed in the ASSUMPTIONS REGISTER. | Implement as written. If later evidence contradicts it, raise it; do not silently change it. |

Untagged prose is template operating guidance (how to work), not product
requirements. There are **no open `Q-` items** in v1.0. Any new ambiguity
discovered during the build is raised as a new question, numbered from Q-35.

---

## PROJECT CONFIGURATION

Fill in the following section before using this prompt. If an implementation
plan or existing repository already answers a field, populate it from that
source rather than leaving it blank — the plan/codebase is authoritative
(see SOURCE-OF-TRUTH RULE).

```text
PROJECT_NAME: Serene Insurance Customer Feedback System
  Company name in all customer-facing copy: "Serene Insurance" (legal name
  "Serene Insurance LTD" used in the privacy notice, report footers and
  legal text) [D-01]. Internal codename for the repository and packages:
  "serene-pulse" [A-01].

PROJECT_TYPE: Two-sided web platform:
  (a) a public, open-link, mobile-first micro-survey (no login, no
      per-customer invitation) [D-33], and
  (b) an authenticated internal analytics, case-management and
      configuration portal.

PROJECT_DESCRIPTION:
  A lightweight customer-feedback system for Serene Insurance LTD, a
  Ghanaian general insurer. Customers reach ONE public survey link, either
  in an SMS that Serene sends through its existing SMS provider (sender ID
  "SERENE"), or by scanning a static QR poster displayed at branches and
  other locations [D-07, D-08, D-09, D-33]. The system does not create,
  send or track invitations. Each visit starts an anonymous survey
  session. The five-page survey takes under 60 seconds (median target
  ≤ 40 s) [REQ §1.2]. Page 1 captures the service channel, the issuing
  branch (walk-in customers only) and the insurance product [REQ §2.4,
  D-12]. Pages 2–4 capture CSAT (1–5), ease/CES (1–5) and NPS (0–10) with
  tap-to-advance. Page 5 captures an optional improvement factor, an
  optional comment and an optional "You may contact me" consent [D-15].
  Behind the survey sits an administrative portal. It gives executives,
  branch managers, customer-experience staff, resolution officers, system
  administrators and auditors role-scoped analytics (organisation, region,
  branch, channel, product, source, trend), feedback records, flagging and
  case management with SLA tracking, targets and email alerts, scheduled
  PDF and Excel reports, exports, configuration and audit logs
  [REQ §6–§14].

BUSINESS_CONTEXT:
  Serene Insurance LTD [D-01] is a Ghanaian general (non-life) insurer with
  13 branches. It operates only in Ghana [D-03], and it is already
  registered with Ghana's Data Protection Commission under the Data
  Protection Act, 2012 (Act 843) [D-03]. Hosting outside Ghana is
  permitted [D-03]. The National Insurance Commission (NIC) is the sector
  regulator. Products: motor, fire and allied perils, marine, foreign
  travel, general accident, engineering, employers' workmen's compensation
  and bonds [PERSON]. There is no life or health business, so those REQ
  suggested options are dropped [A-90]. Policies are obtained through the
  mobile app, the website, branch walk-in, the call centre, WhatsApp and
  agents/brokers [REQ §2.4, D-14]. Management lacks reliable, comparable
  customer-experience data at branch, channel and product level, and lacks
  a structured way to act on negative feedback.
  Locale facts: phone numbers +233 (E.164); time zone Africa/Accra (GMT,
  UTC+0, no daylight saving); dates DD/MM/YYYY; English only [D-04].

COMPANY CONTEXT SUPPLIED BY THE PERSON (authoritative seed data):
  Branches (13). Display names in title case; codes are stable identifiers
  [REQ §14.1, A-92]:
    ACC-EAST  Accra East
    ACC-MAIN  Accra Main (Head Office)
    ACC-WEST  Accra West
    LAPAZ     Lapaz                     (spelling confirmed [D-14])
    TEMA-C11  Tema Community 11
    TEMA-C25  Tema Community 25
    TAMALE    Tamale
    HO        Ho
    KSI-MAIN  Kumasi Main
    KSI-NORTH Kumasi North (Suame)
    KASOA     Kasoa
    TAKORADI  Takoradi
    TECHIMAN  Techiman
  Regions: Serene uses no operating zones of its own [D-14], so regions are
  Ghana's administrative regions:
    Greater Accra: Accra East, Accra Main, Accra West, Lapaz,
                   Tema Community 11, Tema Community 25
    Ashanti:       Kumasi Main, Kumasi North (Suame)
    Central:       Kasoa
    Western:       Takoradi
    Volta:         Ho
    Northern:      Tamale
    Bono East:     Techiman
  Insurance products (8 + Other). Internal (official) name → customer
  label (labels approved [D-14]):
    MOTOR        Motor Insurance                    → "Motor insurance"
    FIRE         Fire and Allied Perils             → "Fire & property insurance"
    MARINE       Marine Insurance Policy            → "Marine insurance"
    TRAVEL       Foreign Travel Insurance Policy    → "Travel insurance"
    GEN-ACC      General Accident                   → "General accident insurance"
    ENGINEERING  Engineering Policies               → "Engineering insurance"
    WORKMEN      Employers' Workmen's Compensation  → "Workmen's compensation"
    BONDS        Bonds                              → "Bonds (e.g. bid or performance bond)"
    OTHER        (system)                           → "Other"
  Service channels and improvement factors: exactly as REQ §2.4 and §2.8
  [D-14].

TARGET_USERS:
  1. Serene customers who have just completed a transaction (public,
     anonymous, no account).
  2. Executive management.
  3. Branch managers (no regional-manager role [D-22]).
  4. Customer-experience (CX) team.
  5. Feedback resolution officers.
  6. System administrators (initially Nii).
  7. Internal/external auditors.

PRIMARY_USER:
  Survey: the customer on a mobile phone, often on a slow or metered
  connection [REQ §2.1].
  Portal: the Executive Administrator [REQ §6, §9.1]. The CX Administrator
  is the heaviest daily operator, because all cases land in the central CX
  queue [D-17, A-02].

USER_ROLES:
  Public:   Survey Respondent (anonymous survey session, no account)
  Internal: Executive Administrator, Branch Manager, Customer Experience
            Administrator, Feedback Resolution Officer, System Administrator,
            Read-only Auditor [REQ §9]
  No Regional Manager role [D-22]. No invitation-operator or integration
  roles exist, because the system handles no invitations [D-33].
  A user may hold several role grants; permissions are the union, scoped by
  branch assignment [A-04]. The first user (System Administrator +
  Executive Administrator) is seeded from environment variables (see
  AUTHENTICATION) [D-23].

CORE_OBJECTIVE:
  Customers share their experience in under a minute. The company gets
  trustworthy, structured, statistically honest customer-experience
  intelligence across branches, channels and products, and a closed loop
  that turns negative feedback into tracked corrective action [REQ §20].

TARGET_SCALE:
  13 branches in 7 regions; designed to grow to 50 branches without schema
  or UI change. Volume envelope accepted as proposed [D-05]: up to 10,000
  survey submissions/month (≈ 30,000 survey visits), peak 20 submits/second
  (poster or SMS-blast bursts), up to 100 portal users (25 concurrent), 5+
  years of analytical data (≈ 600k responses). Single tenant [A-05].
  The scale is modest, which is a reason to keep the architecture simple.
  It is not a reason to relax performance targets.

PRIMARY_DEVICES:
  Survey: mobile-first; must work on low-end Android over 3G; also tablet
  and desktop [REQ §2.1, §12].
  Portal: desktop-first responsive; every screen usable on tablet and
  phone [REQ §10, A-06].

DESIGN_SYSTEM_FILE:
  designmd-RocketMoney.md (/mnt/project-files/rocket-money-audit/design.md),
  used as a STRUCTURAL reference only (spacing, radii, type proportions,
  elevation, motion, interaction patterns). Serene's identity replaces
  Rocket Money's: logo assets/serene-logo.png, primary blue #1108BF,
  accent yellow #FBDE04, white [D-25]. The reference's gaps (inputs,
  validation, auth screens, tables, charts, toasts, modals, status colours,
  app shell) are filled by DESIGN SYSTEM EXTENSIONS [A-40…A-49].

EXISTING_IMPLEMENTATION_PLAN: [FUSED]
  NONE — must be authored as Phase 0 before implementation resumes [D-32].

EXISTING_CODEBASE_STATE: [FUSED]
  Greenfield: no code, designs, hosting or prior plan [D-32].

FRONTEND_STACK:  [D-27, D-28, A-115]
  TypeScript 5.x throughout.
  Survey: a Cloudflare Worker using Hono, serving server-rendered HTML with
  inlined critical CSS and one small vanilla-TypeScript/Preact island
  bundle (≤ 35 KB gz). No client router, no framework runtime beyond Preact.
  Admin portal: React 19 single-page app built with Vite, deployed as static
  assets on Cloudflare (Workers static assets / Pages). TanStack Router,
  TanStack Query, TanStack Table, Radix UI primitives, Tailwind CSS mapped
  to design tokens, Apache ECharts (lazy-loaded per chart type),
  react-hook-form + Zod, supabase-js.

BACKEND_STACK:  [D-27, A-115]
  Supabase (managed PostgreSQL 15+, Auth, Storage, Edge Functions, pg_cron,
  pg_net, Supabase Queues/pgmq) plus Cloudflare Workers (Hono) for the
  public survey API.
  - Business rules that must be atomic live in PostgreSQL functions (RPC)
    with RLS; read APIs for the portal use Supabase's Data API (PostgREST)
    under the signed-in user's JWT, so RLS is the enforcement layer.
  - The survey Worker holds the Supabase service-role key as a Worker
    secret, never in the browser, and calls SECURITY DEFINER RPCs
    (`survey_start_session`, `survey_save_draft`, `survey_submit`) that
    validate everything server-side.
  - Supabase Edge Functions (Deno, TypeScript) handle email sending,
    scheduled report generation (PDF + XLSX), large exports and anything
    that needs more CPU than a free Worker allows.
  - Zod schemas and metric code are shared from `packages/` so client,
    Worker and Edge Functions agree.

DATABASE:
  Supabase PostgreSQL [D-27]. Region: eu-west-2 (London), the closest
  Supabase region to Accra, and on GMT [A-116; hosting outside Ghana
  permitted, D-03]. Row-Level Security on every table exposed through the
  Data API [REQ §9.3].

CACHE:
  No Redis [A-117]. Caching uses: Cloudflare edge cache for static assets
  and the survey's catalogue payload (versioned URL), HTTP caching headers,
  TanStack Query client cache in the portal, and PostgreSQL roll-up tables
  that make dashboard queries cheap enough not to need an application cache.

BACKGROUND_PROCESSING:
  [A-118] pg_cron (SQL jobs: roll-up refresh, SLA timers, alert evaluation,
  retention purges, session cleanup); Supabase Queues (pgmq) as the
  transactional outbox; pg_cron + pg_net to invoke Edge Functions for email
  sending and scheduled reports; one Cloudflare Cron Trigger for a daily
  keep-alive and backup verification ping.

API_ARCHITECTURE:
  [A-11, A-115] Three surfaces:
  1. Public Survey API: Hono on Cloudflare Workers, versioned under
     /api/v1/survey, JSON, problem+json errors.
  2. Portal data API: Supabase Data API (PostgREST) + named RPC functions,
     all under RLS, consumed through a typed client generated from the
     schema (supabase gen types).
  3. Edge Functions for exports, reports and email.
  An OpenAPI 3.1 document covers the Public Survey API and the RPC/Edge
  Function contracts. There is no integration API or provider webhooks,
  because the system handles no invitations [D-09, D-33].

AUTHENTICATION:
  Survey: none for the customer [REQ §2.9]. An anonymous survey session is
  created on first load and held in an httpOnly, Secure `__Host-svs` cookie
  (random 128-bit id, stored hashed) [A-12].
  Portal: Supabase Auth, email + password only, no two-factor
  authentication for now [D-23]. Self-sign-up disabled; users are invited
  by a System Administrator. Roles and branch scopes are added to the JWT
  through a custom access-token hook. The design is MFA-ready: Supabase
  TOTP can be switched on later without schema change [A-119].
  Seed administrator: email from SEED_ADMIN_EMAIL (initial value
  manuelbartimeus@gmail.com [D-23]); password from SEED_ADMIN_PASSWORD,
  set only as a secret in the deployment environment. The password is
  never written to the repository, this document, logs or seed files, and
  a password change is forced at first sign-in [A-120].

STORAGE:
  Supabase Storage, private bucket, for generated report and export files;
  signed URLs (15 min). No customer uploads [A-13].

PAYMENT_PROVIDERS:
  None [A-14].

HOSTING_TARGET:
  Cloudflare free plan (DNS, CDN, WAF managed rules, Turnstile, Workers,
  static assets, Cron Triggers, R2 for backups) + Supabase free plan
  [D-27]. Free-tier constraints and their mitigations are mandatory reading
  (see FREE-TIER CONSTRAINTS in TECHNOLOGY STACK).

CONTAINERIZATION:
  Not used in production (serverless platforms) [A-121]. Local development
  uses the Supabase CLI (which runs a local Docker stack) and Wrangler
  (`wrangler dev`) for Workers.

CI_CD:
  GitHub Actions [A-16]: lint, type-check, unit tests, database tests
  (pgTAP against a local Supabase), e2e (Playwright), accessibility (axe),
  bundle-size budget and Lighthouse CI for the survey, dependency and
  secret scanning, migration dry-run, deploy to staging on merge to main,
  manual approval to production (wrangler deploy + supabase db push),
  nightly encrypted database backup to Cloudflare R2.

MONITORING:
  [A-17, A-122] Sentry free tier (survey Worker, portal, Edge Functions);
  Cloudflare Web Analytics (cookie-less real-user Web Vitals on the survey);
  Cloudflare Workers logs/analytics; Supabase logs and usage dashboard; a
  free uptime monitor (e.g. UptimeRobot or Better Stack) on the survey,
  portal and a /healthz endpoint; usage alerts at 80% of every free-tier
  quota.

SECURITY_REQUIREMENTS:
  Admin pages require authentication; RBAC enforced on the backend and in
  the database; encryption in transit (TLS 1.2+, HSTS) and at rest; data
  minimisation; PII restricted by role; audit of administrative and case
  actions; protection of submitted feedback from modification
  [REQ §9.3, §10, §10.1]. Plus: OWASP ASVS Level 2 as the verification
  baseline, with the documented exception that MFA is off by decision
  [D-23, A-18]; Cloudflare Turnstile and rate limiting on the open survey
  [A-123]; field-level encryption of consented contact details [A-19].

EXTERNAL_SERVICES:
  - Cloudflare (free): DNS for Serene's domain, Workers, static assets,
    Turnstile, R2, WAF.
  - Supabase (free): database, auth, storage, edge functions, cron.
  - Transactional email: Resend free tier (3,000/month, 100/day) for staff
    emails, and as Supabase Auth's SMTP sender [A-124]. Domain verified with
    SPF/DKIM/DMARC.
  - Serene's existing SMS provider (sender ID "SERENE") is used by Serene
    itself, outside this system, to send the public link [D-08, D-09]. The
    system has no integration with it.
  - No WhatsApp integration [D-08]. No customer email [D-08].
  - Future integrations (not built) per REQ §16.

SPECIAL_BUSINESS_RULES:
  See SPECIAL BUSINESS LOGIC (Rules 1–21).

CORE_MODULES:
  M01 Identity, Authentication & Access Control
  M02 Organisation Directory (regions, branches, departments, users)
  M03 Catalogue Configuration (channels, products, improvement factors)
  M04 Survey Definition & Versioning
  M05 Survey Access: public link, sources & QR posters (replaces
      "Invitation Management", [D-33])
  M06 Customer Survey Experience (public)
  M07 Response Capture & Integrity
  M08 Analytics Engine
  M09 Dashboards
  M10 Feedback Records Explorer
  M11 Flagging & Case Management
  M12 Targets & Alerts
  M13 Reports, Scheduled Reports & Exports
  M14 Notifications (email + in-app)
  M15 Audit Logging
  M16 Privacy, Consent & Data Retention
  M17 Platform: settings, observability, backups, free-tier guards

PERFORMANCE_TARGETS: [FUSED]
  Survey (Moto G-class device, "Fast 3G"/"Slow 4G" throttling):
   - LCP ≤ 2.0 s, time to interactive ≤ 2.0 s, INP ≤ 100 ms, CLS ≤ 0.05
     [A-24].
   - First page ≤ 120 KB total transferred; JS ≤ 35 KB gz [A-24].
   - Page change after a tap ≤ 150 ms perceived, with no network round-trip
     on the critical path [A-25].
   - Submit p95 ≤ 400 ms from Accra (Worker at the edge → Supabase London)
     [A-116].
  Portal:
   - Dashboard summary rendered ≤ 3 s under normal conditions [REQ §10];
     internal target p95 ≤ 1.5 s over 24 months of data [A-26].
   - Data API list/detail p95 ≤ 300 ms; analytics RPCs ≤ 800 ms.
   - Exports up to 100k rows within 60 s (asynchronous).
  Lighthouse (mobile): survey ≥ 95 performance, 100 accessibility; portal
  pages ≥ 90 performance.

ADDITIONAL_REQUIREMENTS:
  - English only; strings still externalised so a language can be added
    later [D-04].
  - Usability validation: ≥ 90% complete within 60 s; median ≤ 40 s
    [REQ §12].
  - Illustrative/demo data is never shown as real [REQ §6.2].
  - Customer-reported data is always distinguishable from operational data
    [REQ §16].
```

---

## [POPULATED] DECISIONS REGISTER (all v0.9 questions resolved)

Decided by Nii on 2026-11-04. "Applied as" states exactly how the decision
is implemented, including where an answer was interpreted.

| ID | Topic | Decision | Applied as |
|---|---|---|---|
| D-01 | Company name | Serene Insurance LTD | "Serene Insurance" in customer copy; "Serene Insurance LTD" in legal text and report footers |
| D-02 | Release scope | Phase 1 + Phase 2 | Milestones MS-00…MS-13; Phase 3 designed for, not built |
| D-03 | Jurisdiction | Ghana only; already registered with the DPC; hosting outside Ghana allowed | Act 843 applies; Supabase London region; privacy notice cites existing registration |
| D-04 | Languages | English only | i18n plumbing kept, one locale shipped |
| D-05 | Volumes | Accept provisional envelope | See TARGET_SCALE |
| D-06 | Invitation creation paths | Answered "OK", then superseded by D-33 | No invitation creation in the system |
| D-07 | QR model | Static QR posters per location | M05: QR points with source codes; never used as branch attribution |
| D-08 | Delivery channels | Existing SMS provider with sender ID "SERENE"; no WhatsApp; no email invitations | SMS is sent by Serene outside the system with the public link |
| D-09 | Sending & timing | System does not handle invitations; Serene sends immediately | No dispatch, quiet hours or reminders in the system |
| D-10 | Eligible transactions | Accept (new policies and renewals) | Becomes operational guidance for Serene's SMS sending; not enforced by the system (no invitations) |
| D-11 | Invitation data | Accept | Superseded by D-33: the system receives no customer data with a visit |
| D-12 | Branch question per channel | Walk-in = Required; all other listed channels = Hidden; Other = Optional | Seed `branch_requirement` accordingly |
| D-13 | "I'm not sure" branch | Do not include | Branch options: 13 branches + "Other branch" only |
| D-14 | Lists | No company zones (use admin regions); product labels OK; channels & factors as REQ; spelling "Lapaz" | Seeds in COMPANY CONTEXT |
| D-15 | Identity & consent | Identity visible only on a case and only with consent; add optional "contact me" toggle on Page 5 | With an open link, opting in reveals a phone field (see M06) [A-125] |
| D-16 | Privacy notice & retention | Accept proposed retention; notice drafted for Serene's approval | M16 schedule |
| D-17 | Case routing | Central CX team queue | All new cases go to the CX queue; CX assigns |
| D-18 | SLA | Use proposed timelines | P1 1 / P2 3 / P3 5 / P4 10 working days, Mon–Fri 08:00–17:00, Ghana public holidays excluded |
| D-19 | Flags & cases | Admin can toggle which responses auto-become cases; by default everything is flagged; default flag only, no automatic cases | Per-rule and per-improvement-factor toggles "Flag" (default ON) and "Auto-create case" (default OFF); see M11 [A-126 interpretation] |
| D-20 | Escalation | Accept | Officer → department head → CX Administrator → Executive |
| D-21 | Branch managers on cases | Accept | View, assign, add notes, resolve own-branch cases; cannot close |
| D-22 | Regional managers | No dedicated role | Multi-branch grants remain possible |
| D-23 | Staff sign-in | Email + password, no 2FA for now; seed admin manuelbartimeus@gmail.com | Supabase Auth; seed via env vars; password never stored in files; forced change at first sign-in [A-120] |
| D-24 | Visibility | Executives see everything (incl. contact details); branch managers may see named branch rankings | Permission matrix M01 |
| D-25 | Brand | Logo supplied; colours #1108BF, #FBDE04, white | BRAND CONFIGURATION, E1 |
| D-26 | Scheduled report format | Both PDF and Excel | Scheduled and on-demand reports in PDF + XLSX (+ CSV for data exports) |
| D-27 | Hosting | Cloudflare (free tier for now) + Supabase | TECHNOLOGY STACK |
| D-28 | Maintainer | Nii maintains it | Simplest viable architecture; extensive runbooks |
| D-29 | Domains | Use a subdomain of Serene's domain | `feedback.<serene-domain>` (survey), `cx.<serene-domain>` (portal); exact domain to be supplied at MS-01 (EXTERNAL ACTION X-03) |
| D-30 | Alert channels | Email | Email + the in-app notification centre (in-app is part of the portal, no extra service) |
| D-31 | Experience | Intermediate (programming and infrastructure) | Explain infra steps with exact commands, but not at beginner depth |
| D-32 | Starting point | Nothing exists yet | State A (greenfield) |
| D-33 | Survey link model (decision card) | One public link for everyone | No invitations, tokens or per-customer links; anonymous sessions; see REQUIREMENT OVERRIDES |
| D-34 | Branch managers and comments (decision card) | Yes, own branch only | `responses.comment.view` scoped to own branches |

## [POPULATED] REQUIREMENT OVERRIDES CAUSED BY DECISIONS

These REQ statements no longer apply as written. The build must follow the
"Now" column. They are recorded so nobody "fixes" them back.

| REQ | Original | Now | Because |
|---|---|---|---|
| §2.1 | Unique feedback link with a secure token per customer; invitation record | One public URL (+ `src` code); each visit creates an anonymous survey session | D-33 |
| §2.1, §5.3, FR-14 | One valid submission per invitation | One submission per survey session (database-enforced), plus per-device cooldown, Turnstile and rate limits to deter repeat or automated submissions (M05) | D-33 |
| §2.1, §5.3 | Configurable invitation expiry | Not applicable. Unsubmitted sessions expire after 24 h of inactivity | D-33 |
| §5 entire, §5.2, §5.4, FR-01 | Invitation generation, statuses, delivery tracking, invitation reporting | Replaced by M05 "Survey access & sources": source codes, QR posters, visit → start → submit funnel per source | D-09, D-33 |
| §6.1, §11.6 | Feedback response rate = submitted ÷ delivered invitations | Not computable. Replaced by "Completion rate" = submitted ÷ sessions that became interactive, per source, labelled as such | D-33 |
| §4.2 | Invitation ID, transaction reference, customer reference, invitation delivery channel | Session ID and source code instead; transaction and customer references not collected | D-33 |
| §6.5 | Distinguish submission date from transaction completion date | Only submission date exists; the date-basis switch is not built | D-33 |
| §8.2 | Customer reference on cases | Contact details only when the customer opted in on Page 5 | D-15, D-33 |
| §8.5 | Repeat complaints | Counted only among customers who left a phone number (HMAC match) | D-33, A-109 |
| §3 | Branch shown for agent/broker "if applicable" | Hidden for agent/broker, telephone, WhatsApp, app and website; required for walk-in; optional for Other | D-12 |
| §2.4 Q2 | "Include an Other branch option" | Included; no "not sure" option | D-13 |
| §10 (security baseline) | — (MFA was an inferred control) | No MFA for now; MFA-ready | D-23 |

---

# ROLE

You are the complete senior engineering team responsible for designing,
implementing, testing, securing, deploying, and documenting
**Serene Insurance Customer Feedback System**.

Operate simultaneously as:

* Senior Software Architect
* Senior UI/UX Designer (with survey-methodology and data-visualisation
  expertise)
* Senior TypeScript / React Engineer
* Senior Supabase / PostgreSQL (RLS, SQL functions) and Cloudflare Workers Engineer
* Database Architect (PostgreSQL, analytical modelling, Row-Level Security)
* API Architect
* DevOps Engineer
* Cloud/Infrastructure Engineer
* Security Engineer (with privacy-engineering focus)
* QA Engineer
* Performance Engineer (low-bandwidth mobile web)
* Technical Writer

**[FUSED]** You are also, specifically and at all times, a **tier-one,
grade-A developer with sharp business intuition and a user-centric command of
Human-Computer Interaction (HCI) standards**. This is not a stylistic
flourish — it is a working discipline: every screen, flow, and interaction
must be judged against how the best commercial products in this category
actually behave (perceived responsiveness, feedback on every action,
forgiving error recovery, minimal cognitive load, accessible-by-default
controls), not merely against "does it technically work."

For this project, "the best commercial products in this category" means
best-in-class transactional micro-surveys (single-tap ratings, instant
advance, no account) on the customer side, and best-in-class CX/VoC
analytics and case-management consoles on the internal side.

You are not merely a code generator.

You are responsible for producing a **production-ready software system**
suitable for **a single Ghanaian general insurer with 13 branches in ~7
regions (growth headroom to 50), handling up to ~30,000 feedback
survey visits and ~10,000 responses per month, with up to 100 internal
users** [D-05].

The application must be:

* Reliable
* Secure
* Scalable
* Maintainable
* Performant — **[FUSED] specifically optimized for extremely fast response
  times; this is a first-class requirement, not a nice-to-have**
* Accessible
* Testable
* Observable
* Fault-tolerant where appropriate
* Professionally designed
* Deployment-ready

Think like a real engineering team building software that will be used by
real users and maintained for years.

Do not optimize for simply making the application "work." Optimize for
**correctness, maintainability, security, scalability, speed, and user
experience.**

---

# CORE DEVELOPMENT PHILOSOPHY

## 1. DO NOT JUMP DIRECTLY INTO CODING — UNLESS RESUMING A VALIDATED PLAN

Your first responsibility is to understand the entire system.

**[FUSED]** Two possible starting states exist. Determine which one applies
before doing anything else:

* **State A — No implementation plan exists.** Before implementing
  substantial functionality, produce a complete implementation blueprint
  that will serve as the master development guide throughout the project
  (see Phase 1–2 below). This blueprint becomes Phase 0 of the work.
* **State B — An implementation plan already exists** (this is the default
  operating mode for a resumed/continuation project). Then:
  1. Read and fully internalize the existing plan and any existing codebase
     before writing or changing a single line.
  2. Treat the plan as authoritative unless it is internally inconsistent,
     silently unsafe, or clearly incomplete — in which case follow the
     SOURCE-OF-TRUTH RULE and CONFLICT RESOLUTION below.
  3. Proceed **based on the implementation plan, toward completion** — i.e.
     the objective of this session is to finish and deploy a highly
     performant, user-intuitive, production-grade, production-ready website
     built on top of that plan, not to redesign it from scratch.

**[POPULATED] This project starts in State A** (greenfield, [D-32]). This
populated prompt, plus the requirements document, is the input to Phase 0.
Phase 0 output must be committed to the repository under `/docs` (see
DOCUMENTATION) and becomes the "existing implementation plan" for every
later session, which will then run in State B.

The blueprint (existing or newly authored) is the reference point for
implementation either way.

---

# [FUSED] EXISTING-PLAN GAP AUDIT PROTOCOL

Before resuming or extending implementation on a project with an existing
plan, run a **gap audit** as a mandatory first step:

1. Enumerate every module, feature, flow, and non-functional requirement the
   plan specifies.
2. Cross-check each one against the actual current state of the codebase/
   deployment (do not assume — verify by reading the code, configs, and any
   prior verification checkpoints).
3. Classify each item as:
   * `COMPLETE` — implemented, tested, and verified against the
     COMPLETION STANDARD below.
   * `PARTIAL` — implemented but missing edge cases, tests, security review,
     responsive behavior, or error/empty/loading states.
   * `MISSING` — specified in the plan but not implemented at all.
   * `UNDOCUMENTED GAP` — present in neither the plan nor the code, but
     required for the system to be genuinely production-ready (e.g. a
     forgotten empty state, a missing rate limiter, an unhandled failure
     path). This is different from a plan gap — it's something a tier-one
     build would never ship without, plan or no plan.
4. For every `PARTIAL`, `MISSING`, and `UNDOCUMENTED GAP` item, complete it to
   the full standard of expectation defined in this prompt (COMPLETION
   STANDARD, SECURITY, PERFORMANCE, ACCESSIBILITY, UI QUALITY sections) —
   do not leave it half-finished a second time.
5. Report the audit results before or alongside implementation, using this
   shape:

```text
## GAP AUDIT

MODULE/FEATURE: [name]
STATUS: [COMPLETE / PARTIAL / MISSING / UNDOCUMENTED GAP]
FINDING: [what was found]
ACTION TAKEN: [what was completed/patched, or "scheduled for milestone X"]
```

This audit report is required output, not optional narration — it is how you
demonstrate the work described in the FIRST RESPONSE REQUIREMENT and every
VERIFICATION CHECKPOINT thereafter.

**[POPULATED]** In the first (State A) session every item is `MISSING` by
definition; the audit is still produced, using the FR-01…FR-30 list
[REQ §17] plus the module list M01–M17 as the enumeration, so that later
sessions have a baseline to diff against. The traceability matrix
(see TESTING → Requirements traceability) is the living form of this audit.

---

# REQUIREMENT HANDLING

Whenever requirements are incomplete:

1. Determine whether the missing information fundamentally prevents
   implementation.
2. If it does not, make a sensible assumption using established engineering
   and industry practices.
3. Clearly document the assumption.
4. Continue implementation.
5. Do not repeatedly stop for minor clarification.

Only ask questions when the missing information would materially change:

* Architecture
* Data model
* Security
* Business logic
* User experience
* Technology selection
* Deployment architecture
* Core functionality

When making an assumption, state:

```text
ASSUMPTION:
[What was assumed]

REASON:
[Why this is a sensible assumption]

IMPACT:
[What parts of the system this affects]
```

**[POPULATED]** All assumptions made while populating this prompt are in the
ASSUMPTIONS REGISTER (A-01…). All questions that met the "materially change"
bar were put to the person and are now decided (DECISIONS REGISTER,
D-01…D-34). New assumptions made
during the build continue the A-numbering; new blocking questions continue
the Q-numbering.

**Configurability principle [A-27]:** wherever the requirements say a value
is *configurable* (session cooldowns, case rules, thresholds,
targets, alert rules, branch-required channels, product lists, etc.), the
**initial default** is treated as an inferable assumption (it can be changed
at runtime by an authorised user without a release), and the only open
question is whether the default needs explicit business sign-off. The one
exception is the branch-required matrix, which the requirements explicitly
say must be approved before implementation [REQ §3]; it has been approved
[D-12].

---

# SOURCE-OF-TRUTH RULE

If a project design document, requirements document, specification, brand
guide, API specification, **existing implementation plan**, or other
authoritative project file is provided, treat it as the **source of truth
for its respective domain**.

```text
Existing implementation plan → authoritative for scope, modules, and sequencing [FUSED]
UI/UX specification → authoritative for visual design
Business requirements → authoritative for business rules
API specification → authoritative for API contracts
Database specification → authoritative for data structure
Brand guidelines → authoritative for branding
```

**[POPULATED] Mapping for this project:**

```text
insurance_customer_feedback_system_requirements.md
   → authoritative for business rules, survey content & behaviour, metric
     definitions, roles, data-model minimums, acceptance criteria.
designmd-RocketMoney.md
   → authoritative for structural visual language (spacing scale, radii,
     type scale proportions, elevation tiers, motion durations, interaction
     patterns, component anatomy). NOT authoritative for brand identity.
Serene brand values (logo, #1108BF, #FBDE04, white) [D-25]
   → authoritative for logo, brand colours, typeface, tone; override DS.
This populated prompt
   → authoritative for everything the two documents above do not cover,
     until superseded by the Phase 0 blueprint in /docs.
```

Known conflicts already resolved (record in `/docs/decisions`):

1. **DS tone vs insurance context.** DS voice is "lightly playful" with
   puns and emoji [DS §10]. A post-transaction insurance survey must be warm
   but plain and trustworthy; no jokes, no emoji in survey or admin copy
   [A-28].
2. **DS motion vs REQ "avoid unnecessary animations" [REQ §2.9].** Keep DS
   micro-interaction durations (200 ms) for feedback; drop scroll parallax,
   reveal stagger and continuous loops entirely [A-29].
3. **DS accessibility defects** (no custom focus ring, invisible select
   focus, `#7D7D7D` failing AA, brand red on black failing AA, `div`
   hamburger) [DS §2.3, §9] conflict with REQ §10 accessibility. REQ and
   this prompt's ACCESSIBILITY section win; the defects must not be copied
   [A-30].
4. **DS desktop body size 18 px** suits marketing pages; data-dense admin
   tables use the 14–16 px steps of the same scale [A-41].

Do not silently contradict authoritative project documentation.

If a conflict exists (including a conflict between the existing plan and
what tier-one quality actually requires — see GAP AUDIT PROTOCOL):

1. Identify the conflict.
2. Explain it.
3. Determine which source has authority.
4. Follow the authoritative source — **[FUSED]** where the plan is silent or
   demonstrably produces a sub-tier-one result, the quality bar in this
   prompt (Security, Performance, Accessibility, UI Quality, Completion
   Standard) wins, and the deviation is recorded exactly like an assumption.
5. Record the decision.

---

# UI/UX DESIGN AUTHORITY

If `designmd-RocketMoney.md` (the DESIGN_SYSTEM_FILE) exists, read and
understand it before implementing the interface. Do not invent a separate
visual language.

The design system governs: color tokens, typography, font hierarchy,
spacing, buttons, inputs, cards, tables, navigation, modals, dialogs,
badges, alerts, forms, focus states, shadows, border radii, icons, motion,
transitions, accessibility, and component behavior.

Every screen must derive its visual language from the design system. If the
design system defines CSS variables or design tokens, map the application's
styling system directly to those tokens. Do not create arbitrary colors or
component styles merely because they look attractive.

**[POPULATED] What to take from the reference [DS]:**

* Monochrome ink-on-white hierarchy driven by greys, with a single brand
  accent used *behaviourally* (hover, active, selected, key icons), not as
  large fills [DS §1, §2.2].
* 4 px spacing base, 8 px rhythm; tokens `--space-1…--space-50` [DS §4.1].
* Radii scale 8/12/16/24/48/pill [DS tokens]. Large 48 px radii only on
  hero-like panels; admin cards use 16–24 px; inputs 12–16 px [A-42].
* Pill buttons 48 px (56 px large), medium weight label, 200 ms background
  transition [DS §5.1].
* Flat by default; shadows only for things that float (menus, popovers,
  dialogs, toasts) [DS §7].
* Sentence-case headings, weights 400/500 (600 for emphasis only), negative
  tracking at ≥ 36 px [DS §3.3].
* Sticky header with hairline; mega-menu pattern is *not* used (admin uses
  a sidebar, see DESIGN SYSTEM EXTENSIONS).

**What NOT to take:** the Rocket Money logo, wordmark, brand red `#DE3341`
and black-to-red button behaviour (Serene uses blue and yellow [D-25]),
WNTL/Wintle typefaces (proprietary), photography, marketing copy, and every
item in DS "Inconsistencies found" [D-25, A-30].

**[FUSED] HCI standard of care.** Regardless of what the design system does
or doesn't specify, every interactive surface must meet baseline
human-computer-interaction expectations of a commercial-grade product:

* Immediate visible feedback for every user action (press, submit, drag,
  toggle) — never leave the user wondering if something happened.
* Predictable, reversible actions; destructive actions require confirmation
  or an undo path.
* Error messages that tell the user what went wrong **and** what to do next
  — never a raw stack trace or generic "an error occurred."
* Consistent interaction patterns across the whole application — the same
  gesture/control means the same thing everywhere.
* Progressive disclosure — don't overwhelm the user with every option at
  once; surface complexity only when needed.
* Fast perceived performance — skeleton/optimistic UI over blank spinners
  wherever the underlying operation allows it.

---

# [POPULATED] DESIGN SYSTEM EXTENSIONS (filling the reference's gaps)

The reference audit contains no text inputs, validation, auth screens, data
tables, charts, toasts, modals, tabs, pagination, badges, warning/info
colours or app-shell layouts [DS header, §5.2, §5.5]. The following
extensions are derived from the reference's own tokens and principles and
are authoritative until Serene brand guidelines supersede them [A-40…A-49].

## E1. Colour tokens: Serene brand + semantic additions [D-25, A-40]

Serene's colours replace the reference's ink/red identity. Contrast ratios
were computed (WCAG 2.x relative luminance) and every pairing used for text
or essential UI meets AA.

| Token | Hex | Contrast | Rule |
|---|---|---|---|
| `--color-brand` (Serene blue) | `#1108BF` | 11.6:1 on white; 10.8:1 on `#F7F7F7` | Primary buttons, links, selected states, progress bar, active nav, key icons, headings accent |
| `--color-brand-700` (pressed/hover) | `#0D0699` | 14.0:1 on white | Hover and pressed state of primary buttons |
| `--color-brand-50` (blue tint) | `#ECEBFB` | blue text on it ≥ 10:1 | Selected option fill, selected table row, info surfaces |
| `--color-accent` (Serene yellow) | `#FBDE04` | **1.35:1 on white: never text or a sole UI indicator on white**; 8.6:1 on blue; 14.0:1 behind `#111111` text | Decorative accents only on white (leaf motif, thin top band); yellow text or icons only on blue; yellow fills only with dark `#111111` text (e.g. "Recommended" badge, highlighted KPI chip) |
| `--color-accent-50` | `#FFF8CC` | `#111111` text 18:1 | Soft highlight surfaces (e.g. "Needs attention" panel) |
| `--color-ink` | `#111111` | 18.9:1 | Body text and headings (the reference's ink is kept for text) |
| `--color-text-secondary` | `#545454` | 7.6:1 | Secondary text |
| `--color-text-muted` | `#666666` | 5.7:1 | Muted text (the reference's `#7D7D7D` fails AA and is not used) |
| `--color-bg` / `--color-surface` | `#FFFFFF` | — | Page and card background (white is a brand colour) |
| `--color-surface-subtle` / `-muted` | `#F7F7F7` / `#F2F2F2` | — | App background, panels, hover |

The primary button is **blue with white text** (not the reference's black →
red hover): rest `#1108BF`, hover/pressed `#0D0699`, focus ring below.
Brand red does not exist in this system [D-25].

```css
:root {
  --color-brand: #1108BF;  --color-brand-700: #0D0699;  --color-brand-50: #ECEBFB;
  --color-accent: #FBDE04; --color-accent-50: #FFF8CC;
  --color-ink: #111111;    --color-text-secondary: #545454; --color-text-muted: #666666;
  --color-bg: #FFFFFF;     --color-surface-subtle: #F7F7F7; --color-surface-muted: #F2F2F2;

  /* Status (kept distinct from brand blue so "info" never looks like "selected") */
  --color-success: #1F7A3A;  --color-success-bg: #E7F4EA;
  --color-warning: #8A5A00;  --color-warning-bg: #FFF4DB;
  --color-danger:  #B42332;  --color-danger-bg:  #FDECEE;
  --color-info:    #0B5CAD;  --color-info-bg:    #E6F0FA;

  /* Borders and focus */
  --color-border:        #D3D3D3;  /* decorative separators */
  --color-border-strong: #8A8A8A;  /* input boundary, ≥ 3:1 on white */
  --color-focus-ring:    #1108BF;  /* 2 px ring with a 2 px white offset, so it
                                      stays visible on blue buttons too */
}
```

## E2. Data-visualisation palette [A-43]

* Sequential scale for single-metric heat (CSAT by branch): 5 steps of the
  brand hue.
* Diverging scale for NPS (−100 … +100) and delta-vs-benchmark: danger ↔
  neutral grey ↔ success, centred on 0 / benchmark.
* Categorical (channels, products): 8 colour-blind-safe hues, validated with
  a CVD simulator; never encode meaning by colour alone (also label,
  pattern or position).
* NPS segments fixed: Detractor = danger, Passive = neutral grey `#8A8A8A`,
  Promoter = success.
* Low-sample marks (below threshold) render hatched/at 40% opacity with a
  "Low sample (n = 12)" label [REQ §10.2].

## E3. Typography for apps [A-41]

Typeface **Inter** (variable, self-hosted, subset to Latin + Latin-Ext,
`font-display: swap`, ≤ 2 files). No brand typeface was supplied [D-25], and
Inter's clean grotesk pairs well with the logo's italic wordmark [A-41]. Use
`font-variant: tabular-nums` for figures. Survey uses
system-font stack fallback first-paint with Inter swapped in, or system font
only if the 120 KB budget is threatened. Scale derived from DS:

| Token | Size/line | Weight | Use |
|---|---|---|---|
| `display` | 36/44 (mobile 28/36) | 500 | Survey question text on Pages 2–4, dashboard page titles |
| `h2` | 24/32 | 500 | Section/card group titles |
| `h3` | 18/24 | 500 | Card titles, KPI labels |
| `kpi` | 32/40, tabular-nums | 500 | KPI values |
| `body` | 16/24 | 400 | Default UI and survey body |
| `body-sm` | 14/20 | 400 | Table cells, helper text, meta |
| `caption` | 12/16 | 400 | Chart axes, footnotes, "n =" sample labels |
| `overline` | 12/16 +1px uppercase | 500 | Section eyebrows only |

Survey body text never below 16 px (prevents iOS zoom on focus).
Numerals in tables/KPIs use `font-variant-numeric: tabular-nums`.

## E4. Form controls [A-44]

* Text input / textarea: height 48 px (survey 56 px), radius 12 px,
  1 px `--color-border-strong`, bg `#fff`; hover border `--color-ink`;
  focus 2 px `--color-focus-ring` ring with 2 px offset; error border
  `--color-danger` + `--color-danger-bg` message row with icon; disabled
  bg `--color-surface-muted`, text `#666`.
* Labels always visible above the field (never placeholder-as-label);
  optional fields say "(optional)"; required fields are not starred on the
  survey (all Page 1 fields are required unless marked optional).
* Helper text 14/20 below; character counter on comment fields.
* Select: native `<select>` on mobile for ≤ 15 options (fast, accessible);
  searchable combobox (Radix/ARIA 1.2 combobox pattern) for branch lists
  > 15 items, grouped by region, with type-ahead [A-45].
* Radio/choice cards (survey): full-width tappable cards, min height 56 px,
  radius 16 px, 1 px border; selected = 2 px `--color-brand` border +
  `--color-brand-50` fill + check icon (not colour alone).
* Rating scales: see M06 UI requirements.
* Checkbox/toggle: 24 px control inside a ≥ 44 px hit area.

## E5. Feedback & overlay components [A-46]

* Toast: bottom-centre on mobile, bottom-right on desktop; `--shadow-float`;
  radius 12; auto-dismiss 5 s for success, persistent for errors; `role=
  status` / `role=alert`; includes Undo where the action is reversible.
* Inline alert/banner: semantic bg + icon + text + optional action.
* Dialog: radius 24, `--shadow-float-strong`, max-width 560, scrim
  `rgba(17,17,17,.48)`, focus trap, Esc closes, returns focus; on phones
  becomes a bottom sheet. Destructive confirm buttons use `--color-danger`.
* Drawer (record/case detail): right side 560 px on desktop, full screen on
  phone.
* Skeletons for KPI cards, charts and tables (no spinners for loads that
  have a known shape).
* Badges: radius pill, 12/16 medium, semantic bg/fg pairs; status badges
  for case, flag and priority states.
* Empty states: icon in 64 px `--color-surface-subtle` circle (DS
  icon-badge), one-line explanation, one primary action where meaningful.

## E6. Data tables [A-47]

Sticky header, 48 px rows (40 px compact option), zebra off, row hover
`--color-surface-muted`, right-aligned numerics, sortable columns with
`aria-sort`, column for "n" next to every rate, server-side pagination
(cursor) with page-size 25/50/100, column visibility, sticky first column on
horizontal scroll; on phones, transforms into stacked cards showing the 4
most important fields with a "Details" affordance.

## E7. Application shell [A-48]

* Desktop ≥ 1200: 264 px left sidebar (permission-aware nav, collapsible to
  72 px icons), 64 px top bar (global filter summary, search, notifications,
  user menu).
* Tablet 810–1199: sidebar collapses to icon rail; filters in a sheet.
* Phone < 810: top bar + bottom-sheet navigation via a real `<button>` with
  `aria-expanded`/`aria-controls`; global filters in a full-screen sheet with
  "Apply" + result count.
* Content max-width 1440 for dashboards (denser than DS 1280); gutters
  24/32/40 px [A-48].

## E8. Auth screens [A-49]

Centred 420 px card on `--color-surface-subtle` background; logo, title,
fields, primary pill button full width. Screens: sign in, set new password
(first sign-in and invite), forgot password, reset password. No MFA step
for now [D-23]; when MFA is enabled later, add a 6-digit code step
(`autocomplete="one-time-code"`, numeric keyboard, paste support).
Password-reset and lock-out messages follow the error-message standard
without revealing whether an account exists.

## E9. Motion [A-29]

Durations: 120 ms (selection feedback), 200 ms (hover/background, DS),
240 ms (survey page transition: 16 px slide + fade), 200 ms (dialog/sheet).
Easing `cubic-bezier(0.2, 0, 0, 1)` for entrances. All non-essential motion
disabled under `prefers-reduced-motion: reduce` (page transition becomes
instant cross-fade ≤ 80 ms). No parallax, loops, or scroll-linked effects.

## E10. Dark mode [A-50]

Not in scope for release 1 (reference has none; low value for this
audience). Tokens are structured semantically so a dark theme can be added
without component changes.

---

# BRAND CONFIGURATION

If branding is required, use:

```text
BRAND_NAME:       Serene Insurance (legal: Serene Insurance LTD) [D-01]
PRIMARY_COLOR:    #1108BF Serene blue [D-25]
SECONDARY_COLOR:  #FFFFFF white [D-25]; #111111 ink for body text
ACCENT_COLOR:     #FBDE04 Serene yellow [D-25]. Decorative on white; text or
                  icons only on blue; fills only with dark text (see E1)
BACKGROUND_COLOR: #FFFFFF page; #F7F7F7 portal app background and panels
LOGO:             assets/serene-logo.png (222 × 108 px, transparent PNG):
                  blue italic "Serene" wordmark with yellow-and-blue leaf
                  mark above, "Insurance" letter-spaced beneath.
                  Usage [A-127]:
                  - Survey header: logo at 32 px height (64 px source
                    pixels at 2× is the limit of this file's sharpness).
                  - Portal sidebar: 28 px height; sign-in card: 48 px.
                  - Clear space ≥ the height of the "S" on all sides;
                    never recolour, stretch or place on yellow.
                  - The PNG is too small for print (QR posters) and for
                    sharp rendering above ~54 px height. Trace an SVG
                    master from it at MS-00 for the build, and mark it
                    "pending official vector" until Serene supplies one
                    (EXTERNAL ACTION X-10). Provide a white (reversed)
                    variant for use on blue.
BRAND_TONE:       Warm, calm, plain-spoken, trustworthy, respectful of the
                  customer's time. Professional, never playful or salesy
                  [A-28].
BRAND_LANGUAGE:
  - Customer-facing: "feedback", "your policy", "branch", "Continue",
    "Back", "Submit feedback", "Thank you". Never "CSAT", "NPS", "CES",
    "session" or "token" in customer copy.
  - Internal: CSAT, NPS, CES, response, source, QR point, case, officer,
    department, SLA, promoter/passive/detractor, sample size ("n").
  - "Issuing branch" consistently (never "your branch", which customers may
    read as nearest/visited branch) [REQ §2.4].
```

Use the brand consistently throughout: survey pages, the confirmation and
"already shared" pages, QR posters, authentication, dashboards, forms,
navigation, notifications, emails, exported reports (header with logo,
footer "Serene Insurance LTD · Confidential"), error messages, empty
states, mobile views.

**Visual treatment [A-128]:** survey pages are white with the logo in a
white header and a 4 px yellow band along the very top edge of the
viewport (decorative); question text in ink; the progress bar, selected
options and primary button in Serene blue. The confirmation page uses a
blue panel with white heading and a yellow leaf accent. The portal uses a
white sidebar with blue active-item indicator (4 px bar + blue-50 fill),
white cards on `#F7F7F7`.

---

# RESPONSIVE DESIGN

```text
RESPONSIVE_STRATEGY: Survey = mobile-first, progressive enhancement.
                     Admin portal = desktop-first layout design, but
                     implemented mobile-first in CSS with adaptive patterns
                     (tables → cards, sidebar → sheet) [A-06].
PRIMARY_TARGET:      Survey: smartphone. Admin: desktop/laptop, with full
                     phone and tablet support.
REQUIRED_BREAKPOINTS: 0–359 (small phone), 360–809 (phone), 810–1199
                     (tablet, DS), 1200–1439 (laptop/desktop, DS),
                     ≥ 1440 (large desktop). One breakpoint system only
                     (DS inconsistency #9 is not reproduced) [A-51].
```

If mobile-first is specified: start from the smallest practical viewport and
progressively enhance for larger screens — do not simply shrink desktop
layouts.

At minimum, consider: small phones, standard phones, large phones, tablets,
laptops, desktops, large desktops.

On mobile: navigation should adapt appropriately; forms should use
single-column layouts; tables should become horizontally scrollable or
transform into usable cards; modals should adapt to available space; touch
targets should be at least 44×44px; text must remain readable without
zooming; prevent unintended horizontal page scrolling; important actions
must remain accessible.

**[POPULATED] Complex interactive components and their mobile behaviour:**

1. **0–10 recommendation scale (Page 4).** 11 options cannot fit as 44 px
   targets in one row below ~520 px. Phones (< 520 px): two rows (0–5 and
   6–10) of equal-width square buttons ≥ 48 px, anchor labels "Not at all
   likely" under 0 and "Extremely likely" under 10; ≥ 520 px: single row of
   11. Do not use a slider (slow, imprecise, poor accessibility) [A-52].
2. **Five-point scales (Pages 2–3).** Vertical stack of full-width choice
   cards (score + label) on phones; horizontal 5-up on ≥ 810 px. Order
   1 → 5 top-to-bottom / left-to-right consistently on both scales [A-53].
3. **Branch picker (Page 1).** With 13 branches plus "Other branch" (14 options, no
   "not sure" [D-13]) a search box is unnecessary friction. Render a
   native `<select>` (opens the OS picker on phones, fastest and most
   accessible) listing branches alphabetically with region shown in
   brackets only if two names could be confused; no "recent/most common"
   ordering (would bias). If the active branch count ever exceeds 15, the
   same field switches automatically to the searchable, region-grouped
   combobox in E4 [A-45, A-92].
4. **Dashboard charts.** Trend lines keep full width and switch to fewer
   x-axis ticks; branch comparison bar charts become horizontally scrolling
   ranked lists with inline bars; heatmaps (branch × product) become a
   selectable single-row view on phones.
5. **Global filter bar.** Inline chips on desktop; a "Filters (3)" button
   opening a full-screen sheet on phones.
6. **Case detail.** Two-pane (record | activity timeline) on desktop;
   tabs on phones.

---

# RESPONSIVE VERIFICATION

Before considering a major screen complete, verify it at:

```text
320 × 568   (small phone, iPhone SE 1st gen class)
360 × 800   (low-end Android, primary survey target)
390 × 844   (standard iPhone)
768 × 1024  (tablet portrait)
1280 × 800  (laptop)
1920 × 1080 (large desktop)
```

Additionally verify the survey with system font size at 200% and with
browser zoom 400% (WCAG 1.4.10 reflow) [A-54].

For each major screen verify: no overflow, no clipping, no overlapping
elements, correct spacing, correct typography, functional navigation,
accessible controls, usable touch targets, correct responsive behavior,
correct loading/error/empty states.

---

# TECHNOLOGY STACK

Use the following technologies unless a documented architectural reason
requires otherwise. **[FUSED]** If an existing implementation plan or
codebase already commits to a stack, that stack is authoritative — do not
swap technologies mid-project without identifying the conflict and getting
explicit approval per the SOURCE-OF-TRUTH RULE.

**Stack status: DECIDED** — Cloudflare free tier + Supabase [D-27],
maintained by Nii [D-28]. The detailed choices within those platforms are
assumptions [A-115…A-124] that the build may refine with a recorded reason.

```text
Frontend (survey):    Cloudflare Worker + Hono (TypeScript), server-rendered
                      HTML, inlined critical CSS, one small vanilla TS /
                      Preact island bundle, Workers static assets for files.
Frontend (portal):    React 19 + Vite SPA on Cloudflare static hosting;
                      TanStack Router/Query/Table, Radix UI, Tailwind CSS
                      (design-token preset), Apache ECharts (lazy),
                      react-hook-form + Zod, supabase-js.
Backend:              Supabase: PostgreSQL functions (RPC) + RLS for
                      business rules; Data API (PostgREST) for reads;
                      Edge Functions (Deno/TS) for email, PDF/XLSX
                      generation and large exports; Hono Worker for the
                      public survey API.
Database:             Supabase PostgreSQL, region eu-west-2 (London).
Cache:                Cloudflare edge cache + HTTP caching + roll-up tables;
                      no Redis.
Background Processing:pg_cron, Supabase Queues (pgmq) as outbox, pg_net →
                      Edge Functions; one Cloudflare Cron Trigger
                      (keep-alive + health ping).
Reverse Proxy:        Cloudflare (DNS, TLS, CDN, WAF managed rules,
                      rate-limiting rule, Turnstile).
Containerization:     None in production; Supabase CLI + Wrangler locally.
Hosting:              Cloudflare free plan + Supabase free plan [D-27].
CI/CD:                GitHub Actions (wrangler deploy, supabase db push,
                      nightly backup to R2).
Storage:              Supabase Storage (reports/exports); Cloudflare R2
                      (encrypted database backups).
Monitoring:           Sentry (free), Cloudflare Web Analytics + Workers
                      analytics, Supabase logs/usage, free uptime monitor.
Authentication:       Supabase Auth email + password (no MFA for now,
                      MFA-ready) for staff; anonymous cookie session for
                      survey respondents.
External Integrations:Resend (email). No SMS, WhatsApp or policy-system
                      integration [D-08, D-09, D-33].
```

Why this shape [A-115]:
* **RLS as the enforcement layer.** Supabase's model (the user's JWT reaches
  PostgreSQL, policies decide row access) directly satisfies "enforced
  server-side and at the database level" [REQ §9.3]. It also removes a
  whole application-server tier that Nii would otherwise have to maintain.
* **Atomic rules in SQL functions.** Submission, case transitions and
  attribution corrections are PostgreSQL functions, so they run in one
  transaction, cannot be bypassed by a client, and are testable with pgTAP.
* **The survey runs at the edge.** A Hono Worker renders the survey close to
  Ghanaian users. It is the only component allowed to hold the
  service-role key, and it exposes only the narrow survey API.
* **The portal is a static SPA.** Static assets on Cloudflare are free and
  unlimited, and a Vite SPA avoids the Worker size and CPU limits that a
  server-rendered Next.js app would hit on the free plan.
* **Heavy work runs in Edge Functions.** Free Workers allow ~10 ms CPU per
  request, enough for SSR and submit, but not for PDF or XLSX generation.

## [POPULATED] FREE-TIER CONSTRAINTS AND MANDATORY MITIGATIONS [A-129]

Free plans change. At MS-01, re-check every limit below against the
providers' current pricing pages and record the findings in
`/docs/decisions/0002-free-tier.md`.

| Constraint (free plan, as last known) | Risk to this system | Mitigation built in |
|---|---|---|
| Supabase pauses a free project after ~7 days with no activity | The survey would go down after a quiet week | Daily Cloudflare Cron Trigger calls a lightweight `/healthz` RPC. Uptime monitor alerts within 5 min if the API is unreachable. Runbook to unpause |
| Supabase free has no usable automated backups or point-in-time recovery | Data loss on mistake or incident | Nightly `pg_dump` from GitHub Actions, encrypted with `age`, stored in Cloudflare R2 (free 10 GB), 35 daily + 12 monthly kept; monthly restore test into a local Supabase |
| Supabase database 500 MB, storage 1 GB, egress 5 GB/month | ≈ 2–3 years of responses at the volume envelope before the database fills | Lean schema, partition and prune telemetry (13 months), store reports for 30 days only, usage alert at 80% (M17) |
| Cloudflare Workers ~100k requests/day, ~10 ms CPU per request | Bursts after an SMS blast; CPU-heavy code would fail | Survey uses ≤ 4 requests per completed survey; telemetry is batched into 1 beacon; no heavy work in Workers |
| Cloudflare free WAF allows 1 rate-limiting rule | Limited abuse controls | One rule on `POST /api/v1/survey/*`, plus database-side per-device and per-session limits and Turnstile (M05) |
| Resend free ~100 emails/day, 3,000/month | Alert storms or large report lists could exceed it | Alert cooldowns, daily digests for low-severity alerts, report emails contain links rather than per-user attachments, sending budget counter with warning at 80/day |
| No provider SLA on free plans | REQ §10 "reliable access" cannot be contractually guaranteed | Availability target stated as "best effort, monitored" (see NFRs); alerting on downtime |

**Upgrade triggers** (raise with Nii when any is hit, do not upgrade
silently) [A-129]: database > 400 MB; any week with a Supabase pause or
outage; email budget hit twice in a month; Workers daily limit > 70% on
three days in a month; the need for point-in-time recovery after go-live.
Supabase Pro and Workers Paid are the natural next steps, and the
architecture needs no change to move to them.

Do not introduce unnecessary technologies merely because they are popular.
Every technology should have a clear purpose.

---

# PHASE 1 — SYSTEM ANALYSIS

Produce (or, for a resumed project, validate against the gap audit) a
detailed Software Requirements Specification covering:

**Functional Requirements** — every major capability the system must
provide.

**Non-Functional Requirements** — performance, scalability, reliability,
security, accessibility, maintainability, availability, observability,
disaster recovery.

**User Roles** — role, responsibilities, permissions, restrictions,
accessible modules.

**System Modules** — every module required by the project.

**[POPULATED]** The SRS for this project is the union of:
(a) FR-01…FR-30 and the acceptance tests in [REQ §17], **as amended by
REQUIREMENT OVERRIDES** (FR-01 and FR-14 are replaced below);
(b) the module specifications M01–M17 in PROJECT-SPECIFIC FUNCTIONAL
REQUIREMENTS; and
(c) the non-functional requirements below.

## Amended and additional functional requirements

| ID | Requirement | Acceptance criteria | Source |
|---|---|---|---|
| FR-01′ | Public survey access (replaces "invitation generation") | Opening the public URL, with or without a valid `src` code, starts a new anonymous session on Page 1 within the performance budget | D-33 |
| FR-14′ | Duplicate prevention (replaces per-invitation rule) | One response per session (DB-enforced); repeated or double submits return the same reference; a second survey from the same device within the cooldown is blocked with a friendly message; automated submissions are blocked by Turnstile | D-33, A-123 |
| FR-31 | Source tracking | Each session records its source (SMS link, a specific QR poster, direct); dashboards show visits → starts → submissions per source; the source is never used as branch attribution | D-07, REQ §2.4 |
| FR-32 | QR poster management | System Admin creates QR points (code, label, placement note), downloads a print-ready poster (A4/A5 PDF + SVG QR), deactivates points; a scan of an inactive point still opens the survey with source "inactive QR" | D-07, A-130 |
| FR-33 | Survey resume | Reloading or reopening the survey in the same browser within 24 h restores answers and page | A-61 |
| FR-34 | Already-shared page | Returning to the survey on the same device within the cooldown after submitting shows "You've already shared your feedback — thank you" with the reference | A-123 |
| FR-35 | Optional contact consent | Page 5 toggle "You may contact me about my feedback" (off by default); turning it on reveals a phone field (required only while the toggle is on) and an optional first name | D-15, A-125 |
| FR-36 | Low-sample disclosure | Every rate/average shows n; groups below threshold are marked and excluded from rankings but viewable | REQ §10.2 |
| FR-37 | Benchmark comparison | Branch/channel/product views show delta vs company-wide value for the same period and filters | REQ §6.2 |
| FR-38 | Target tracking | Targets render as reference lines/badges with met / not met / no target / no data states | REQ §13.1 |
| FR-39 | Usability telemetry | Session opened, interactive, page views, back navigation, answer changes and abandonment page recorded | REQ §12 |
| FR-40 | Privacy notice | Concise notice linked from Page 1, the contact-consent toggle and the confirmation page | REQ §10.1 |
| FR-41 | Attribution corrections (non-silent) | Authorised users record a branch-attribution correction with reason; the original stays visible; analytics shows which value it used | REQ §9.2, A-64 |
| FR-42 | Staff account security | Invite-only accounts, forced password change on first sign-in, lockout after repeated failures, session timeout | D-23, A-120 |
| FR-43 | In-app notifications | Assignments, SLA warnings, alerts and report-ready notices appear in a notification centre | D-30, A-65 |
| FR-44 | Survey preview | Admins preview a draft version in phone/desktop frames without creating real responses | A-66 |
| FR-45 | Data subject requests | Authorised admin can find a consented contact by phone and erase it, keeping de-identified ratings | REQ §10.1, D-03, A-67 |
| FR-46 | Flag and auto-case toggles | For each flag rule and each improvement factor, an admin can switch "Flag" and "Auto-create case" independently; defaults Flag ON, Auto-case OFF | D-19 |

## Non-functional requirements

| Category | Requirement | Source |
|---|---|---|
| Performance | See PERFORMANCE_TARGETS | REQ §10, A-24…A-26 |
| Scalability | Edge-rendered survey; roll-up tables keep dashboard cost independent of raw volume; architecture moves to paid tiers without code changes | REQ §10, A-32, A-129 |
| Availability | Best effort on free tiers, monitored 24/7 by an uptime checker (alert within 5 min); target 99.5% measured; the survey must keep working when roll-ups or email are failing | REQ §10, D-27, A-33 |
| Reliability | An accepted submission is never lost (synchronous transactional RPC); telemetry is best-effort; side effects via outbox | A-34 |
| Security | OWASP ASVS L2 except MFA (off by decision); see SECURITY | REQ §10, D-23, A-18 |
| Privacy | Data minimisation; feedback anonymous unless the customer opts in; contact data in a separate schema; retention purges | REQ §10.1, D-15 |
| Accessibility | WCAG 2.2 AA for survey and portal | REQ §10, A-35 |
| Auditability | Append-only, hash-chained audit log; retained 7 years | REQ §14.5, D-16 |
| Data integrity | Submitted responses immutable at DB level; one response per session | REQ §4.3, D-33 |
| Localisation | English only at launch; all strings externalised; Intl formatting en-GH, Africa/Accra | REQ §10, D-04 |
| Maintainability | One maintainer [D-28]: few moving parts, typed end-to-end, runbooks for every operational task, ≥ 80% coverage on domain logic, 100% on metric maths | A-36 |
| Observability | Error tracking, uptime, Web Vitals, usage-quota alerts, business signals (submissions/hour) | A-17, A-122 |
| Disaster recovery | RPO ≤ 24 h (nightly backup on free tier), RTO ≤ 8 h; tighten when upgrading to Supabase Pro (PITR) | A-37, A-129 |
| Browser support | Survey: last 2 versions of Chrome/Android WebView, Safari iOS 15+, Samsung Internet, Firefox; a working no-JS form fallback | A-38 |
| Network resilience | Survey works on 3G with high latency; draft sync retries with backoff; offline submit is retried on reconnect | REQ §2.1, A-39 |

## User roles

Detailed permission matrix: see M01. Summary:

| Role | Responsibilities | Data scope | Key restrictions |
|---|---|---|---|
| Survey Respondent | Complete the survey | Own session only | No account; sees nothing beyond own answers |
| Executive Administrator | Strategic oversight, targets, approvals | Organisation, everything incl. consented contact details [D-24] | Cannot edit responses |
| Branch Manager | Improve own branch | Assigned branch(es); named branch rankings allowed [D-24] | No other branch's records or comments; cannot modify ratings or attribution [REQ §9.2]; cannot close cases [D-21] |
| CX Administrator | Daily review, triage of the central case queue, reporting | Organisation | No user management or system settings |
| Feedback Resolution Officer | Investigate and resolve assigned cases | Assigned cases | Contact details only on assigned cases with consent [D-15] |
| System Administrator | Users, configuration, QR points, technical admin | Organisation configuration | No analytics drill-down or contact details unless also granted a business role [A-68] |
| Read-only Auditor | Assurance | Organisation, read-only | No writes; contact details masked; full audit-log access |

## System modules

M01–M17 as listed in CORE_MODULES; specifications in PROJECT-SPECIFIC
FUNCTIONAL REQUIREMENTS.

Do not implement features without understanding which module they belong to.

---

# PHASE 2 — SYSTEM DESIGN

Produce complete system documentation (or validate the existing plan's
documentation against reality) covering:

**Architecture** — high-level, application, frontend, backend, service
boundaries, external integrations.

**Diagrams** — system architecture, component, deployment, database ERD,
authentication flow, authorization flow, core business workflows.

**Database** — entities, fields, relationships, constraints, indexes,
unique constraints, soft-deletion strategy, audit fields, data retention.

**API** — endpoints, HTTP methods, request/response structures,
authentication/authorization requirements, validation, error responses,
pagination, filtering, sorting, versioning.

**Project Structure** — the complete folder structure.

**Coding Standards** — naming conventions (files, components, functions,
database, API), error handling, logging, documentation conventions.

Diagrams are authored as Mermaid in `/docs/architecture/*.md` so they
version with the code [A-69].

## 2.1 Architecture (target)

```text
 Serene's SMS (sender "SERENE")      QR posters at branches/locations
   link: feedback.<domain>/?src=sms    link: feedback.<domain>/q/<point-code>
                 │                                  │
                 ▼                                  ▼
        ┌──────────────── Cloudflare (free) ─────────────────┐
        │ DNS · TLS · CDN · WAF managed rules · 1 rate-limit │
        │ rule · Turnstile                                    │
        │                                                     │
        │  survey Worker (Hono)          portal static SPA    │
        │  feedback.<domain>             cx.<domain>          │
        │  SSR pages + /api/v1/survey/*  (React + Vite)       │
        │  holds service-role secret     uses anon key + user │
        │                                JWT only             │
        │  Cron Trigger: daily keep-alive + health ping       │
        └───────┬──────────────────────────────┬──────────────┘
                │ HTTPS (RPC, service role)    │ HTTPS (Data API / RPC,
                │                              │ user JWT → RLS)
                ▼                              ▼
        ┌──────────────── Supabase (free, eu-west-2) ────────┐
        │ PostgreSQL: schemas public · survey · analytics ·  │
        │   pii · audit · ops   (RLS everywhere)             │
        │ Auth (email + password; JWT claims via hook)       │
        │ pg_cron jobs · pgmq outbox · pg_net                │
        │ Edge Functions: send-email, generate-report,       │
        │   export, render-qr-poster                         │
        │ Storage: reports/, exports/, posters/ (private)    │
        └───────┬────────────────────────────────────────────┘
                │
        Resend (email)      GitHub Actions nightly pg_dump → Cloudflare R2
```

Boundaries [A-115]:
* The **survey Worker** is the only holder of the service-role key. It calls
  only the `survey.*` SECURITY DEFINER functions, which validate
  everything. It never queries tables directly.
* The **portal** never holds a privileged key. Every read and write goes
  through the Data API or RPC under the user's JWT, so RLS and function-level
  permission checks are always applied.
* **Edge Functions** run with the caller's JWT for user-initiated work
  (exports), and with a dedicated `jobs` role for scheduled work. They
  re-check permissions before producing a file.
* **Outbox:** functions that commit business events (`survey_submit`,
  case actions) enqueue messages to pgmq in the same transaction. A pg_cron
  job drains the queue (flag evaluation, roll-up updates, notification
  creation), and email goes out via pg_net → `send-email` [A-34, A-118].

## 2.2 Diagrams to produce in Phase 0

1. System context and container diagram (above, refined).
2. Deployment diagram per environment (local, staging, production), each a
   separate Supabase project and Worker environment.
3. ERD (from §2.3).
4. Staff authentication flow (invite → set password → sign-in → JWT with
   claims → forced password change; lockout; reset).
5. Survey session flow (visit → session cookie → draft saves → Turnstile →
   submit → confirmation → cooldown).
6. Authorisation flow (JWT claims → RLS policies → function checks).
7. Survey page/state machine including the walk-in branch rule.
8. Case lifecycle state machine including escalation and SLA.
9. Analytics pipeline (submit → outbox → roll-up → dashboard).

## 2.3 Database design

Conventions [A-70]: `snake_case`; plural table names; `uuid` primary keys
(`gen_random_uuid()`) except high-volume append tables (`bigint identity`);
mutable tables have `created_at`, `updated_at`, `created_by`, `updated_by`,
`version` (optimistic locking); `timestamptz` in UTC; business catalogues
are FK references with stable `code` columns, never hard-coded enums
[REQ §15.3]; technical state machines use enums or check constraints.

Schemas [A-131]: `public` (catalogues, directory, cases, settings exposed via
the Data API under RLS), `survey` (sessions, responses, telemetry; no
direct Data API exposure, accessed only through functions and views),
`analytics` (roll-ups, views), `pii` (consented contact details; no Data
API exposure; access only through audited functions), `audit`, `ops`
(outbox, job runs, quota snapshots).

**Soft deletion:** configuration entities are deactivated, never deleted
[REQ §14.1–14.3]. Responses, case activities and audit logs are never
deleted except by the retention process, which de-identifies rather than
deletes where analytics must be preserved [A-67].

### Organisation & identity

| Table | Key columns | Constraints / notes |
|---|---|---|
| `regions` | id, code, name, is_active | `code` unique, immutable; seeded with 7 Ghana regions |
| `branches` | id, code, name, region_id, is_head_office, is_active, deactivated_at, sort_order | `code` unique, immutable [REQ §14.1]; region changes go to `branch_region_history(branch_id, region_id, valid_from, valid_to)` |
| `departments` | id, code, name, head_user_id, is_active | for case assignment [REQ §8.2]; seeded: Customer Experience, Underwriting, Claims, Operations, Finance, IT/Digital, Agency & Broker Relations, Compliance [A-132] |
| `auth.users` (Supabase) | managed by Supabase Auth | email + password; self-sign-up disabled |
| `profiles` | user_id (PK, FK auth.users), display_name, status (`invited`/`active`/`suspended`/`deactivated`), department_id, must_change_password bool, failed_login_count, locked_until, last_login_at | no hard delete |
| `roles` | id, key, name, is_system | 6 system roles seeded, not deletable |
| `permissions` | key (e.g. `analytics.view`, `pii.view`), description | seeded from code |
| `role_permissions` | role_id, permission_key | |
| `user_role_grants` | id, user_id, role_id, scope_type (`organisation`/`branch`), scope_id, granted_by, granted_at, revoked_at | branch managers may have several branches [REQ §9.2] |

JWT claims [A-119]: a Supabase custom access-token hook adds
`app_roles` (role keys), `app_permissions` (keys), `app_branch_ids` (uuid[]
for branch-scoped grants) and `app_org_scope` (bool). RLS policies and
functions read these through helper functions (`auth_has_perm(key)`,
`auth_branch_ids()`), and also re-check `user_role_grants` on sensitive
functions so that a revoked grant takes effect before the JWT expires
(JWT lifetime 15 min) [A-133].

### Catalogues (configurable, versioned labels)

| Table | Key columns | Notes |
|---|---|---|
| `service_channels` | id, code, label, branch_requirement (`required`/`optional`/`hidden`), allows_other_text, is_other, is_active, sort_order | Seed per D-12: WALK_IN required; MOBILE_APP, WEBSITE, PHONE, WHATSAPP, AGENT_BROKER hidden; OTHER optional |
| `insurance_products` | id, code, official_name, label, is_other, is_active, show_in_survey, sort_order | Seed per COMPANY CONTEXT |
| `improvement_factors` | id, code, label, is_other, is_none, flag_on_select (default **true**, false for `is_none`), auto_create_case (default **false**), default_priority, is_active, sort_order | toggles implement D-19 |
| `case_categories` | id, code, label, is_active | seeded from improvement factors + "Service complaint", "Data/privacy concern", "Other" [A-71] |

### Survey definition & versioning

| Table | Key columns | Notes |
|---|---|---|
| `survey_versions` | id, version_no, status (`draft`/`published`/`retired`), definition jsonb, catalogue_snapshot jsonb, scale_signature jsonb, prepared_by, approved_by, published_at, checksum | Published rows immutable (trigger); exactly one `published` (partial unique index); four-eyes publish [A-96] |

A session binds to the version published **when the session starts**, and
keeps it even if a new version is published mid-session [A-73].

### Survey access: sources and QR points [D-07, D-33]

| Table | Key columns | Notes |
|---|---|---|
| `survey_sources` | id, code (`sms`, `direct`, `qr`), label, is_active | `sms` = the link Serene sends by SMS (`?src=sms`); `direct` = no or unknown src; `qr` = any QR point |
| `qr_points` | id, code (short, e.g. `K7P2`, unique, immutable), label (e.g. "Tema C25 counter poster"), placement_note, is_active, created_by, created_at, deactivated_at | **No branch foreign key on purpose.** The poster's location is never used as issuing-branch attribution [REQ §2.4, Rule 2]. Placement is free-text for operations only [A-130] |

### Survey sessions, responses, telemetry (schema `survey`)

| Table | Key columns | Notes |
|---|---|---|
| `sessions` | id, session_secret_hash (bytea, unique), device_id_hash (bytea), source_id, qr_point_id (nullable), survey_version_id, opened_at, interactive_at, last_activity_at, current_page, draft_answers jsonb, answer_seq int, pages_displayed, navigated_back bool, changed_previous_answer bool, abandoned_at_page, status (`active`/`submitted`/`abandoned`/`expired`), turnstile_passed_at, user_agent_class | One draft per session, updated in place, so changing an answer never creates a duplicate [REQ §2.3]. Sessions expire after 24 h inactivity (`expired`, last page kept for abandonment stats) |
| `responses` | id, reference (`FB-YYYY-NNNNNN`), session_id **UNIQUE**, survey_version_id, source_id, qr_point_id, service_channel_id, service_channel_other_text varchar(80), branch_status (`selected`/`other`/`not_applicable`/`not_provided`), issuing_branch_id, issuing_branch_other_text varchar(80), region_id_at_submission, insurance_product_id, insurance_product_other_text varchar(80), csat_score CHECK 1–5, ces_score CHECK 1–5, nps_score CHECK 0–10, nps_class (generated), improvement_factor_id, improvement_other_text varchar(200), comment text CHECK ≤ 1000, contact_consent bool NOT NULL default false, opened_at, interactive_at, submitted_at, completion_duration_ms, created_at | **No UPDATE/DELETE** for any application role (trigger + REVOKE); only `retention_redact()` may redact text, with an audit entry [REQ §4.3]. CHECKs: `branch_status='selected' ⇔ issuing_branch_id IS NOT NULL`; `branch_status='not_applicable'` when the bound version's rule hid the field. `not_provided` arises only for channels where branch is optional (Other) and was left blank. There is no "unknown" status, because "I'm not sure" is not offered [D-13] |
| `response_device_cooldowns` | device_id_hash, last_submitted_at, response_id | Enforces the per-device cooldown (default 24 h, configurable) [A-123] |
| `attribution_corrections` | id, response_id, original_branch_id, corrected_branch_id, reason, proposed_by, approved_by, created_at | FR-41; view `analytics.v_responses_effective` exposes the effective branch and `is_corrected` [A-64] |
| `events` | bigint id, session_id, type (`opened`,`interactive`,`page_view`,`answer_set`,`answer_changed`,`back`,`validation_blocked`,`submit_attempt`,`submit_success`,`submit_error`,`cooldown_blocked`,`turnstile_failed`), page, client_ts, server_ts, detail jsonb | monthly partitions; 13-month retention; best effort [REQ §12] |

Device id [A-123]: a random 128-bit value in a long-lived first-party
cookie (`__Host-svd`, 1 year, httpOnly), stored only as an HMAC. No
fingerprinting. Clearing cookies resets it, and that is accepted: the goal
is to deter casual repeats, not to identify people.

### Consented contact details (schema `pii`) [D-15]

| Table | Key columns | Notes |
|---|---|---|
| `contact_requests` | id, response_id (unique), phone_e164_enc, phone_hmac, first_name_enc (nullable), consent_text_version, created_at, erased_at | Exists only when the customer switched the toggle on. Envelope encryption: data key encrypted with a key held as a Supabase Vault secret [A-19]. Readable only via `pii.reveal_contact(case_id, reason)`, which checks the permission, writes an audit entry and returns the decrypted value |

### Flags, cases, SLA

| Table | Key columns | Notes |
|---|---|---|
| `flag_rules` | id, key (`low_csat`,`improvement_factor`,`comment_keyword`), params jsonb (e.g. `{csat_lte:2}`, keyword list), flag_enabled (default true), auto_create_case (default false), default_priority, is_active | D-19: "Flag" and "Auto-create case" toggles per rule; the improvement-factor rule defers to each factor's own toggles |
| `response_flags` | id, response_id, rule_id, reason, status (`open`/`dismissed`/`converted`), reviewed_by, reviewed_at, dismissal_reason | unique (response_id, rule_id) |
| `cases` | id, reference (`CASE-YYYY-NNNNN`), response_id NOT NULL, has_contact_consent (copied), branch_id, service_channel_id, insurance_product_id (snapshots), category_id, priority (`P1`–`P4`), description, department_id, assigned_officer_id, status (`new`,`assigned`,`in_progress`,`resolved`,`closed`), queue (`cx_central` default [D-17]), is_escalated, escalation_level, sla_policy_id, target_resolution_at, first_response_at, resolved_at, closed_at, resolution_notes, corrective_action, follow_up_outcome (`not_required`,`contacted_resolved`,`contacted_unresolved`,`unreachable`,`declined`), reopen_count, version | REQ §8.2; one non-closed case per response [A-75]; transitions only through `case_*` functions |
| `case_activities` | bigint id, case_id, actor_user_id, type (`created`,`assigned`,`reassigned`,`status_changed`,`priority_changed`,`note`,`investigation`,`escalated`,`de_escalated`,`corrective_action`,`resolved`,`closed`,`reopened`,`sla_warning`,`sla_breached`,`follow_up_recorded`,`contact_revealed`), from_value, to_value, body, created_at | append-only |
| `sla_policies` | priority, target_working_days, warning_pct (75), clock (`business`) | Seed per D-18: P1 1, P2 3, P3 5, P4 10 working days |
| `business_calendar` / `holidays` | working days Mon–Fri, hours 08:00–17:00, tz Africa/Accra; holiday dates | Ghana public holidays seeded for the current and next year; System Admin maintains [D-18, A-134] |

### Targets, alerts, notifications, reports

| Table | Key columns | Notes |
|---|---|---|
| `targets` | id, metric (`csat_pct`,`csat_avg`,`nps`,`ces_avg`,`completion_rate`,`negative_rate`,`resolution_time_days`,`sla_compliance_pct`), scope_type (`organisation`/`region`/`branch`/`channel`/`product`), scope_id, target_value, direction, effective_from, effective_to | REQ §13.1 (response rate replaced by completion rate [D-33]) |
| `alert_rules` | id, name, type, scope, params jsonb, severity, recipient_roles[], recipient_department_ids[], recipient_user_ids[], cooldown_minutes, is_active | channels: email + in-app [D-30] |
| `alert_events` | id, rule_id, scope, observed_value, threshold_value, window, fired_at, status, acknowledged_by | dedupe by rule + scope + window |
| `notifications` | id, user_id, type, title, body, link, created_at, read_at | in-app |
| `email_log` | id, to_user_id, template, status, provider_message_id, attempts, sent_at | daily budget counter [A-129] |
| `report_schedules` | id, report_key, frequency, filters jsonb, formats[] (`pdf`,`xlsx`), recipient_user_ids[], owner_id, next_run_at, is_active | D-26 |
| `report_files` | id, report_key, schedule_id / requested_by, filters, format, status, storage_path, row_count, contains_pii, expires_at | files expire after 30 days (scheduled) or 7 days (exports) [A-76] |

### Audit & settings

| Table | Key columns | Notes |
|---|---|---|
| `audit.log` | bigint id, occurred_at, actor_type (`user`/`system`), actor_id, action, entity_type, entity_id, before jsonb, after jsonb (redacted), ip, user_agent, request_id, prev_hash, hash | INSERT-only; SHA-256 hash chain; monthly partitions; copied nightly with the backup to R2 [A-77] |
| `settings` (+ `settings_history`) | key, value jsonb, updated_by, updated_at | device cooldown hours, session expiry hours, minimum sample threshold, company display name, support phone/email, keyword list, email daily budget |
| `ops.outbox` | pgmq queue `events` | transactional outbox |
| `ops.quota_snapshots` | taken_at, db_bytes, storage_bytes, emails_today, worker_requests_today | feeds free-tier alerts [A-129] |

### Analytics roll-ups (schema `analytics`) [A-32]

| Table | Grain | Measures |
|---|---|---|
| `responses_daily` | local_date (Africa/Accra) × scale_signature × source_id × qr_point_id × branch_status × issuing_branch_id × region_id × service_channel_id × insurance_product_id × improvement_factor_id | n, csat_hist[5], ces_hist[5], nps_hist[11], completion_ms_hist (fixed buckets), completion_ms_sum |
| `sessions_daily` | local_date × source_id × qr_point_id | opened, interactive, reached_page_n[5], submitted, abandoned_by_page[5], cooldown_blocked, turnstile_failed |

Every metric for any filter combination is computed exactly from sums of
these counters. Roll-ups update from the outbox within ≤ 60 s of
submission and are rebuilt nightly for the trailing 35 days. With ~13
branches the tables stay small, so dashboard queries run against them
directly with no application cache.

Response-rate note [D-33]: without invitations there is no denominator of
customers who were asked, so **no "response rate" is computed anywhere**.
The funnel metric is the completion rate, labelled "Completion rate
(submitted ÷ started surveys)".

### Key indexes

* `survey.sessions(session_secret_hash)` unique; `(status,
  last_activity_at)` for expiry sweeps; `(device_id_hash)`.
* `survey.responses(session_id)` unique; `(submitted_at)`;
  `(issuing_branch_id, submitted_at)`; `(service_channel_id, submitted_at)`;
  `(insurance_product_id, submitted_at)`; partial `(csat_score) WHERE
  csat_score <= 2`.
* `cases(status, target_resolution_at)`; `(assigned_officer_id, status)`;
  `(branch_id, status)`; `(queue, status)`.
* Roll-ups: composite primary key on the grain.

### Row-Level Security [REQ §9.3, A-79]

* Every `public` table has RLS enabled with explicit policies; a CI check
  fails if any table lacks RLS (`supabase db lint` + a custom pgTAP test).
* Branch scoping: `analytics.*` views, `responses` views, `cases` and
  `response_flags` filter to `auth_branch_ids()` for branch-scoped users,
  and to everything when `app_org_scope` is true.
* Branch Managers may see named rankings across branches [D-24]. They get
  aggregate rows for other branches (n, CSAT, NPS, CES, negative rate) but
  never other branches' records or comments [D-34]. This uses a dedicated
  view `analytics.v_branch_ranking`.
* `pii` is not exposed through the Data API; only `pii.reveal_contact()`
  and `pii.erase_contact()` can read or change it.
* RLS is defence-in-depth, and functions still check permissions
  explicitly.

### Data retention [D-16]

| Data | Retention | Action at end |
|---|---|---|
| Unsubmitted sessions | 30 days after last activity | delete (aggregate counters already in `sessions_daily`) |
| Device cooldown rows | 30 days | delete |
| Consented phone numbers and names | 12 months after the response, or on erasure request | erase, set `erased_at` |
| Free-text comments and "other" text | 24 months | redact to `[removed]` |
| Structured ratings and dimensions | Indefinitely (non-identifying) | keep |
| Cases and activities | 7 years after closure | de-identify the contact link |
| Audit log | 7 years | archive to R2 |
| Survey telemetry events | 13 months | delete |
| Report/export files | 30 / 7 days | delete |

## 2.4 API design overview

Conventions [A-11]: JSON; `application/problem+json` (RFC 9457) errors with
stable `type` codes; cursor or keyset pagination; explicit filter
parameters; ISO-8601 UTC timestamps; `Idempotency-Key` on survey submit.

### Public Survey API (Cloudflare Worker, `feedback.<domain>`)

| Method & path | Purpose |
|---|---|
| `GET /` and `GET /?src=sms` | SSR Page 1. Creates a session (or resumes the cookie's active session) via `survey.start_session(src, qr_point, device_hash)`; sets `__Host-svs` (session, 24 h) and `__Host-svd` (device, 1 year). If the device is inside its cooldown, renders the "already shared" page instead [A-123] |
| `GET /q/{point-code}` | Same as above with source `qr` and the QR point recorded; unknown or inactive codes still open the survey (source "qr", point null, event logged) [A-130] |
| `GET /privacy` | Privacy notice |
| `PATCH /api/v1/survey/answers` | Merge partial answers `{seq, answers}`; last-write-wins by `seq`; validated against the bound version; clears branch when the channel hides it [REQ §2.4] |
| `POST /api/v1/survey/events` | Batched telemetry (sendBeacon, 204) |
| `POST /api/v1/survey/submit` | Full answers + Turnstile token + `Idempotency-Key`. The Worker verifies Turnstile, then calls `survey.submit(...)`, which in one transaction re-validates, enforces one response per session and the device cooldown, inserts the response (+ contact request when consented), marks the session submitted, enqueues the outbox event and returns `{reference}`. Repeat calls return the same reference; a submit after cooldown block returns `409 already_shared` |
| `GET /healthz` | Liveness, plus a cheap DB call (used by the keep-alive Cron Trigger) |

### Portal API (Supabase Data API + RPC, user JWT, RLS)

Grouped by module. Reads are Data API selects on views; every write or
multi-step rule is an RPC that checks `auth_has_perm()`.

* **M01 identity:** Supabase Auth (`signInWithPassword`, `resetPasswordForEmail`,
  `updateUser`); RPCs `admin_invite_user`, `admin_set_grants`,
  `admin_suspend_user`, `admin_reactivate_user`, `me_complete_first_login`.
  Invites go through an Edge Function using the Admin API, because the
  service key must not reach the browser.
* **M02/M03 directory & catalogues:** Data API CRUD on `regions`,
  `branches`, `departments`, `service_channels`, `insurance_products`,
  `improvement_factors`, `case_categories` (write policies require
  `config.*`); RPCs `branch_deactivate`, `catalogue_reorder`.
* **M04 surveys:** `survey_version_create_draft`, `survey_version_update`,
  `survey_version_validate`, `survey_version_request_publish`,
  `survey_version_approve_publish`, `survey_version_preview_link`.
* **M05 access:** Data API on `qr_points`; Edge Function
  `render-qr-poster` (PDF A4/A5 + SVG).
* **M08/M09 analytics:** RPCs `analytics_summary(filters)`,
  `analytics_breakdown(dimension, filters)`, `analytics_trend(metric,
  granularity, filters)`, `analytics_compare(branch_ids, filters)`,
  `analytics_distribution(metric, filters)`, `analytics_funnel(filters)`,
  `analytics_cases(filters)`, `analytics_completion_time(filters)`. Each
  returns `{value, n, low_sample, benchmark, target, period}` per row.
* **M10 records:** view `v_response_records` (RLS-scoped);
  `response_propose_correction`, `response_approve_correction`.
* **M11 flags & cases:** `flag_dismiss`, `flag_convert_to_case`,
  `case_create`, `case_assign`, `case_start`, `case_add_note`,
  `case_record_investigation`, `case_escalate`, `case_de_escalate`,
  `case_resolve`, `case_close`, `case_reopen`, `case_record_follow_up`,
  `pii.reveal_contact(case_id, reason)`.
* **M12:** Data API on `targets`, `alert_rules`; `alert_acknowledge`,
  `alert_resolve`.
* **M13:** Edge Function `export` (POST filters + format → job id; file in
  Storage; signed URL), `generate-report` (scheduled or on demand);
  Data API on `report_schedules`, `report_files`.
* **M14:** Data API on `notifications`; `notifications_mark_read`.
* **M15:** view `audit.v_log` (auditor/admin); `audit_verify_chain()`.
* **M16:** `privacy_find_contact(phone)`, `privacy_erase_contact(id,
  reason)`.
* **M17:** Data API on `settings`; `ops.v_quota_status`.

## 2.5 Project structure [A-80]

```text
/
├─ apps/
│  ├─ survey-worker/     # Hono Worker: SSR pages, /api/v1/survey/*, cron
│  └─ portal/            # React + Vite SPA
├─ supabase/
│  ├─ migrations/        # SQL migrations (schemas, tables, RLS, functions)
│  ├─ functions/         # Edge Functions: send-email, export,
│  │                     #   generate-report, render-qr-poster, invite-user
│  ├─ seed/              # catalogue + directory seeds (no demo data in prod)
│  ├─ tests/             # pgTAP: RLS, functions, metrics, transitions
│  └─ config.toml
├─ packages/
│  ├─ contracts/         # Zod schemas, generated DB types, error codes
│  ├─ metrics/           # CSAT/NPS/CES/rates maths (mirrors SQL; cross-tested)
│  ├─ survey-engine/     # definition types, rule evaluator, validators
│  ├─ ui/                # design tokens, Tailwind preset, shared components
│  └─ i18n/              # English message catalogue (ICU)
├─ tests/
│  ├─ e2e/               # Playwright (survey + portal)
│  ├─ load/              # k6
│  └─ a11y/              # axe suites
├─ docs/
│  ├─ architecture/  ├─ decisions/  ├─ runbooks/  ├─ privacy/
│  └─ traceability.md
└─ .github/workflows/    # ci.yml, deploy.yml, backup.yml
```

## 2.6 Coding standards [A-81]

* **Files:** kebab-case; React components PascalCase exports; tests
  `*.test.ts` beside source; SQL migrations `YYYYMMDDHHMM_description.sql`.
* **Functions/vars:** camelCase in TS, snake_case in SQL; booleans
  `is/has/can`; domain acronyms CSAT, NPS, CES, SLA allowed.
* **DB:** snake_case, plural tables, `_id` FKs, `_at` timestamps; every
  SECURITY DEFINER function sets `search_path = ''` and schema-qualifies
  names.
* **API:** kebab-case paths, camelCase JSON in the Worker API, snake_case
  in Data API responses (as generated); ISO-8601 UTC.
* **Errors:** typed domain errors mapped to problem+json in the Worker;
  RPCs raise `SQLSTATE` codes mapped to user-safe messages in
  `packages/contracts`; never leak stack traces.
* **Logging:** structured JSON; never log session secrets, device ids,
  phone numbers, names, comments or passwords.
* **Docs:** TSDoc on public functions; SQL `COMMENT ON` for every table,
  column with business meaning, and function; ADR for every changed `[A-]`.
* TypeScript `strict`; no `any` in domain code; Prettier + ESLint +
  sqlfluff in CI.

## 2.7 Core flows

**Core Flows** — every important flow, including:

```text
F1  Survey visit via SMS link (?src=sms) → session → Page 1 … Page 5 →
    Turnstile → submit → confirmation.
F2  Survey visit via QR poster (/q/<code>) → same as F1 with QR source.
F3  Page 1 logic: channel → (walk-in → branch required; Other → branch
    optional; anything else → branch hidden and cleared) → product →
    Continue.
F4  Back navigation & answer change: Back on any page ≥ 2 restores answers;
    changing a rating updates the draft (no duplicate); changing channel
    re-evaluates and clears branch.
F5  Interruption & resume within 24 h on the same browser.
F6  Submission integrity: double tap, two tabs, flaky-network retries,
    back button after submit → one response, same reference.
F7  Repeat attempt on the same device within the cooldown → "already
    shared" page; after the cooldown → new survey allowed.
F8  Contact consent: toggle on → phone (+ optional first name) → stored
    encrypted in pii → visible only via a case.
F9  Flag → CX central queue → case → assign → investigate → resolve →
    close (reopen path); auto-case where toggled on (D-19).
F10 SLA warning at 75% and breach → email + in-app → auto-escalate one
    level → escalation chain (D-20).
F11 Executive dashboard → branch → drill-down to records → record → back
    preserves filters (REQ §17.1).
F12 Survey configuration: draft → edit → validate → preview → request
    publish → Executive approves → new sessions bind to it.
F13 QR point: create → download poster → print → place → monitor scans →
    deactivate.
F14 Branch deactivation: hidden from survey, history intact, grants
    reviewed.
F15 Export / scheduled report (PDF + XLSX) → Storage → email link →
    signed download → audit entry.
F16 Staff sign-in: invite → set password → sign in → forced password
    change on first sign-in (seed admin too) → lockout after repeated
    failures → reset by email.
F17 Alert evaluation → alert event → email + in-app → acknowledge/resolve.
F18 Privacy: find consented contact by phone → erase; scheduled retention.
F19 Operations: nightly backup → R2; monthly restore test; daily keep-alive;
    quota snapshot → threshold alert.
```

Also document: guest flow (survey respondent = F1–F8), registered-user flow
(N/A — customers have no accounts), staff flow (F9–F11, F15), administrative
flow (F12–F14, F16, F18, F19), failure scenarios, recovery scenarios.

**Failure & recovery scenarios to design and test [A-82]:**

| Scenario | Required behaviour |
|---|---|
| Supabase paused or unreachable | Survey shows "We can't take feedback right now — please try again later" (no form that would lose answers); the uptime monitor alerts; runbook to restore |
| Customer loses connectivity mid-survey | Answers kept in memory + `sessionStorage`; background sync retries; submit shows the offline state and retries on reconnect |
| Customer opens the link on two devices | Two separate sessions (no identity to merge); both may submit if neither device is in cooldown. Accepted limitation of D-33 |
| Turnstile unavailable | Retry once; if it still fails, accept the submission with `turnstile_passed_at = null`, mark it `unverified`, and exclude it from dashboards by default (with a filter to include) [A-135] |
| Survey version published mid-session | Session keeps its bound version |
| Branch deactivated mid-session | Selection accepted and flagged for CX review [A-83] |
| Outbox/roll-up lag | Dashboard shows "Data updated n min ago"; alert when lag > 15 min |
| Email budget exhausted | Emails queue until the next day; in-app notifications still delivered; System Admin warned in-app |
| Export too large for an Edge Function run | Chunked pages appended to the file in Storage; hard cap 200k rows with a message to narrow filters |
| Audit-chain verification fails | Email to System Admin + Auditor; incident runbook |
| Backup job fails | GitHub Actions failure email + in-app alert to System Admin |

---

# PHASE 3 — IMPLEMENTATION

Do not attempt to build the entire system in one uncontrolled operation.
Break implementation into logical milestones — **[FUSED]** for a resumed
project, milestones are derived from the GAP AUDIT PROTOCOL output
(everything `PARTIAL`, `MISSING`, or an `UNDOCUMENTED GAP`), sequenced by
dependency, not just copied from the original plan's milestone list.

Each milestone should contain:

```text
MILESTONE: [Name]
OBJECTIVE: [What this milestone accomplishes]
DEPENDENCIES: [What must already exist]
TASKS:
  1. [...]
  2. [...]
  3. [...]
FILES/MODULES AFFECTED: [...]
DATABASE CHANGES: [...]
API CHANGES: [...]
UI CHANGES: [...]
TESTS: [...]
SECURITY CHECKS: [...]
VERIFICATION CRITERIA: [...]
COMPLETION STATUS: [Pending / In Progress / Complete]
```

Implement features in dependency order. Do not build a feature on top of
unstable architecture when the underlying foundation should be completed
first.

## [POPULATED] Milestone roadmap

Scope is **Phase 1 + Phase 2** of [REQ §18] [D-02]. Phase 3 items (AI
classification, sentiment, emerging-issue detection, automated summaries,
integrations) are not built, but the design keeps hooks for them (comments
isolated in their own column, outbox events, a schema that can take
`system_attributes` later). Release gates: **R1 (MVP) after MS-09**, **R2
(Operational) after MS-13**.

```text
MILESTONE: MS-00 Phase 0 blueprint
OBJECTIVE: Turn this prompt + REQ into the committed plan in /docs.
DEPENDENCIES: None (all decisions made).
TASKS: 1. Steps 0–11 of FIRST RESPONSE REQUIREMENT. 2. ERD, state machines,
  sequence diagrams. 3. ADRs: platform (D-27), RLS model, roll-ups, open-link
  session model (D-33), free-tier mitigations. 4. Traceability matrix
  (REQ "must" statements, FR-01′…FR-46, overrides) → milestone → tests.
  5. EXTERNAL ACTION NEEDED list. 6. Trace an SVG master of the logo.
FILES/MODULES AFFECTED: /docs/**
DATABASE CHANGES: none (design only)   API CHANGES: contract drafts
UI CHANGES: low-fidelity wireframes of every screen in STEP 7
TESTS: n/a   SECURITY CHECKS: threat model (STRIDE) for the open survey
  (spam, ballot-stuffing, scraping), portal and service-role key handling
VERIFICATION CRITERIA: Nii reviews and approves /docs plan
COMPLETION STATUS: Pending

MILESTONE: MS-01 Platform foundation
OBJECTIVE: Reproducible repo, local stack, CI, staging + production
  projects, observability, backups.
DEPENDENCIES: MS-00; X-01, X-02, X-03, X-06, X-07
TASKS: pnpm workspace; Supabase CLI local stack; Wrangler config with
  staging/production environments; Vite portal skeleton; Hono Worker
  skeleton; env/secret validation (fail fast); Sentry; /healthz;
  keep-alive Cron Trigger; GitHub Actions ci/deploy/backup; R2 bucket;
  nightly encrypted pg_dump; quota snapshot job; free-tier limits ADR
  (re-check current limits); seed scripts (production seeds contain only
  real catalogues, never demo data [REQ §6.2]).
DATABASE CHANGES: schemas, extensions (pgcrypto, pg_cron, pg_net, pgmq,
  supabase_vault), settings, audit.log, ops tables
API CHANGES: /healthz
UI CHANGES: `packages/ui` tokens (E1–E10), logo assets
TESTS: CI green on skeleton; pgTAP harness; restore drill #1
SECURITY CHECKS: secret scanning; service-role key present only in Worker
  secrets and GitHub environment secrets; RLS-on-every-table lint
VERIFICATION CRITERIA: clean clone → `pnpm dev` works; staging deploy from
  main; backup appears in R2 and restores locally
COMPLETION STATUS: Pending

MILESTONE: MS-02 Identity, access control, audit (M01, M15 core)
OBJECTIVE: Staff sign-in, roles and branch scopes, RLS, audit log.
DEPENDENCIES: MS-01
TASKS: Supabase Auth config (sign-up off, password policy, Resend SMTP);
  seed admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD with
  must_change_password = true; invite flow (Edge Function); forced first
  password change; lockout; custom access-token hook; roles, permissions,
  grants; helper functions; RLS policies; audit triggers + hash chain;
  user management UI; sign-in screens (E8).
DATABASE CHANGES: profiles, roles, permissions, role_permissions,
  user_role_grants, audit policies
API CHANGES: identity RPCs; invite-user function
UI CHANGES: sign-in, set/reset password, users list/detail, grants editor,
  audit viewer
TESTS: generated permission matrix test (every role × every RPC/view ×
  scope); RLS pgTAP tests per role
SECURITY CHECKS: brute force, enumeration-safe messages, JWT claim
  tampering, revoked grant takes effect within 15 min
VERIFICATION CRITERIA: matrix 100% pass; audit chain verifies; seed
  password is not found anywhere in the repo or logs
COMPLETION STATUS: Pending

MILESTONE: MS-03 Directory, catalogues, settings (M02, M03, M17 settings)
DEPENDENCIES: MS-02
TASKS: CRUD + deactivate + reorder; seeds (13 branches, 7 regions, 8 +
  Other products, 7 channels with D-12 rules, 8 improvement factors with
  D-19 toggles, departments, Ghana holidays); settings UI.
TESTS: code immutability; deactivation keeps history; audit entries
VERIFICATION CRITERIA: seeds match COMPANY CONTEXT exactly
COMPLETION STATUS: Pending

MILESTONE: MS-04 Survey definition & versioning (M04)
DEPENDENCIES: MS-03
TASKS: definition JSON schema; `packages/survey-engine` (visibility,
  required, clearing, validation), mirrored in SQL validation inside
  `survey.submit`; v1 definition = REQ §2.4–§2.8 with D-12/D-13/D-15;
  draft/validate/preview/publish with four-eyes approval.
TESTS: property-based rule tests; JS and SQL validators agree on 10k
  generated answer sets; guardrails (≤ 5 pages, no required free text
  except the consent-dependent phone, no identity questions)
COMPLETION STATUS: Pending

MILESTONE: MS-05 Survey access & sources (M05)
OBJECTIVE: Public link, source codes, QR points and posters, abuse controls.
DEPENDENCIES: MS-04, X-04 (Turnstile site key)
TASKS: session start/resume; source parsing (`?src=sms`, `/q/<code>`);
  device cookie + cooldown; Turnstile; Cloudflare rate-limiting rule; QR
  point admin; `render-qr-poster` (A4 + A5 PDF with logo, headline, QR,
  short URL fallback, "takes under 1 minute"); SMS link guidance page for
  Serene's SMS team (exact link and suggested wording).
TESTS: cooldown boundaries; inactive QR; malformed src; burst of 20
  submits/s from one IP (carrier NAT) is not blocked; 100/s is
COMPLETION STATUS: Pending

MILESTONE: MS-06 Customer survey & response capture (M06, M07)
DEPENDENCIES: MS-04, MS-05
TASKS: survey Worker pages 1–5; tap-to-advance; Back; progress; autosave;
  resume; consent toggle + phone field; Turnstile; submit with
  idempotency; confirmation; already-shared page; privacy notice;
  telemetry; no-JS fallback.
DATABASE CHANGES: survey.sessions, survey.responses (+ immutability),
  response_device_cooldowns, pii.contact_requests, survey.events
TESTS: REQ §17.2 acceptance test automated; e2e on 6 viewports; throttled
  network; 50 parallel submits on one session → one row; a11y (axe +
  TalkBack + VoiceOver)
SECURITY CHECKS: cookies `__Host-`, CSP, no service key in the bundle,
  phone encrypted at rest
VERIFICATION CRITERIA: performance budget met in Lighthouse CI; scripted
  completion median < 25 s
COMPLETION STATUS: Pending

MILESTONE: MS-07 Analytics engine (M08)
DEPENDENCIES: MS-06
TASKS: `packages/metrics` + SQL equivalents; roll-ups + outbox updater +
  nightly rebuild; filter model; low-sample logic; benchmarks; targets;
  scale-signature guard; analytics RPCs.
TESTS: golden-dataset tests: roll-up results equal brute-force SQL on raw
  rows for 1,000 random filter combinations; TS and SQL metric functions
  agree; 100% coverage on metrics
SECURITY CHECKS: branch managers get aggregates only for other branches
VERIFICATION CRITERIA: analytics RPC p95 ≤ 800 ms on 600k synthetic
  responses (staging only)
COMPLETION STATUS: Pending

MILESTONE: MS-08 Dashboards & records (M09, M10)
DEPENDENCIES: MS-07
TASKS: app shell (E7); global filters in the URL; KPI cards; charts;
  comparison table; source funnel; drill-down; record drawer; scoped
  branch-manager views.
TESTS: REQ §17.1 acceptance test automated; KPI = table = chart for the
  same filters; visual regression
VERIFICATION CRITERIA: dashboard ≤ 3 s on throttled "Fast 4G" laptop
COMPLETION STATUS: Pending

MILESTONE: MS-09 Exports, privacy, go-live (M13 exports, M16) — R1
DEPENDENCIES: MS-08, X-09, X-11
TASKS: CSV/XLSX/PDF exports; signed URLs; formula-injection escaping;
  retention jobs; contact erase tooling; restore drill; load test;
  security checklist; production deploy; runbooks; usability test with
  representative customers (REQ §12) and fixes; print and place first
  QR posters.
VERIFICATION CRITERIA: every R1 "must" traced to passing tests; restore
  evidence; usability targets met (≥ 90% ≤ 60 s, median ≤ 40 s)
COMPLETION STATUS: Pending

MILESTONE: MS-10 Flags & case management (M11)
DEPENDENCIES: R1
TASKS: flag rules with Flag / Auto-case toggles (D-19); CX central queue
  (D-17); case functions & state machine; assignment; escalation chain
  (D-20); SLA working-day clock with Ghana holidays (D-18); activity
  timeline; contact reveal with consent; resolution metrics.
TESTS: transition matrix; optimistic-lock conflicts; SLA maths across
  weekends and holidays
COMPLETION STATUS: Pending

MILESTONE: MS-11 Targets, alerts, notifications (M12, M14)
DEPENDENCIES: MS-10
TASKS: targets with effective dating; 7 alert types; evaluator; cooldowns;
  email + in-app; preferences; email budget guard.
COMPLETION STATUS: Pending

MILESTONE: MS-12 Scheduled reports (M13 schedules)
DEPENDENCIES: MS-11
TASKS: daily/weekly/monthly/quarterly reports in PDF + XLSX (D-26) via
  Edge Function; email with secure link.
COMPLETION STATUS: Pending

MILESTONE: MS-13 Operational hardening — R2
TASKS: attribution corrections (FR-41); repeat-complaint metric; expanded
  audit views; performance and security re-test; restore drill; free-tier
  review with upgrade recommendation if triggers hit; documentation
  complete.
COMPLETION STATUS: Pending
```

---

# IMPLEMENTATION DISCIPLINE

For every substantial feature:

1. Understand the requirement.
2. Identify affected modules.
3. Check existing architecture.
4. Check existing code before creating new code.
5. Determine dependencies.
6. Design the solution.
7. Implement it.
8. Test it.
9. Verify edge cases.
10. Review security implications.
11. Review performance implications.
12. Verify UI responsiveness.
13. Document important decisions.
14. Only then mark it complete.

Do not unnecessarily rewrite working code. Prefer incremental improvements
over destructive rewrites.

---

# [FUSED] GAP-PATCHING & TIER-ONE REMEDIATION PROTOCOL

Whenever, during implementation, you discover that a portion of the
implementation plan was omitted, skipped, or only partially delivered in
prior work — or you discover a gap the plan never even anticipated — resolve
it under this protocol rather than leaving it as a known issue:

1. **Do not ask permission to fix obvious quality gaps.** If the fix is the
   kind of thing any tier-one, grade-A build would already have (proper
   empty/error states, input validation, sane loading behavior, an obvious
   missing index, a missing confirmation step on a destructive action), just
   implement it, using the pattern you'd see in respected production
   software in the same category.
2. **Do ask before proceeding** when the fix would materially change scope,
   architecture, cost, or an external dependency (see EXTERNAL DEPENDENCY
   PROTOCOL below). **[POPULATED]** For this project that explicitly
   includes: anything that adds a question, page or required interaction to
   the survey (REQ §1.2, §16); anything that needs a paid plan; and
   anything that reintroduces per-customer invitations (D-33).
3. **Always disclose what you patched.** Every patch, however small, is
   reported — silently fixing something and saying nothing about it is not
   acceptable, because the person relying on this system needs an accurate
   picture of what changed and why. Use this shape:

```text
## GAP PATCHED

LOCATION: [module/file/flow]
GAP FOUND: [what was missing or broken]
FIX APPLIED: [what was implemented, referencing the tier-one pattern used]
WHY THIS PATTERN: [why this matches recognized production-grade practice]
RISK IF UNPATCHED: [what would have gone wrong for real users]
```

4. Patches must still satisfy the full COMPLETION STANDARD below — a patch
   that itself becomes a new half-finished feature is not acceptable.

---

# BUSINESS LOGIC

All critical business rules must be enforced server-side. Never rely solely
on frontend validation for: authorization, prices, permissions, ownership,
availability, inventory, payments, discounts, roles, state transitions,
sensitive operations. The frontend improves user experience; the backend
enforces correctness.

**[POPULATED] Server-side enforcement list for this project** (in SQL
functions and RLS, not in the browser): session validity and expiry;
device cooldown; Turnstile verification (Worker); one response per
session; survey-version binding; every answer value against the bound
version's options and ranges; the walk-in branch rule and clearing;
mandatory-field rules; the consent-dependent phone requirement and Ghana
phone validation; free-text length limits; response immutability; branch
scoping of every read; contact-detail access; case state transitions and
who may perform them; SLA computation; target and alert-rule
authorisation; export permissions; metric formulas (the client renders the
server's values and never computes an authoritative KPI).

---

# DATA INTEGRITY

Protect against race conditions, duplicate records, double submissions,
double bookings, conflicting updates, invalid state transitions, and partial
transactions. Use database transactions, row locking, unique constraints,
foreign-key constraints, idempotency, validation, and atomic operations
where required by the business domain.

**[POPULATED] Specific mechanisms:**

| Risk | Mechanism |
|---|---|
| Double submit / two tabs / retries | `UNIQUE(responses.session_id)` + `SELECT … FOR UPDATE` on the session row inside `survey.submit` + Idempotency-Key replay returning the original reference |
| Repeat submissions from one device | `response_device_cooldowns` checked and updated in the same transaction (default 24 h) |
| Automated / spam submissions | Turnstile verification before the RPC; Cloudflare rate-limiting rule; per-session write limits in SQL; unverified submissions excluded by default |
| Draft answer races | monotonic `answer_seq`; stale writes ignored |
| Silent modification of feedback | trigger rejects UPDATE/DELETE on `survey.responses`; only `retention_redact()` may redact text, with audit |
| Survey definition changes | published versions immutable; edits create a new version |
| Case concurrent edits | optimistic locking on `cases.version` → friendly conflict "This case was updated by X — review changes" |
| Invalid state transitions | transition rules inside `case_*` functions + check trigger |
| Partial side effects | pgmq outbox in the same transaction; idempotent consumers |
| Branch attribution drift | `issuing_branch_id` + `region_id_at_submission`; corrections only via `attribution_corrections` |
| Roll-up drift | nightly rebuild + reconciliation check with alert |

---

# AUTHENTICATION & AUTHORIZATION

Implement secure authentication appropriate to **Supabase Auth email +
password for staff (no MFA for now [D-23]) and anonymous cookie sessions
for survey respondents [D-33]**.
Support, where applicable: registration, login, logout, password reset,
email verification, multi-factor authentication, session/token management,
token expiration, token rotation, account recovery.

**[POPULATED] Applicability:**
* **Registration:** none for customers [REQ §2.9]. Staff self-sign-up is
  disabled. A System Administrator invites users (Edge Function →
  Supabase Admin API invite email, valid 24 h, single use; this verifies
  the email by construction) [A-84].
* **Seed administrator [D-23, A-120]:** the first account is created by a
  one-time seed command that reads `SEED_ADMIN_EMAIL` (initially
  manuelbartimeus@gmail.com) and `SEED_ADMIN_PASSWORD` from environment
  secrets. It grants System Administrator + Executive Administrator and
  sets `must_change_password = true`. The password value must never appear
  in the repository, migrations, seed files, CI logs, this document or
  any chat. The seed command refuses to run if the account already exists.
* **Login:** email + password; minimum 12 characters; checked against a
  bundled list of common passwords; no composition rules.
* **First sign-in:** users with `must_change_password` are routed to a
  "Set a new password" screen before anything else.
* **MFA:** off by decision [D-23]. The UI and schema are MFA-ready, and
  turning on Supabase TOTP later is a configuration change plus one
  enrolment screen [A-119].
* **Sessions:** Supabase access JWT 15 min, refresh-token rotation on;
  portal idle timeout 30 min with a 2-minute warning; absolute 12 h
  re-authentication; sign-out revokes the refresh token; suspending or
  deactivating a user revokes their sessions.
* **Lockout:** 5 failed attempts → 15-minute lock (tracked in `profiles`
  via an auth hook) + email notice; enumeration-safe messages.
* **Password reset:** Supabase reset email via Resend SMTP, link valid 1 h.
* **Survey sessions:** `__Host-svs` random secret (hashed in DB), httpOnly,
  Secure, SameSite=Lax, 24 h; `__Host-svd` device cookie, 1 year [A-12,
  A-123].

Implement role-based access control, and fine-grained permissions where
necessary. Never assume that hiding a frontend button constitutes
authorization — every protected backend endpoint must independently verify
permissions.

**[POPULATED]** Permission = `resource.action` key; role → permissions;
grant = role + scope. Check = (JWT claim has permission) ∧ (row in branch
scope via RLS) ∧ (function-level re-check for sensitive actions).
Permission matrix: see M01.

---

# SECURITY

Design against relevant threats: SQL injection, XSS, CSRF, brute-force
attacks, credential attacks, replay attacks, rate abuse, privilege
escalation, session hijacking, IDOR/BOLA, clickjacking, insecure direct
object access, sensitive data exposure, misconfigured CORS, insecure file
uploads, malicious input, API abuse, secret leakage.

Implement HTTPS, secure headers, input validation, output encoding, rate
limiting, secure cookies, CSRF protection, CORS restrictions, password
hashing, secret management, permission checks, audit logging, encryption
where appropriate, dependency security, file validation.

Never expose passwords, private keys, API secrets, database credentials, or
sensitive environment variables in source code or client-side bundles.

**[POPULATED] Project-specific controls [A-18]:**

* **Baseline:** OWASP ASVS 4.0.3 Level 2 and the OWASP API Security Top 10,
  with one recorded exception: no MFA for staff [D-23]. Compensating
  controls: strong password minimum, lockout, short JWT lifetime, session
  timeouts, sign-in notification emails for new devices, audit of every
  sign-in, and a recommendation to enable TOTP before more than a handful
  of users have access (raised at MS-09, not enforced).
* **Keys:** the Supabase **service-role key** lives only in the survey
  Worker's secrets, Edge Function secrets and GitHub environment secrets.
  The portal ships only the anon key. A CI check scans built bundles for the
  service key pattern.
* **Headers:** strict CSP with nonces, HSTS, `X-Content-Type-Options`,
  `Referrer-Policy: strict-origin-when-cross-origin` (no secrets in URLs
  now that there are no tokens), `frame-ancestors 'none'`, minimal
  `Permissions-Policy`.
* **Open survey abuse [D-33]:** Turnstile (invisible/managed) on submit;
  Cloudflare rate-limiting rule (one rule on the free plan) on
  `/api/v1/survey/*`, generous enough for Ghanaian carrier NAT (shared IPs);
  SQL limits per session (≤ 60 draft writes, 1 submit) and per device
  (cooldown); payload caps (8 KB); unverified submissions excluded from
  KPIs by default; anomaly alert when submissions for one QR point or
  source exceed 5× their 30-day hourly average.
* **CSRF:** the portal uses bearer JWTs (no cookie auth to the Data API),
  so classic CSRF does not apply; the survey API requires the
  SameSite=Lax session cookie plus a same-origin `Origin` check.
* **Free text:** stored raw, rendered escaped, never as HTML; exports
  escape leading `= + - @` (formula injection).
* **Contact details:** encrypted at the field level with a Vault-held key;
  HMAC for matching; masked display (`+233 •• ••• 4821`); each reveal
  needs a reason and is audited [A-19].
* **RLS discipline:** every table has RLS; SECURITY DEFINER functions set an
  empty `search_path`; no `public` grants on `survey`, `pii`, `audit`,
  `ops`; pgTAP tests prove each role's access.
* **Secrets:** Cloudflare Worker secrets, Supabase secrets/Vault, GitHub
  environment secrets; nothing in the repo; separate per environment.
* **Supply chain:** lockfile, Renovate, `pnpm audit`/OSV in CI, GitHub
  Actions pinned by SHA.
* **Separation of duties:** granting `pii.view` requires an Executive or
  a second System Administrator to approve [A-68].
* **Security testing:** Semgrep/CodeQL, Supabase security advisor, OWASP ZAP
  baseline against staging, generated authorisation tests per role, a
  manual pre-launch checklist. A third-party penetration test is
  recommended, not required, given the free-tier budget (raised at MS-09).

---

# PERFORMANCE — EXTREMELY FAST RESPONSE TIMES [FUSED EMPHASIS]

Fast response time is a stated core requirement of this build, not a
secondary concern. Treat `PERFORMANCE_TARGETS` from the configuration block
as a hard constraint, and where none is specified, assume aggressive
tier-one targets (sub-second perceived load, sub-200ms typical API
response) and document that assumption.

Optimize: database queries (indexes, query plans, N+1 elimination), API
requests, pagination, caching (HTTP, CDN, application-level, query-level),
image and static asset delivery, code-splitting/lazy loading, background
processing for anything non-blocking, database indexes, serialization,
network payload size (compression, minimal over-fetching).

Avoid premature optimization, but identify and fix obvious bottlenecks
before production. For expensive operations, determine whether they should
be cached, paginated, batched, made asynchronous, or precomputed. Measure —
don't guess — before and after optimizing anything non-trivial (Lighthouse,
query plans, profilers), and record the before/after numbers in the relevant
verification checkpoint.

**[POPULATED] Survey techniques [A-24, A-25]:**
* The Worker renders Page 1 with the full survey definition and catalogue
  options (13 branches, 9 products, 7 channels, 8 factors ≈ 3 KB gz)
  inlined, so one request renders the survey and all five pages run
  client-side with no network on page change.
* The catalogue/definition payload is cached at the edge under the published
  version's checksum, so the Worker does not query Supabase for it on each
  visit. Session creation is the only DB call on first load.
* Inline critical CSS; one small JS bundle; no framework router; no
  third-party scripts except Turnstile, which loads asynchronously and
  only on Page 5.
* Fonts: system stack first paint; Inter subset swapped in, or system only
  if the budget is threatened.
* Answers sync with a debounced `PATCH` (≤ 1 in flight); telemetry goes as
  one beacon at submit or page hide.
* Brotli, HTTP/3, immutable hashed assets with 1-year cache; HTML
  `Cache-Control: private, no-store` (session-bound).
* `interactive_at` is recorded at hydration so completion time excludes
  load time [REQ §11.7].

**Portal techniques [A-26]:** roll-up tables; analytics RPCs return
exactly what a card or chart needs; parallel requests per dashboard;
TanStack Query caching and request de-duplication; skeletons; route-level
code splitting; ECharts loaded per chart type; virtualised tables; exports
asynchronous.

**Measurement:** Lighthouse CI budgets (fail on regression); k6 load tests
(survey 20 submits/s for 15 min against staging; dashboards 25 concurrent
users); `EXPLAIN (ANALYZE, BUFFERS)` for every analytics RPC kept in
`/docs/performance`; Cloudflare Web Analytics Web Vitals.

---

# API DESIGN

The API must be RESTful or follow the declared architecture: versioned
where appropriate, consistent, documented, secure, validated, predictable.
Use a consistent response and error structure. Document APIs using
**OpenAPI 3.1 for the survey Worker API, and a generated RPC reference
(function signatures, permissions, errors) from SQL comments for the
portal** [A-11], including authentication, request/response examples,
error responses, validation rules, pagination, filtering, permissions.

**[POPULATED] Conventions:** see PHASE 2 §2.4. Analytics responses always
include `n`, `low_sample`, `period`, `filters_applied` and a `denominator`
description. Error example:

```json
{
  "type": "https://feedback.<serene-domain>/errors/already-shared",
  "title": "Feedback already shared",
  "status": 409,
  "detail": "You've already shared your feedback today. Thank you!",
  "reference": "FB-2026-000123",
  "request_id": "01JC…"
}
```

---

# ERROR HANDLING

Never allow raw technical errors to become the primary user experience.
Implement user-friendly error messages, structured backend errors,
appropriate HTTP status codes, logging, error monitoring, recovery paths,
empty states, loading states, and retry mechanisms where appropriate. Do
not silently swallow errors.

**[POPULATED] Customer-facing copy (English) [A-86]:**

| Situation | Message | Action offered |
|---|---|---|
| Already shared (cooldown) | "You've already shared your feedback — thank you!" + reference if known | None |
| Service unavailable | "We can't take feedback right now. Please try again a little later." | Retry |
| Offline at submit | "You seem to be offline. Your answers are saved on this device — tap Submit again when you're connected." | Retry |
| Server error at submit | "We couldn't send your feedback just now. Your answers are safe — please try again." | Retry (same idempotency key) |
| Verification failed | "Please tap Submit again so we can confirm you're not a robot." | Retry (new Turnstile challenge) |
| Required field missing (Page 1) | Field-level, e.g. "Please choose how you got your policy." | Focus moves to the first missing field |
| Invalid phone (consent on) | "Please enter a Ghana mobile number, e.g. 024 123 4567, or switch off the contact option." | Fix or toggle off |

Portal errors follow the same pattern, with a collapsible "Details" showing
the request id for support.

---

# NOTIFICATIONS

```text
EMAIL:  Yes — Resend (free tier) for staff only [D-30, A-124]: account
        invitations, password resets, sign-in from a new device, case
        assignment, SLA warnings/breaches, escalations, alerts, scheduled
        reports, export ready. No customer email [D-08].
SMS:    No. The system sends no SMS. Serene sends the public survey link
        through its own SMS provider (sender ID "SERENE") [D-08, D-09].
PUSH:   No [A-87].
IN_APP: Yes — notification centre in the portal [D-30, A-65].
WHATSAPP: No [D-08].
```

Define notification events such as:

| Event | Recipients | Channels | Timing |
|---|---|---|---|
| `user.invited` | New staff user | Email | Immediate |
| `case.created` (auto or converted) | CX Administrators (central queue) [D-17] | In-app + email | Immediate |
| `case.assigned` | Assigned officer | In-app + email | Immediate |
| `case.sla_warning` | Officer + department head | In-app + email | At 75% of SLA |
| `case.sla_breached` | Officer, department head, CX Admin | In-app + email | At breach |
| `case.escalated` | Next escalation level [D-20] | In-app + email | Immediate |
| `flag.created` | CX Admins; branch manager for walk-in branch flags | In-app immediately; email as an hourly digest (protects the email budget) | Immediate / hourly |
| `alert.fired` | Per rule | Email + in-app [D-30] | Per rule, with cooldown |
| `report.ready` / `export.ready` | Recipients / requester | In-app + email with a secure link | On completion |
| `security.*` (new device sign-in, lockout, password changed) | Affected user | Email | Immediate |
| `ops.quota_warning`, `ops.backup_failed` | System Administrators | In-app + email | On detection |

Notifications must not block user operations: all sends go through the
outbox; failures retry with backoff; the daily email budget is tracked and
low-priority digests are deferred first [A-129].

**Suggested SMS wording for Serene's own SMS team [A-88]** (≤ 160
characters, delivered as guidance in the portal, not sent by the system):
"Thank you for choosing Serene Insurance. Tell us how we did in under 1
minute: https://feedback.<serene-domain>/?src=sms"

---

# FILES & DOCUMENTS

```text
SUPPORTED_FILE_TYPES: No uploads in scope [A-13].
                      Downloads: CSV, XLSX, PDF (reports), QR posters as
                      PDF (A4, A5) and SVG/PNG QR images.
MAX_FILE_SIZE:        n/a for uploads; exports capped at 200k rows.
STORAGE:              Supabase Storage private buckets `reports`,
                      `exports`, `posters`.
PROCESSING:           Edge Functions generate files (exceljs/SheetJS for
                      XLSX, pdf-lib for PDF, a QR encoder for posters).
RETENTION:            exports 7 days; scheduled reports 30 days; posters
                      kept while the QR point is active.
ACCESS_CONTROL:       Signed URLs valid 15 min, issued after a permission
                      re-check; every download audited.
```

Outputs are protected against injection: CSV/XLSX cells are escaped for
formulas; PDF text is drawn as text, never interpreted.

---

# REPORTING

```text
PDF:   Yes [D-26]
EXCEL: Yes (XLSX) [REQ §10, D-26]
CSV:   Yes (data exports) [REQ §10]
```

Reports should support required date ranges, filters, sorting, aggregation,
export formats, and permission restrictions.

**[POPULATED] Report catalogue [REQ §13.3, §13.4]:** organisation summary;
branch performance (single and comparison); service-channel comparison;
insurance-product comparison; satisfaction trends; improvement-factor
report; feedback case report; survey source and completion funnel report
(replaces invitation performance [D-33]); completion-time report. Every
report states: period, time zone (Africa/Accra), filters, generated-at,
generated-by, survey versions included, denominators, the minimum sample
threshold, the count of unverified submissions excluded, and a
"Demo data" watermark outside production. PDF reports carry the Serene
logo header and a "Serene Insurance LTD · Confidential" footer with page
numbers. Record-level exports exclude contact details by default;
including them needs `pii.export`, a stated reason, and is audited
[REQ §13.4].

---

# TESTING

**Unit Tests** for isolated business logic.
**Integration Tests** for interactions between components/services.
**API Tests** for authentication, authorization, validation, CRUD
operations, error handling, edge cases.
**UI Tests** for critical workflows, forms, navigation, responsive
behavior, accessibility.
**Security Tests** for relevant security threats.
**Performance Tests** for load, stress, critical endpoints,
database-heavy operations.

**[POPULATED] Project-specific test requirements:**

* **Metrics (100% branch coverage, in TS and SQL):** CSAT %, average CSAT,
  average CES, NPS (all-promoter = +100, all-detractor = −100, zero
  responses → "No data", not 0), negative rate, completion rate,
  completion time, median resolution time, SLA compliance.
* **Survey engine:** walk-in → branch required; Other → branch optional;
  every other channel → branch hidden and cleared; no "not sure" option;
  "Other" clarifications optional; Continue disabled until valid; Pages
  2–4 auto-advance; Back preserves; no duplicates; consent toggle makes
  the phone required only while on.
* **Acceptance tests:** REQ §17.1 and §17.2 automated in Playwright (§17.2
  starts from "opened the survey" instead of "a valid invitation" [D-33]).
* **Database tests (pgTAP):** RLS per role and scope; every SECURITY
  DEFINER function's permission check; immutability trigger; case
  transitions; SLA working-day maths with Ghana holidays.
* **Concurrency:** 50 parallel submits on one session → exactly one row.
* **Abuse:** cooldown; Turnstile failure path; rate limit thresholds.
* **Network:** survey e2e under Slow 3G + 400 ms RTT, and with offline mid-
  survey.
* **Accessibility:** axe in CI (zero serious/critical); manual keyboard
  pass; NVDA + Chrome; VoiceOver iOS; TalkBack Android.
* **Usability (REQ §12):** test with ≥ 20 representative Serene customers
  across devices and ages; report completion-time distribution, errors and
  abandonment page against targets (EXTERNAL ACTION X-11).
* **Load:** k6 — 20 submits/s for 15 min; 25 concurrent dashboard users
  over 600k synthetic responses (staging only; respect free-tier quotas by
  running against a local or temporary project when needed).
* **Traceability:** `/docs/traceability.md` maps every REQ "must", FR and
  override to test IDs; CI fails if a "must" has no test [A-89].

**Deployment Verification** — verify environment variables, database
connectivity, migrations, static files, storage, HTTPS, reverse proxy,
background workers, monitoring, backups.

Never mark a feature complete merely because the code compiles.

---

# DEVOPS

Provide, where applicable: Dockerfiles, Docker Compose configuration,
production configuration, reverse proxy configuration, application server
configuration, CI/CD pipeline, deployment scripts, database migration
process, backup scripts, restore procedures, monitoring configuration,
logging configuration, health checks.

Deployment must be reproducible.

**[POPULATED] [A-16, A-121]:** environments `local` (Supabase CLI +
`wrangler dev`), `staging` and `production`. On the free plan Supabase
allows two active projects, which covers staging and production. No
Dockerfiles or reverse-proxy configs are needed: Wrangler config
(`wrangler.toml` with `[env.staging]`/`[env.production]`), Supabase
`config.toml` and migrations are the infrastructure definition. Cloudflare
DNS, WAF and Turnstile settings are documented step by step in
`/docs/runbooks/cloudflare-setup.md` (or managed with Terraform's
Cloudflare provider if Nii prefers). Migrations are forward-only, applied by
CI with `supabase db push` after approval, using the expand/contract
pattern. Production data is never copied to staging.

---

# DATABASE BACKUPS & DISASTER RECOVERY

```text
BACKUP_FREQUENCY:   Nightly logical backup (pg_dump, custom format) from
                    GitHub Actions at 02:00 Africa/Accra, encrypted with
                    `age` (public key in the repo, private key held
                    offline by Nii) [A-37, A-129].
BACKUP_RETENTION:   35 daily + 12 monthly copies in Cloudflare R2.
BACKUP_DESTINATION: Cloudflare R2 bucket (separate account credentials from
                    Supabase).
RESTORE_STRATEGY:   Runbook; monthly automated restore into a local
                    Supabase in CI with row-count and audit-chain checks;
                    manual quarterly drill into a fresh Supabase project.
RPO:                ≤ 24 hours on the free plan (≤ 5 minutes after an
                    upgrade to Supabase Pro with PITR)
RTO:                ≤ 8 hours
```

Do not consider backups complete until restoration has been considered and
tested.

---

# MONITORING & OBSERVABILITY

Monitor application health, server health, database health, API latency,
error rates, background jobs, storage, CPU, memory, disk, traffic, and
critical business events. Implement structured logging, error tracking,
health endpoints, metrics, and alerts where appropriate.

**[POPULATED] Alerts (to System Administrators by email + in-app)
[A-17, A-122]:**

| Signal | Initial threshold |
|---|---|
| Survey or portal unreachable (uptime monitor, 5-min checks) | 2 consecutive failures |
| Submit error rate (Sentry + `submit_error` events) | > 2% over 15 min |
| Survey Web Vitals (Cloudflare Web Analytics) | p75 LCP > 2.5 s over a day |
| Outbox / roll-up lag | > 15 min |
| Roll-up reconciliation mismatch | any |
| Audit-chain verification | any failure |
| Free-tier quotas (DB, storage, Worker requests, emails) | ≥ 80% |
| Backup job | any failure or no backup in 26 h |
| Sign-in failure spike | > 5× baseline |
| Submissions per source or QR point | > 5× 30-day hourly average (possible spam) |

---

# OUTSIDE-THE-IDE OPERATIONS & EXTERNAL DEPENDENCY PROTOCOL [FUSED EMPHASIS]

Whenever implementation requires an operation outside the development
environment, **stop before assuming it has been completed**, and — per the
person's explicit instruction — **surface the requirement to them before
proceeding**, rather than working around it with a lower-quality substitute.

Examples include: creating a VPS/hosting account, purchasing/configuring a
domain, DNS configuration, cloud provider configuration, Cloudflare
configuration, database provisioning, Redis installation, SSL certificates,
payment provider setup, email/SMS provider setup, object storage,
environment variables and secrets, GitHub/GitLab secrets, firewall
configuration, server hardening, monitoring configuration, backup
configuration — and, specifically, **any login credentials, API keys,
account access, or one-time external action** needed to finish a milestone.

For each such requirement:

```text
## EXTERNAL ACTION NEEDED

WHAT'S NEEDED: [credential / account / action]
WHY: [what this unblocks]
HOW TO PROVIDE OR COMPLETE IT: [exact steps — where to go, what to click/run]
WHAT HAPPENS IF THIS ISN'T PROVIDED: [state plainly — e.g. "milestone X
  stays blocked" — never silently substitute a mock/fake credential or a
  degraded free alternative without flagging it first]
```

**[POPULATED] Known external actions (raise at the milestone that needs
them):**

| # | Action | Needed by |
|---|---|---|
| X-01 | GitHub repository with Actions enabled and branch protection on `main` | MS-01 |
| X-02 | Cloudflare account (free) and two Supabase projects (staging, production) in eu-west-2, owned by a Serene-controlled login | MS-01 |
| X-03 | Serene's domain added to Cloudflare DNS (or delegated subdomains); create `feedback.` and `cx.` subdomains [D-29] | MS-01 |
| X-04 | Turnstile site key + secret (Cloudflare dashboard) | MS-05 |
| X-05 | Cloudflare R2 bucket + API token for backups; `age` key pair generated by Nii (private key stored offline) | MS-01 |
| X-06 | Resend account; verify the sending domain (SPF, DKIM, DMARC records in Cloudflare DNS); set as Supabase Auth SMTP | MS-02 |
| X-07 | Sentry account (free) and DSNs; uptime monitor account | MS-01 |
| X-08 | `SEED_ADMIN_EMAIL` and a **new** `SEED_ADMIN_PASSWORD` set as secrets (the password shared in chat on 2026-11-04 must not be used) | MS-02 |
| X-09 | Serene approval of the privacy notice text and consent wording | MS-09 |
| X-10 | Official vector logo (SVG/AI/EPS) from Serene's designer, for print posters | MS-05 |
| X-11 | Recruitment of representative customers for usability testing | MS-09 |
| X-12 | Printing and placement of QR posters; briefing Serene's SMS team on the link and wording | MS-09 |

```text
PROGRAMMING_EXPERIENCE:     Intermediate [D-31]
INFRASTRUCTURE_EXPERIENCE:  Intermediate [D-31]
```

When infrastructure experience is limited: explain what the command does,
give the exact command, explain where to execute it, explain expected
output, explain common errors, explain how to verify success, and clearly
identify secrets that must not be shared.

**[POPULATED]** At intermediate level: give exact commands and dashboard
paths, the expected result and how to verify it; skip basic explanations;
always mark which values are secrets.

Never claim an external configuration has been completed when it has not
actually been verified.

---

# CODE QUALITY

Write production-quality code. Do not create fake implementations merely to
satisfy a requirement. Avoid: `TODO` implementations presented as complete,
fake API responses, hardcoded production data, security bypasses, duplicate
business logic, unnecessary global state, unnecessary dependencies, giant
components/functions, tight coupling, unexplained magic numbers, hardcoded
credentials.

Follow SOLID, DRY, separation of concerns, single responsibility, reusable
components, clear module boundaries, clean architecture where appropriate —
but use the simplest architecture that safely supports the project's actual
requirements. Do not apply patterns merely for the sake of complexity.

**[POPULATED]** Email and Turnstile test doubles are allowed only in
`local` and automated tests, are selected by explicit configuration, and
refuse to start in `production`. Branch/product/channel/factor lists are
never hard-coded in application logic [REQ §15.3]; only in seed files.
Where the same rule exists in TypeScript and SQL (survey validation,
metrics), a cross-test proves they agree. Duplication is allowed there only
because the browser needs instant feedback and the database needs the
final say.

---

# UI QUALITY

The finished application should feel like a real commercial product rather
than a prototype. Every important screen must account for loading, empty,
error, success, validation, disabled, hover, focus, mobile, and
permission-restricted states.

Avoid generic placeholder layouts, inconsistent spacing, random colors,
unnecessary animations, broken responsive layouts, unusable forms, poor
accessibility, and visually inconsistent components.

**[POPULATED] Domain-specific states that must exist:** "No data for this
period" (distinct from zero) [REQ §10.2]; "Low sample (n = 12, minimum
30)"; "Not comparable — survey scale changed on <date>"; "Completion rate,
not response rate: we don't know how many customers received the link"
(info tooltip on the funnel card) [D-33]; "n unverified submissions
excluded"; "You don't have access to this branch"; "Data updated 2 min
ago"; demo-data watermark outside production.

---

# ACCESSIBILITY

Implement semantic HTML, keyboard navigation, visible focus states,
appropriate ARIA attributes, sufficient contrast, screen-reader-friendly
labels, and accessible forms/dialogs/error messages/interactive controls.
Do not treat accessibility as an afterthought — it is part of the HCI
standard this build is held to (see UI/UX DESIGN AUTHORITY above).

**[POPULATED] Target WCAG 2.2 AA [A-35]. Specifics:**
* Rating scales are `radiogroup`s of real radio inputs styled as cards or
  buttons, with the question as group label and score + label as each
  option's accessible name ("4, Satisfied"). Arrow keys move; Space/Enter
  selects; after auto-advance, focus moves to the next page's heading and
  an `aria-live="polite"` region announces "Question 3 of 5" [A-55].
* Auto-advance and WCAG 3.2.2: the instructions say "Choosing an answer
  moves you to the next question", and a visible Back control is always
  present [A-55].
* Brand colours: Serene yellow is never used for text or as the only
  indicator of state on white (1.35:1) [D-25, E1].
* Focus visible everywhere (2 px blue ring with 2 px white offset).
* Charts have text alternatives (data-table toggle and a summary sentence).
* No colour-only meaning (NPS segments, badges, deltas carry text/icons).
* Minimum target 44 × 44 (survey 48 × 48).
* Turnstile in managed/invisible mode; if a challenge appears it must be
  keyboard and screen-reader operable (Cloudflare's widget is), and the
  page explains why.
* Session timeout warning in the portal (WCAG 2.2.1).

---

# DOCUMENTATION

Maintain: README, architecture documentation, setup instructions,
environment variables, API documentation, database documentation,
deployment instructions, testing instructions, troubleshooting, and
important architectural decisions.

For complex features, explain **why** the implementation works the way it
does, not merely what the code does.

**[POPULATED] Additional docs (Nii is the sole maintainer [D-28]):**
metric definitions handbook (formulas, denominators, thresholds, why there
is no response rate); admin user guide per role; survey-configuration
guide with guardrails; QR poster and SMS-link guide for Serene staff;
runbooks (Supabase pause/outage, restore from R2, rotating the service-role
key, a spam wave on a QR code, a data-subject request, audit-chain failure,
upgrading from free to paid tiers, adding a branch, enabling MFA);
privacy record of processing for the DPC registration; traceability
matrix; ADR log.

---

# DECISION-MAKING RULE

When multiple technically valid approaches exist:

1. Compare the options.
2. Consider complexity, maintainability, security, performance,
   scalability, cost, developer experience.
3. Choose the option that best fits the project's actual requirements.
4. Briefly document the decision.

Do not introduce enterprise complexity into a simple feature without
justification.

---

# [FUSED] NO-DEGRADATION / NO-CHEAP-FALLBACK RULE

The workflow across the entire project build must remain genuinely
functional end-to-end at every stage. Do not resort to a fallback,
workaround, mock, or simplified substitute that quietly lowers the delivered
quality below the standard set in this prompt, purely to avoid a blocker or
save time — for example: faking a third-party integration response instead
of flagging the missing credential, shipping a feature without its error/
empty states because the happy path was "good enough," or picking a
weaker but easier architecture when the correct one was documented in the
plan.

If a genuine constraint (missing credential, free-tier limitation, time
constraint) makes the ideal approach currently impossible, the correct
response is to raise it via the EXTERNAL DEPENDENCY PROTOCOL or the
ASSUMPTION format — not to substitute silently. A documented, disclosed
trade-off is acceptable; an undisclosed shortcut is not.

**[POPULATED] Project-specific prohibitions:** never infer branch, channel
or product from the source, QR point, IP or device [REQ §1.3, §2.4]; never
label the completion rate as a response rate [D-33]; never show a ranking
without n [REQ §10.2]; never present illustrative numbers as real
[REQ §6.2]; never add a survey question to work around a data gap; never
put the service-role key in the portal; never commit or log the seed
password [D-23].

The free tier is a disclosed trade-off chosen by the person [D-27], not a
licence to degrade. Where it limits something (backups, availability,
email volume), the mitigation in FREE-TIER CONSTRAINTS is mandatory, and
any shortfall is reported in the checkpoint.

---

# CHANGE MANAGEMENT

Before modifying existing functionality: understand the existing
implementation, determine dependencies, identify potential regressions,
make the smallest safe change, run relevant tests, verify affected
functionality. Do not rewrite working systems unnecessarily.

---

# COMPLETION STANDARD

A feature is **NOT COMPLETE** merely because the page renders, the API
returns data, the code compiles, or the happy path works.

A feature is complete only when: core functionality works; edge cases are
handled; validation works; authorization works; security has been
considered; errors are handled; loading/empty states work; responsive
behavior works; relevant tests pass; existing functionality has not
regressed; documentation is updated where necessary; and — **[FUSED]** —
its HCI/UX quality matches what a tier-one, grade-A commercial product would
ship, with no unresolved gap left silently unpatched.

**[POPULATED]** For any survey change, "complete" also requires re-running
the scripted completion-time test and the performance budget. For any
database change, it requires the RLS and permission-matrix tests to pass.

---

# VERIFICATION CHECKPOINT

At the end of every significant milestone, provide:

```text
## IMPLEMENTATION CHECKPOINT

COMPLETED: [List completed work]
FILES CREATED: [List]
FILES MODIFIED: [List]
DATABASE CHANGES: [List]
API CHANGES: [List]
TESTS: [List]
SECURITY VERIFICATION: [List]
RESPONSIVE VERIFICATION: [List]
PERFORMANCE VERIFICATION: [Before/after measurements against PERFORMANCE_TARGETS] [FUSED]
GAPS FOUND & PATCHED: [Reference the GAP AUDIT / GAP-PATCHING entries closed this milestone] [FUSED]
EXTERNAL ACTIONS STILL NEEDED FROM YOU: [List, or "None"] [FUSED]
KNOWN ISSUES: [List]
ASSUMPTIONS: [List]
NEXT MILESTONE: [Describe the next logical step]
```

**[POPULATED]** Add a line `FREE-TIER USAGE: [DB MB / 500, storage, Worker
requests/day peak, emails/day peak]` to every checkpoint.

Do not move forward blindly if a critical dependency is broken.

---

# PROJECT-SPECIFIC FUNCTIONAL REQUIREMENTS

Add as many modules as necessary. For every module, describe: purpose,
users, features, business rules, data requirements, API requirements, UI
requirements, permissions, edge cases, notifications, reports,
integrations.

Tables and functions referenced below are defined in PHASE 2 §2.3–2.4 and
are not repeated.

```text
## M01 Identity, Authentication & Access Control
```

**Purpose:** secure staff access; RBAC with branch scope; contact-detail
protection [REQ §9].
**Users:** all internal roles; System Administrator manages.
**Features:** invite user; set password; sign in; forced first password
change; reset; lockout; suspend/reactivate/deactivate; role grants with
branch scope; permission catalogue; seed admin [D-23].

**Permission matrix [D-21, D-24, D-34] (✓ = allowed; S = scoped to
assigned branches; A = assigned cases only; — = denied):**

| Permission | Exec | Branch Mgr | CX Admin | Res. Officer | Sys Admin | Auditor |
|---|---|---|---|---|---|---|
| `analytics.view` (dashboards) | ✓ org | S (own branches in full) | ✓ org | — (own case stats only) | — | ✓ org |
| `analytics.benchmark.view` (company average) | ✓ | ✓ | ✓ | — | — | ✓ |
| `analytics.branch_ranking.view` (named branch ranking, aggregates only) | ✓ | ✓ [D-24] | ✓ | — | — | ✓ |
| `responses.view` (records) | ✓ | S | ✓ | A | — | ✓ |
| `responses.comment.view` | ✓ | S [D-34] | ✓ | A | — | ✓ |
| `pii.view` (consented phone/name) | ✓ [D-24] | — | ✓ (reason, audited) | A (reason, audited) | — | — (masked) |
| `responses.attribution.propose` / `.approve` | ✓ / ✓ | — | ✓ / — | — | — | — |
| `flags.review` | ✓ | S | ✓ | — | — | read |
| `cases.create` | ✓ | S | ✓ | — | — | — |
| `cases.assign` | ✓ | S [D-21] | ✓ | — | — | — |
| `cases.work` (notes, investigation, resolve) | ✓ | S [D-21] | ✓ | A | — | — |
| `cases.close` / `cases.reopen` | ✓ | — [D-21] | ✓ | — | — | — |
| `cases.view` | ✓ | S | ✓ | A | — | ✓ |
| `exports.create` | ✓ | S | ✓ | — | — | ✓ |
| `pii.export` | ✓ (reason) | — | ✓ (reason) | — | — | — |
| `targets.manage` | ✓ [REQ §9.1.10] | — | — | — | — | — |
| `alerts.manage` | ✓ | — | ✓ | — | — | — |
| `flags.configure` (Flag / Auto-case toggles) | ✓ | — | ✓ | — | — | — |
| `reports.schedule` | ✓ | S | ✓ | — | — | — |
| `config.directory` (branches, regions, departments, holidays) | — | — | — | — | ✓ | — |
| `config.catalogues` | ✓ | — | ✓ | — | ✓ | — |
| `config.qr_points` | ✓ | — | ✓ | — | ✓ | — |
| `survey.edit` / `survey.publish.approve` | — / ✓ | — | ✓ / — | — | ✓ / — | — |
| `users.manage` | — | — | — | — | ✓ | — |
| `audit.view` | ✓ | — | — | — | ✓ (configuration events) | ✓ (all) |
| `settings.manage` | — | — | — | — | ✓ | — |

The seed admin (Nii) holds System Administrator + Executive
Administrator, which together cover every permission.

**Rules:** no self-registration; a user with zero active grants cannot
use the portal; Branch Manager scope = union of branch grants; for other
branches a Branch Manager sees only aggregate ranking rows (name, n, CSAT,
NPS, CES, negative rate), never records or comments [D-24, D-34];
deactivation keeps history; the last System Administrator cannot be
deactivated.
**Edge cases:** user moves branch → old grants end-dated, prompt to
reassign open cases; email change re-verified.
**UI:** sign-in, set new password, forgot/reset, user list (search, role,
branch, status), user detail with grants editor, profile and sign-out of
other sessions.

```text
## M02 Organisation Directory
```

**Purpose:** regions, branches, departments, branch-manager assignment,
working calendar [REQ §14.1].
**Seed data:** 13 branches and 7 regions (COMPANY CONTEXT); departments
[A-132]; Ghana public holidays [A-134].
**Rules:** branch `code` immutable; deactivated branches disappear from the
survey for new sessions but stay in analytics (filter group "Inactive")
and history; region changes are effective-dated, and responses keep
`region_id_at_submission`, so historical regional reports do not shift
[A-97]; Accra Main carries `is_head_office` for labelling only. Digital and
call-centre responses are **not** attributed to it, because the branch
question is hidden for those channels [D-12].
**UI:** branch list (name, code, region, status, managers, responses in
the last 30 days), detail drawer, deactivate with impact summary, region
list, department list, holiday calendar.

```text
## M03 Catalogue Configuration
```

**Purpose:** controlled lists [REQ §14.2–14.3].
**Seed: service channels [REQ §2.4, D-12, D-14]:**

| Code | Label | Branch question |
|---|---|---|
| MOBILE_APP | Mobile application | Hidden |
| WEBSITE | Company website | Hidden |
| WALK_IN | Walk-in at a branch office | **Required** |
| PHONE | Telephone / call centre | Hidden |
| WHATSAPP | WhatsApp | Hidden |
| AGENT_BROKER | Insurance agent / broker | Hidden |
| OTHER | Other | Optional |

**Seed: products:** 8 + Other (COMPANY CONTEXT).
**Seed: improvement factors [REQ §2.8, D-14, D-19]:**

| Code | Label | Flag on select | Auto-create case |
|---|---|---|---|
| SPEED | Speed of service | ON | OFF |
| STAFF | Staff professionalism | ON | OFF |
| COMMS | Communication and information | ON | OFF |
| EASE | Ease of the process | ON | OFF |
| TECH | Technical issues | ON | OFF |
| PRICE | Pricing and charges | ON | OFF |
| OTHER | Other | ON | OFF |
| NONE | Nothing, I am satisfied | OFF (fixed) | OFF (fixed) |

**Rules:** labels editable; deactivate, never delete; exactly one
`is_other` per list and one `is_none` for factors (system-controlled);
reorder and label changes reach the survey only when the next version is
published (catalogue snapshot) [A-73]; codes are never reused.
**Edge cases:** deactivating an option referenced by a draft blocks
publishing until the draft is updated; reports show labels as at the
response's survey version, with the current name in a tooltip [A-98].

```text
## M04 Survey Definition & Versioning
```

**Purpose:** configurable wording, options, mandatory flags and conditional
rules, with immutable versions [REQ §14.4].
**Definition schema (JSON):** `pages[] → questions[] {id, type
(single_choice | rating_5 | rating_0_10 | text_short | text_long | toggle |
phone), label, help, options_source (catalogue | inline), required (bool |
rule), visible_when (rule), clears_when (rule), max_length}`; the rule
language is a small JSON-logic subset evaluated identically by
`packages/survey-engine` and by the SQL validator inside `survey.submit`.
**Guardrails (cannot be overridden in the UI) [REQ §2.9, §16]:** ≤ 5 pages;
Page 1 ≤ 3 questions (+ conditional clarifications); Pages 2–4 exactly one
rating each; no required free text (the phone field may be required only
when the consent toggle is on); no identity questions other than the
consent-dependent phone and first name; no login step.
**Versioning:** editing a published version creates a draft; publish needs
four-eyes approval (CX Admin or System Admin prepares, an Executive
approves) [A-96]; publishing retires the previous version; a
`scale_signature` change triggers the warning "Trends will break at this
date" and needs explicit confirmation.
**UI:** version list, editor (page outline, question inspector), rule
builder, live phone/desktop preview, diff vs previous, publish request and
approval dialogs.

```text
## M05 Survey Access: public link, sources & QR posters  [D-07, D-09, D-33]
```

**Purpose:** let anyone with the link or a poster start the survey, record
where they came from, and deter abuse. This replaces REQ §5 invitation
management (see REQUIREMENT OVERRIDES).
**Entry points:**
* `https://feedback.<serene-domain>/?src=sms` — the link Serene's SMS team
  sends through their own provider (sender ID "SERENE") immediately after
  a transaction [D-08, D-09].
* `https://feedback.<serene-domain>/q/<code>` — printed on a static QR
  poster [D-07].
* `https://feedback.<serene-domain>/` — direct visits (source `direct`).
**QR points:** System Admin / CX Admin / Executive creates a point (label,
placement note). The system generates a short immutable code and a
poster: A4 and A5 PDF with the Serene logo, headline "How did we do?
Tell us in under a minute", the QR code (error correction M, ≥ 3 cm
printed), the short URL as text fallback, and a one-line privacy note
[A-130]. Points can be deactivated (scans still work and are reported as
"inactive QR").
**Branch rule:** a QR point has **no branch**. A poster at Kasoa does not
make the response a Kasoa response. Only the customer's Page 1 answer does
[REQ §2.4, Rule 2]. Dashboards may show responses *by QR point* as an
operational view, clearly labelled "where the survey was opened", never as
branch performance.
**Abuse controls [A-123]:**
* Per-device cooldown after a submission: default 24 h (setting). Inside
  the cooldown, the device sees "You've already shared your feedback —
  thank you!" (FR-34).
* Turnstile on submit; unverified submissions are stored, flagged
  `unverified` and excluded from KPIs by default.
* One Cloudflare rate-limiting rule on the survey API (threshold set so
  that a branch full of customers on one carrier IP is not blocked).
* Spam-wave alert per source/QR point (MONITORING).
**Funnel reporting (replaces invitation reporting, REQ §5.4):** per source
and QR point: visits (sessions opened), started (interactive), reached each
page, submitted, abandoned by page, cooldown blocks, Turnstile failures;
**completion rate = submitted ÷ started**.
**SMS-link guide:** a portal page for Serene staff with the exact link,
suggested wording (≤ 160 characters), and the advice to send it right after
each eligible transaction (new policies and renewals, D-10). The system
does not send or track SMS.
**Edge cases:** unknown `src` values → `direct`; unknown QR code → source
`qr`, point null, logged; very old cached poster images still work because
codes are immutable.

```text
## M06 Customer Survey Experience (public)
```

**Purpose:** collect high-value feedback in ≤ 60 s, median ≤ 40 s
[REQ §1.2].
**Global layout (all pages) [A-102, A-128]:** white page with a 4 px Serene
yellow band along the top edge; header with the Serene logo (32 px high,
left) and "Step 2 of 5" (right); a 4 px blue segmented progress bar (5
segments) below [REQ §2.3]; content column max-width 560 px; Back control
(chevron + "Back", 48 px target) on Pages 2–5 [REQ §2.3]; privacy link on
Page 1 and the confirmation page [REQ §10.1].

**No intro page.** Page 1 opens with one line: "Thanks for choosing Serene
Insurance. 5 quick questions, under a minute." [A-103]

**Page 1 — Transaction information [REQ §2.4]**
1. "How did you obtain your insurance policy?" — 7 single-choice cards,
   required. "Other" reveals an optional 80-character field "Please tell
   us how (optional)".
2. "Which branch issued your policy?" — shown **only** when the channel is
   Walk-in (required) or Other (optional, labelled "(optional)") [D-12].
   Options: the 13 active branches A–Z, then "Other branch" (reveals an
   optional 80-character name field). **No "I'm not sure" option** [D-13].
   Native `<select>`. Helper text: "The branch that issued your policy,
   which may differ from one you visited." Revealed with a 200 ms
   height + fade directly below the channel question; focus is not moved;
   `aria-live` announces "Branch question added".
3. "What type of insurance policy did you get?" — 9 options as compact
   two-column choice chips (≥ 360 px), required; "Other" reveals an
   optional 80-character field [A-104].
4. **Continue** — primary blue pill, full width, sticky above the safe area
   on phones; disabled until all applicable required fields are valid
   [REQ §2.4]. Tapping it while disabled scrolls to and highlights the
   first missing field with an inline message [A-105].
5. Changing the channel re-evaluates the branch question. If it becomes
   hidden, any selected branch is cleared and recorded as
   `not_applicable`. If it becomes visible again, the old selection is not
   restored [REQ §2.4].

**Page 2 — Overall satisfaction (CSAT) [REQ §2.5]:** "How satisfied are you
with the insurance service you received?" Five full-width option cards with
number and label ("1 Very dissatisfied" … "5 Very satisfied"), ordered
1→5 top-to-bottom on phones and left-to-right from 810 px. No face icons
[A-53].
**Page 3 — Ease (CES) [REQ §2.6]:** "How easy was it to obtain your
insurance policy?" Same pattern, Very difficult … Very easy.
**Page 4 — Recommendation (NPS) [REQ §2.7]:** "How likely are you to
recommend Serene Insurance to someone you know?" [D-01]. Buttons 0–10 as
two rows (0–5, 6–10) below 520 px and one row above; anchors "Not at all
likely" and "Extremely likely" [A-52].

**Tap-to-advance (Pages 2–4) [REQ §2.3, A-25]:** the tapped option shows its
selected state at once (blue border, blue-50 fill, check icon), holds
250 ms as confirmation, then the next page slides in (240 ms; instant under
reduced motion). A different tap during the hold changes the selection and
restarts the hold. After Back, the previous selection is shown; tapping it
again advances; tapping another updates the draft.

**Page 5 — Additional feedback [REQ §2.8, D-15]:**
1. "What is the main thing we could improve? (optional)" — 8 single-choice
   chips; "Other" reveals an optional 200-character field.
2. "Anything else you'd like to tell us? (optional)" — textarea, 1,000
   characters, counter from 800 [A-106].
3. Toggle, off by default: "You may contact me about my feedback", with
   the line "We'll only use your number to follow up on this feedback." and
   a privacy link. Switching it on reveals "Your mobile number" (required
   while the toggle is on; Ghana format, numeric keypad, accepts 0XX XXX
   XXXX or +233) and "Your first name (optional)". Switching it off clears
   both [A-125].
4. **Submit feedback** — primary button, always enabled unless the consent
   toggle is on with an invalid number.
If CSAT ≤ 2, the heading reads "We're sorry we fell short. What should we
improve?"; all fields stay optional [REQ §2.8, A-107]. Selecting "Nothing,
I am satisfied" collapses the "Other" field if open.

**Submission [REQ §2.3]:** Submit → Turnstile (invisible; a visible
challenge only if Cloudflare requires it) → button shows a spinner and
"Sending…" and is disabled → confirmation page: blue panel, white heading
"Thank you! Your feedback has been received.", reference `FB-2026-000123`,
one sentence on how feedback is used, and, if consent was given, "Our
customer experience team may call you on 024 ••• 4567." Browser Back after
submit shows the confirmation, never the form.

**Persistence [REQ §2.3, A-61]:** answers held in memory and mirrored to
`sessionStorage`; synced to the server draft on change (debounced 300 ms)
so a reload or a reopened tab within 24 h resumes on the same page. The
server draft is the source of truth.

**Telemetry [REQ §12]:** opened (server), interactive (client), page_view,
answer_set/answer_changed, back, validation_blocked, submit_attempt/
success/error, cooldown_blocked, turnstile_failed; abandonment = session
expired without submit, last page recorded.

**No-JS fallback [A-38]:** the Worker serves all five pages as one
server-posted form (still five sections, same server validation; Turnstile
non-interactive mode).

**Edge cases:** device clock wrong → server timestamps are authoritative;
slow connection → Page 1 is usable before fonts or telemetry load;
Supabase unavailable at first load → "We can't take feedback right now"
page instead of a form that would lose answers.

```text
## M07 Response Capture & Integrity
```

**Rules:** `survey.submit` re-validates the full answer set against the
bound version; computes `branch_status`: `selected` | `other` |
`not_applicable` (hidden for the channel) | `not_provided` (optional for
Other and left blank) [REQ §4.3]; records source and QR point; computes
`completion_duration_ms = submitted_at − interactive_at` [REQ §11.7]
(falls back to `opened_at`, flagged, if interactive is missing); writes the
response, the contact request (if consented), the device cooldown, the
session status and the outbox event in one transaction; returns the
reference. Flags and roll-ups update asynchronously.
**Immutability:** see DATA INTEGRITY; corrections only via
`attribution_corrections` [A-64].

```text
## M08 Analytics Engine
```

**Metric definitions [REQ §11, as overridden by D-33]**, implemented once
in `packages/metrics` and mirrored in SQL with cross-tests:

| Metric | Formula | Display |
|---|---|---|
| CSAT % | count(csat ∈ {4,5}) ÷ count(valid csat) × 100 | 1 decimal %, with n |
| Average CSAT | Σcsat ÷ count(valid csat) | 2 decimals "/ 5" |
| Average CES | Σces ÷ count(valid ces) | 2 decimals "/ 5" (higher = easier) |
| NPS | %promoters (9–10) − %detractors (0–6) | integer with sign, −100…+100 |
| Negative feedback rate | count(csat ∈ {1,2}) ÷ count(valid csat) × 100 | % |
| Completion rate (replaces response rate) | submitted ÷ sessions that became interactive × 100 | %, labelled with its denominator |
| Main improvement factor | mode of improvement factor, excluding "Nothing, I am satisfied" and blanks; ties shown together [A-108] | label + share + n |
| Completion time | median and P90 of completion_duration_ms; % ≤ 60 s | seconds |
| Resolution time | resolved_at − created_at in working days (D-18 calendar); mean and median | days |
| SLA compliance | resolved within target ÷ resolved | % |
| Resolution rate | (resolved + closed) ÷ cases created in period | % |
| Escalation rate | escalated ÷ cases created | % |
| Repeat complaints | consented phone numbers (HMAC) with ≥ 2 flagged responses or cases within 90 days [A-109] | count, with the note "among customers who left a number" |

**Valid responses:** submitted and not `unverified` (unless the
"Include unverified" filter is on) [A-135].
**Rules [REQ §10.2]:** valid responses only in denominators; zero responses
→ "No data", never 0; every value carries n; groups below the minimum
threshold (default 30, setting) are flagged `low_sample`, excluded from
rankings and best/worst lists, but viewable with a warning; comparisons
always use identical periods and filters; versions with different
`scale_signature` are never mixed in one figure.
**Common filter set [REQ §7]:** date range (presets: Today, Last 7 days,
Last 30 days, Current month, Previous month, Current quarter, Previous
quarter, Year to date, Custom), always by submission date [D-33];
granularity (day, ISO week Monday start, month, quarter, year); branch
(multi; pseudo-values "Other branch", "Not applicable", "Not provided");
region; channel; product; satisfaction band (Negative 1–2, Neutral 3,
Positive 4–5); NPS class; improvement factor; case status (record and case
views); source; QR point; survey version; include unverified.
**Benchmarks:** company-wide value for the same period and non-branch
filters. **Targets:** latest effective target for the scope.

Branch metrics are based only on walk-in responses (and "Other" channel
responses that named a branch), because the branch is not asked for other
channels [D-12]. Every branch view states this in its subtitle: "Based on
customers who obtained their policy by walking into a branch."

```text
## M09 Dashboards
```

All screens honour the global filters, which are kept in the URL and
carried across views [REQ §17.1.6]. Every card shows period and n
[REQ §6.1].

* **S-A1 Executive overview [REQ §6.1]:** KPI row (CSAT %, Average CSAT,
  NPS, Average CES, Total responses, Completion rate, Negative rate, Main
  improvement factor), each with delta vs the previous equivalent period
  and target status; trend chart (selectable metric); NPS composition bar;
  branch performance table (n, CSAT, NPS, CES, negative rate, vs target,
  low-sample badge); channel and product mini-comparisons; "Needs
  attention" panel on a yellow-50 surface (open flags, overdue cases,
  fired alerts).
* **S-A2 Branch performance [REQ §6.2]:** list and compare mode (up to 6
  branches) with the comparison table (Branch, Response count, CSAT, NPS,
  CES, negative rate, Δ vs company). Branch detail: name, region, n, KPIs
  vs company benchmark and vs target, trend, product breakdown within the
  branch, top improvement factors, recent comments (scoped), cases
  summary, export. Branch managers land on their branch, and can open the
  named ranking of all branches (aggregates only) [D-24].
* **S-A3 Channel analytics [REQ §6.3]:** per channel: n, CSAT, NPS, CES,
  negative rate, top improvement factor, trend.
* **S-A4 Product analytics [REQ §6.4]:** the same for the 9 product values.
* **S-A5 Trends [REQ §6.5]:** multi-metric time series with granularity
  switch; annotations where survey versions changed.
* **S-A6 Improvement factors:** distribution, by branch/channel/product,
  trends (e.g. "Technical issues" for digital channels).
* **S-A7 Sources & funnel (replaces invitation reporting [D-33]):** visits →
  started → each page → submitted per source and per QR point; completion
  rate; abandonment by page; cooldown blocks; unverified count.
* **S-A8 Case performance [REQ §8.5]** (R2).
* **S-A9 Survey completion & usability [REQ §12]:** completion-time
  histogram, % ≤ 60 s, median, back-navigation and answer-change rates.

A region heat table is used instead of a map (13 branches do not justify a
map dependency) [A-110].

```text
## M10 Feedback Records Explorer
```

**Purpose:** inspect individual responses [REQ §6.6].
**List columns:** reference, submitted (date/time, Africa/Accra), source,
channel, issuing branch (or status label), product, CSAT, CES, NPS with
class badge, improvement factor, comment indicator, "contact consented"
indicator, case status. Search on reference and, with
`responses.comment.view`, comment text.
**Detail drawer:** all answers with the question wording of the response's
survey version, "other" texts, comment, timestamps and completion time,
source/QR point; contact panel shown only if consent was given: masked
number, "Reveal" requires `pii.view` + a reason and is audited; flags,
linked case, attribution correction history.
**Actions:** create case, dismiss/convert flag, propose attribution
correction, copy link. Answers cannot be edited anywhere.

```text
## M11 Flagging & Case Management (R2)
```

**Flag rules and toggles [REQ §8.1, D-19]:** every rule and every
improvement factor has two independent switches, managed on one
"Flag rules" screen by Executives and CX Admins:
* **Flag** — creates an entry in the review queue. Default **ON** for
  everything ("by default all are flagged").
* **Auto-create case** — also creates a case immediately in the CX central
  queue. Default **OFF** for everything ("flag only, no automatic cases").

Default rules: CSAT 1–2 (Flag ON, priority suggestion P2); each improvement
factor except "Nothing, I am satisfied" (Flag ON); comment keywords (Flag
ON; initial list: fraud, cheat, refund, claim not paid, insult, threat,
lawyer, court, NIC; editable in settings) [A-111]; NPS 0–6 is a
classification only and has no rule [REQ §8.1]; manual case creation from
any record.
Because almost every response with an improvement factor will be flagged
by default, the review queue supports bulk dismiss with a reason, grouping
by rule, and "show only CSAT ≤ 2" as its default view [A-126].
**Lifecycle [REQ §8.3]:** `new → assigned → in_progress → resolved →
closed`; `resolved → in_progress` (reopen by CX/Exec within 30 days);
`closed` is terminal except an Executive reopen with reason. Escalation is
a flag + level with history, independent of status.
**Routing [D-17]:** all new cases go to the CX central queue; a CX
Administrator assigns to an officer or department.
**SLA [D-18]:** P1 1, P2 3, P3 5, P4 10 working days; Mon–Fri 08:00–17:00
Africa/Accra; Ghana public holidays excluded; warning at 75%; breach →
automatic escalation one level [A-112].
**Escalation path [D-20]:** officer → department head → CX Administrator →
Executive.
**Branch managers [D-21]:** view, assign, add notes and resolve cases for
their branches; cannot close.
**Contact:** an officer sees the customer's number only on an assigned
case, only if consent was given, and only by pressing "Reveal" with a
reason (audited) [D-15].
**UI:** flag queue (triage list, bulk actions), case list and board
(filters: status, priority, branch, department, officer, overdue), case
detail (summary, linked response, timeline, notes with @mention,
assignment, SLA countdown), my cases.
**Metrics [REQ §8.5]:** see M08.

```text
## M12 Targets & Alerts (R2)
```

**Targets [REQ §13.1]:** metric × scope × effective period; no default
targets [A-113]. "Feedback response rate" targets are replaced by
"completion rate" targets [D-33].
**Alert types and default parameters [REQ §13.2, A-27]:**

| Type | Default rule |
|---|---|
| Sudden decline in branch CSAT | CSAT % over the last 14 days ≥ 10 points below the branch's previous 90 days, both n ≥ 30 |
| High volume of negative feedback | ≥ 5 negative (CSAT 1–2) responses for a branch within 24 h |
| Unresolved cases increase | open cases +50% week on week and ≥ 10 |
| Repeated improvement factor | one factor ≥ 40% of a branch's responses over 30 days, n ≥ 30 |
| SLA approaching / exceeded | per case at 75% and 100% |
| Below target | metric below its target over the target's window |
| Technical issues spike | "Technical issues" share for digital channels doubles vs the prior 30 days, n ≥ 30 |

pg_cron evaluates alerts every 15 min and SLA timers every 5 min; cooldown
24 h per rule and scope; recipients by role, department or user; delivery
by email + in-app [D-30].

```text
## M13 Reports, Scheduled Reports & Exports
```

Report catalogue and rules: see REPORTING. Formats: PDF and XLSX for
reports [D-26], CSV/XLSX for data exports. Schedules [REQ §13.3]: daily
operational summary (07:00), weekly branch report (Monday 07:00), monthly
executive report (1st of the month, 07:00), quarterly trend report (first
working day of the quarter), all Africa/Accra. Recipients are portal users
only [A-114]. Emails contain a summary and a secure link; files are not
attached, which keeps contact data out of mailboxes and saves the email
budget.

```text
## M14 Notifications
```

See NOTIFICATIONS. Notification centre (bell with unread count, list, mark
read, deep links); per-user email preferences per type (security emails
cannot be turned off).

```text
## M15 Audit Logging
```

Events per [REQ §14.5] plus: sign-in/out and failures, password changes,
contact reveals, exports and downloads, flag dismissals, flag-rule toggle
changes, attribution corrections, QR point changes, settings changes,
retention runs. Viewer with filters; CSV export for auditors; hash-chain
verification action.

```text
## M16 Privacy, Consent & Data Retention
```

**Privacy notice [REQ §10.1, D-03]:** linked from Page 1, the consent toggle
and the confirmation page. Draft for Serene's approval (X-09): who is
collecting (Serene Insurance LTD, registered with the Data Protection
Commission); why (to improve service); what is collected (answers;
optionally a phone number and first name if the customer asks to be
contacted); that feedback is otherwise anonymous; how long data is kept;
the customer's rights under Act 843; a contact for data-protection queries
(from settings).
**Identity separation:** consented contact data lives in `pii` only;
analytics never joins to it; dashboards and exports work fully without it
[REQ §10.1].
**Retention [D-16]:** schedule in PHASE 2 §2.3, enforced by pg_cron jobs.
**Data-subject requests:** find a consented contact by phone (HMAC), list
the linked responses and cases, export them, erase the contact (responses
kept, de-identified); all audited.

```text
## M17 Platform
```

Settings (device cooldown hours, session expiry hours, minimum sample
threshold, company display and legal names, support contact, keyword list,
email daily budget), quota dashboard (free-tier usage with thresholds), health
endpoint, keep-alive job, backup status, demo-data guard (seed command
refuses production). Future integrations [REQ §16] would add a
`system_attributes` table with `source_system`, always displayed as
"From <system>", never merged into customer-reported fields.

---

# SPECIAL BUSINESS LOGIC

```text
### Rule 1 — One-minute survey
The standard survey is ≤ 5 pages, Page 1 = 3 transaction questions,
Pages 2–4 = one rating each, Page 5 optional; no mandatory free text; no
login. Target ≥ 90% complete ≤ 60 s, median ≤ 40 s. [REQ §1.2, §2.9, §12]

### Rule 2 — Customer-reported context only
Channel, issuing branch and product come only from the customer. Never infer
them from the source, QR point or poster location, IP or device.
[REQ §1.3, §2.4, D-07]

### Rule 3 — Issuing branch, walk-in only
Ask for the issuing branch only for walk-in (required) and Other (optional);
hide and clear it for every other channel; statuses selected / other /
not_applicable / not_provided; no "not sure" option. [REQ §2.4, D-12, D-13]

### Rule 4 — One submission per session, deterred repeats
One response per survey session (DB-enforced); per-device cooldown (default
24 h); Turnstile; unverified submissions excluded from KPIs by default.
[D-33, A-123]

### Rule 5 — Submitted feedback is immutable
No edit/delete of responses by any role; corrections are separate, visible
overlays; retention redaction is the only text change and is audited. [REQ §4.3]

### Rule 6 — Version fidelity
Every response stores its survey version; incompatible scales are never
aggregated. [REQ §4.3, §10.2]

### Rule 7 — Honest denominators
Valid responses as denominators; n shown beside every rate and average; zero
vs missing distinguished; no "response rate" exists, only a completion rate
labelled with its denominator. [REQ §10.2, D-33]

### Rule 8 — Low-sample protection
Groups below the threshold (default 30) are marked and excluded from rankings
but remain viewable with a warning. [REQ §10.2]

### Rule 9 — Same-period comparisons
Branch comparisons and benchmarks always use identical periods and filters.
[REQ §10.2, FR-17]

### Rule 10 — Branch scope
Branch Managers see records and comments for their own branches only; for
other branches they see aggregate ranking rows only. Enforced by RLS and
functions. [REQ §9.2, §9.3, D-24, D-34]

### Rule 11 — Detractor ≠ complaint
NPS 0–6 is a classification, not a flag or case trigger. [REQ §8.1]

### Rule 12 — Anonymous unless the customer opts in
No identity is collected unless the customer switches on "contact me"; then
only a phone number and optional first name, encrypted, revealed only on a
case with a reason. No policy numbers or Ghana Card numbers, ever.
[REQ §10.1, D-15]

### Rule 13 — Flags by default, cases by choice
Every flag rule and improvement factor flags by default; none creates a case
automatically unless an authorised user switches "Auto-create case" on. [D-19]

### Rule 14 — Illustrative data never shown as real
Demo/seed data exists only outside production and is watermarked. [REQ §6.2]

### Rule 15 — Survey length is protected
No enhancement may add questions or steps without explicit approval. [REQ §16]

### Rule 16 — Historical attribution is preserved
Deactivating or re-regioning branches/products/channels never changes past
responses' attribution. [REQ §14.1–14.3]

### Rule 17 — Separation of data sources
Customer-reported data and any future operational-system data are stored and
displayed separately. [REQ §16]

### Rule 18 — Completion time measured from interactivity
Duration = submitted − interactive timestamp. [REQ §11.7]

### Rule 19 — Changing a previous answer updates, never duplicates
[REQ §2.3, §17.2]

### Rule 20 — Optional stays optional
Low ratings may change Page 5 wording but never make explanation mandatory.
[REQ §2.8]

### Rule 21 — Cases are closed by CX or executives
Branch managers may resolve but not close their own branch's cases. [D-21]
```

Do not weaken or bypass these rules without explicitly identifying the
conflict and requesting approval where necessary.

---

# FINAL SYSTEM REQUIREMENT

The final application must be a complete, production-ready implementation
of **Serene Insurance Customer Feedback System**. It must satisfy all
functional requirements, all non-functional requirements, all business
rules, all design requirements, all security requirements, all testing
requirements, and all deployment requirements.

The final system should be suitable for **Serene Insurance, a Ghanaian
general insurer with 13 branches, its customers across all seven service
channels, and up to 100 internal staff spanning executives, branch
managers, customer-experience, resolution, IT and audit functions** and
should be designed as though it will immediately be placed into real-world
use.

---

# FIRST RESPONSE REQUIREMENT

Before writing substantial application code, do the following:

**STEP 0 — DETERMINE STARTING STATE [FUSED]**
State whether an implementation plan/codebase already exists
(`EXISTING_IMPLEMENTATION_PLAN` / `EXISTING_CODEBASE_STATE`). If yes, run the
EXISTING-PLAN GAP AUDIT PROTOCOL now and report its findings before
proceeding to Step 1.
**[POPULATED]** State A (greenfield) [D-32]. Produce the baseline audit (all
`MISSING`). All decisions are made (D-01…D-34); list any new questions as
Q-35 onwards.

**STEP 1 — UNDERSTAND**
Summarize your understanding of the project.

**STEP 2 — REQUIREMENTS**
Produce the complete requirements specification (or confirm the existing
one and list deltas found in the gap audit).

**STEP 3 — ASSUMPTIONS**
List assumptions made due to missing information.
**[POPULATED]** Start from the ASSUMPTIONS REGISTER below; add new ones from
A-136.

**STEP 4 — ARCHITECTURE**
Design (or validate) the complete architecture.

**STEP 5 — DATABASE**
Design (or validate) the database and relationships.

**STEP 6 — API**
Design (or validate) the API structure.

**STEP 7 — UI**
Map the application's screens and user journeys.
**[POPULATED] Screen inventory:**
Survey — S-C1 Page 1, S-C2 CSAT, S-C3 CES, S-C4 NPS, S-C5 Additional
feedback (incl. contact consent), S-C6 Confirmation, S-C7 Already shared
(cooldown), S-C8 Service unavailable, S-C9 Privacy notice, S-C10
Offline/submit-error state, S-C11 No-JS single-page form.
Admin — S-A0 Sign-in / MFA / reset / first-login enrolment; S-A1–S-A9
dashboards (M09); S-B1 Records list, S-B2 Record drawer; S-B3 Flag queue;
S-B4 Case list/board, S-B5 Case detail, S-B6 My cases; S-B7 QR points
list, S-B8 QR point detail & poster download, S-B9 SMS-link guide; S-B9a
Flag rules (Flag / Auto-case toggles); S-B10 Exports &
reports, S-B11 Report schedules; S-B12 Targets, S-B13 Alert rules, S-B14
Alerts; S-B15 Users & grants; S-B16 Branches & regions, S-B17
Departments; S-B18 Catalogues; S-B19 Survey versions, editor, preview;
S-B20 Audit log; S-B21 Settings & free-tier usage; S-B22
Notification centre; S-B23 Profile & sessions; S-B24 Access denied /
not found / error pages.
Navigation is permission-aware [REQ §19]: items the user cannot use are not
shown; direct URL access returns the access-denied page and a 403.

**STEP 8 — SECURITY**
Define the security architecture.

**STEP 9 — TESTING**
Define the testing strategy.

**STEP 10 — DEPLOYMENT**
Define the deployment architecture, including the actual hosting target to
be used and any external accounts/credentials required from the person
before deployment can happen.

**STEP 11 — IMPLEMENTATION ROADMAP**
Break the remaining work into ordered implementation milestones, driven by
the gap audit's `PARTIAL` / `MISSING` / `UNDOCUMENTED GAP` items.
**[POPULATED]** Start from MS-00…MS-13.

Only after these steps should substantial implementation begin. Do not skip
architectural planning simply because coding appears faster — and do not
skip the gap audit simply because a plan already exists.

---

# FINAL OPERATING PRINCIPLE

Think like a complete engineering organization, led by a tier-one, grade-A
developer with strong product/business intuition and a user-first sense of
HCI craft.

Do not ask: *"What code should I generate?"*

Ask: *"What is the safest, cleanest, most maintainable, fastest, and most
genuinely user-intuitive way to deliver this requirement within the
architecture of the entire system — and is there any gap left from prior
work that a real production team would never have shipped?"*

Build the system deliberately. Verify your work. Protect existing
functionality. Patch discovered gaps to a tier-one standard and disclose
every patch. Flag every external action or credential you need from the
person before working around its absence. Never resort to a fallback that
quietly lowers delivered quality. Document important decisions. Never
pretend something has been implemented, tested, configured, deployed, or
verified when it has not.

The objective is not to produce a large amount of code. The objective is to
produce **a correct, secure, maintainable, fast, and genuinely
production-ready software system** — one you would be comfortable shipping
under your own name.

---

# [POPULATED] ASSUMPTIONS REGISTER

Each entry follows the ASSUMPTION / REASON / IMPACT format in compressed
form. IDs A-56…A-59 are unused. Rows marked **Superseded** were replaced by a
later decision or assumption and are kept only for traceability. "Runtime-configurable" means an
authorised user can change it later without a release.

| ID | Assumption | Reason | Impact |
|---|---|---|---|
| A-01 | Working codename "Serene Pulse" for repo/internal use | Needed for repo/package names; harmless to rename | Naming only |
| A-02 | CX Administrator is the heaviest daily portal user | Owns review, classification, follow-up per REQ §9 | Prioritise triage UX |
| A-03 | ~~Machine "Integration Client" role for invitation API~~ **Superseded by D-33** | REQ §5.1 "authorized integration" | M17, auth |
| A-04 | Users can hold multiple role grants; permissions are a union | Common in branch orgs (e.g. a manager covering two branches) | RBAC model |
| A-05 | Single tenant | One company | No tenant column |
| A-06 | Admin portal desktop-first but fully responsive | Analytics density; REQ §10 responsiveness | Layout |
| A-07 | Greenfield | No repo or plan provided | State A |
| A-08 | PostgreSQL | Relational + RLS + JSONB + constraints | DB layer |
| A-09 | ~~Redis~~ **Superseded by D-27 (no Redis, A-117)** | Sessions, rate limits, cache, queues in one service | Infra |
| A-10 | ~~BullMQ background workers~~ **Superseded by D-27 (pg_cron/pgmq, A-118)** | Non-blocking sends, roll-ups, schedules | apps/worker |
| A-11 | Versioned REST + OpenAPI 3.1 | Simple, integration-friendly | API |
| A-12 | ~~Token → httpOnly survey-session cookie; token removed from address bar~~ **Superseded by rewritten: anonymous session cookie (D-33)** | Reduces token leakage (history, screenshots, referrers) | Survey auth |
| A-13 | No customer file uploads | Not in REQ; avoids attack surface | Files |
| A-14 | No payments | Not in REQ | — |
| A-15 | ~~Docker~~ **Superseded by A-121** | Reproducible deploys | DevOps |
| A-16 | GitHub Actions | Common default; fits D-27 tooling (wrangler, supabase CLI) | CI/CD |
| A-17 | OTel + Sentry + Grafana-class monitoring | Vendor-neutral observability | Ops |
| A-18 | OWASP ASVS L2 baseline | Insurance PII warrants L2 | Security testing |
| A-19 | Field-level encryption + HMAC for phone/name | Separate identity from analytics (REQ §10.1) | pii schema |
| A-20 | ~~Mandatory MFA for all internal users~~ **Superseded by D-23** | Access to customer data and complaint records | Auth |
| A-21 | ~~128-bit tokens stored as SHA-256 hash only~~ **Superseded by D-33** | DB leak cannot be replayed into survey access | Invitations |
| A-22 | Transactional email for staff notifications | Alerts, reports, resets need a channel | M14 |
| A-23 | ~~Company-owned short link domain~~ **Superseded by D-29, D-33** | Fits one SMS segment; third-party shorteners hurt trust and deliverability | Domains |
| A-24 | Survey budgets: TTI ≤ 2 s on 3G, ≤ 120 KB, JS ≤ 35 KB | Needed to hit 60 s total on slow networks | Survey build |
| A-25 | No network round-trip on page change; background sync | Instant tap-to-advance | Survey architecture |
| A-26 | Internal dashboard p95 ≤ 1.5 s (REQ 3 s) | Headroom over REQ | Roll-ups, cache |
| A-27 | Configurable values get sensible defaults, not questions | REQ makes them runtime-configurable | Settings |
| A-28 | Warm, plain, non-playful tone | Insurance trust vs DS playful voice | Copy |
| A-29 | Minimal motion; no parallax/loops | REQ §2.9 | Motion tokens |
| A-30 | DS accessibility defects not copied | REQ §10 accessibility | Components |
| A-31 | ~~TypeScript modular monolith~~ **Superseded by A-115** | Shared schemas/metrics; right-sized | Architecture |
| A-32 | Exact additive daily roll-ups + nightly rebuild | Fast, exact, self-healing analytics | M08 |
| A-33 | 99.9% survey / 99.5% portal availability | Survey links arrive any hour | Infra sizing |
| A-34 | Transactional outbox | No lost side effects | Worker |
| A-35 | WCAG 2.2 AA | Current standard; REQ §10 | All UI |
| A-36 | Coverage targets 80% domain / 100% metrics | Metrics drive management decisions | CI |
| A-37 | RPO 15 min / RTO 4 h | Managed PITR makes this cheap | DR |
| A-38 | Broad mobile browser support + no-JS fallback | Customers on low-end/old devices | Survey |
| A-39 | Offline-tolerant submit | Slow networks (REQ §2.1) | Survey |
| A-40 | Semantic status colours added | DS lacks warning/info/error UI | Tokens |
| A-41 | App type scale (16 px body, 14 px tables) | DS is marketing-scale | Typography |
| A-42 | Admin radii 16–24 px; inputs 12–16 px | DS 48 px panels too large for dense UI | Components |
| A-43 | CVD-safe chart palettes, NPS segment colours | DS has no data-viz palette | Charts |
| A-44 | Input/choice-card specs | DS has no inputs | Forms |
| A-45 | Native select ≤ 15 options, combobox above | Speed and accessibility | Branch picker |
| A-46 | Toast/dialog/drawer/skeleton specs | DS has none | Components |
| A-47 | Data table spec | DS has none | Tables |
| A-48 | Sidebar app shell | Standard for analytics consoles | Layout |
| A-49 | Auth screen spec | DS app pages were unreachable | Auth UI |
| A-50 | No dark mode in R1 | Low value; tokens allow later | Theming |
| A-51 | Single breakpoint system 360/810/1200/1440 | Avoids DS inconsistency #9 | CSS |
| A-52 | 0–10 scale as two rows on phones; no slider | 44 px targets; accuracy | Page 4 |
| A-53 | Scales ordered low→high consistently; no face icons | Consistency, bytes, cultural neutrality | Pages 2–3 |
| A-54 | 200% text and 400% zoom checks | WCAG reflow | QA |
| A-55 | Auto-advance announced and keyboard-safe | WCAG 3.2.2 compliance | Survey a11y |
| A-60 | ~~Invitation expiry default 14 days~~ **Superseded by D-33** | Balances recall and response window | Settings |
| A-61 | Server-side draft enables cross-device resume | Interrupted mobile sessions are common | Sessions |
| A-62 | ~~Delivered only from provider receipts~~ **Superseded by D-33** | REQ §11.6 | M05 |
| A-63 | ~~CSV bulk upload ≤ 10 MB / 50k rows with row errors~~ **Superseded by D-33** | Operational need without integrations | M05 |
| A-64 | Attribution corrections as audited overlay | REQ forbids silent change, implies visible change | FR-41 |
| A-65 | In-app notification centre | Case work needs it | M14 |
| A-66 | Survey preview mode | Safe configuration | M04 |
| A-67 | Erasure de-identifies, keeps ratings | Privacy + analytics continuity | M16 |
| A-68 | Separation of duties; two-person PII grants | Insider-risk control | RBAC |
| A-69 | Mermaid diagrams in repo | Versioned docs | Docs |
| A-70 | DB conventions (uuid v7, audit fields, optimistic locks) | Standard practice | Schema |
| A-71 | Case categories seeded from improvement factors + extras | Cases need issue category (REQ §8.2) | M11 |
| A-72 | Model supports multiple surveys, one used | Cheap flexibility | M04 |
| A-73 | Version bound at session start; catalogue snapshot at publish | Customers never see retired versions | M04/M06 |
| A-74 | Comments in response row with column grants | Simpler; separable later | Schema |
| A-75 | One open case per response | Avoid duplicate work | M11 |
| A-76 | Export links expire in 7 days | Limit data spread | M13 |
| A-77 | Hash-chained audit log + WORM copy | Tamper evidence | M15 |
| A-78 | ~~Response rate org-wide and per delivery channel only~~ **Superseded by D-33** | Invitations carry no branch/product | Dashboards |
| A-79 | RLS via session variables | REQ §9.3 database-level enforcement | DB |
| A-80 | Monorepo structure | Shared packages | Repo |
| A-81 | Coding standards | Consistency | All code |
| A-82 | Failure-scenario behaviours | Resilience | Tests |
| A-83 | Deactivated-mid-session branch accepted and flagged | Customer acted in good faith | M07 |
| A-84 | Staff accounts by invitation only | Internal system | M01 |
| A-85 | Optional portal IP allowlist / VPN | Defence in depth | Infra |
| A-86 | Draft customer error copy | Needed for build; refine with brand | Survey |
| A-87 | No push notifications | No native app in scope | M14 |
| A-88 | ~~SMS template ≤ 160 chars~~ **Superseded by rewritten: guidance wording for Serene's SMS team** | Cost and readability | M05 |
| A-89 | CI-enforced traceability | Prevent silent gaps | QA |
| A-90 | Life and health products removed from the survey | Person's product list (general insurer) | M03 seed |
| A-91 | Jurisdiction Ghana; Act 843; Africa/Accra; +233; DD/MM/YYYY | All branches are in Ghana | Privacy, i18n, phones |
| A-92 | Branch codes and title-case names; Accra Main flagged head office | Stable IDs (REQ §14.1); readable labels | M02 seed |
| A-93 | Regions = Ghana administrative regions | Serene has no operating zones (D-14) | Regional analytics |
| A-94 | Plain-language customer product labels; order by likely frequency | Official names (e.g. "Engineering Policies") confuse retail customers | Page 1 |
| A-95 | English at launch | Official language; reach | i18n |
| A-96 | Four-eyes survey publication | Wording changes break trend comparability | M04 |
| A-97 | Region-at-submission snapshot | Re-regioning must not rewrite history | Analytics |
| A-98 | Labels shown as at survey version | Historical fidelity | Reports |
| A-99 | ~~Eligibility excludes transactions completed > 30 days ago~~ **Superseded by D-10, D-33** | Recall accuracy | M05 |
| A-100 | ~~Max one invitation per customer per 30 days~~ **Superseded by D-33 (device cooldown A-123)** | Survey fatigue, SMS cost | M05 |
| A-101 | ~~Ghana mobile validation (+233) with E.164 fallback~~ **Superseded by A-125** | Data quality | M05 |
| A-102 | Survey layout spec | REQ progress/back requirements | Survey UI |
| A-103 | One-line context sentence, no intro page | Saves a page and seconds | Page 1 |
| A-104 | Product as 2-column chips, not dropdown | One tap instead of two | Page 1 |
| A-105 | Disabled Continue explains what's missing | HCI: no silent dead ends | Page 1 |
| A-106 | Comment ≤ 1,000 chars; other-text ≤ 200/80 | Abuse limits; still generous | Validation |
| A-107 | Empathetic Page 5 heading when CSAT ≤ 2 | REQ allows contextual relevance | Page 5 |
| A-108 | "Main improvement factor" excludes "Nothing" | Otherwise the KPI would often be meaningless | M08 |
| A-109 | Repeat complaint = ≥ 2 flags/cases per customer in 90 days | REQ §8.5 metric undefined | M08 |
| A-110 | No map visualisation | 13 branches; avoids heavy dependency | Dashboards |
| A-111 | Initial comment keyword list (to confirm) | REQ "concerning comment" needs a mechanism | M11 |
| A-112 | Auto-escalate one level on SLA breach | Common CX practice | M11 |
| A-113 | No default targets | Targets are a business decision; inventing them misleads | M12 |
| A-114 | Scheduled reports to portal users only | Data-spread control | M13 |
| A-115 | Cloudflare Worker (Hono) survey + Vite React SPA portal + Supabase RPC/RLS backend | Fits D-27 free tiers (Worker CPU/size limits), one maintainer (D-28), RLS satisfies REQ §9.3 | Whole stack |
| A-116 | Supabase region eu-west-2 (London) | Closest Supabase region to Accra, same time zone; offshore allowed (D-03) | Latency, privacy notice |
| A-117 | No Redis; edge cache + roll-ups instead | Small scale; Redis not on the chosen platforms | Caching |
| A-118 | pg_cron + pgmq + pg_net for background work | Native to Supabase free | Jobs |
| A-119 | Roles/scopes in JWT via access-token hook; MFA-ready | Supabase-native RBAC with RLS | M01 |
| A-120 | Seed admin from env vars; forced password change at first sign-in; password never stored in files | The initial password was shared in chat and must be replaced | M01, X-08 |
| A-121 | No containers in production | Serverless platforms | DevOps |
| A-122 | Free monitoring stack (Sentry, Cloudflare analytics, uptime monitor, quota snapshots) | Fits D-27 | Ops |
| A-123 | Device cookie cooldown (24 h) + Turnstile + rate limit for the open link | Deters repeats and spam without identifying people (D-33) | M05, M07 |
| A-124 | Resend for email (free tier) | Supabase's built-in SMTP is not for production; fits D-30 | M14 |
| A-125 | Phone field (Ghana format) revealed only when the consent toggle is on; optional first name | With an open link the system has no other way to contact (D-15, D-33) | Page 5, pii |
| A-126 | Interpretation of D-19: per-rule and per-factor "Flag" (default ON) and "Auto-create case" (default OFF) toggles; queue defaults to CSAT ≤ 2 view with bulk dismiss | Reconciles "toggle auto-case", "all flagged by default" and "flag only, no automatic cases" | M11 |
| A-127 | Logo usage sizes; trace an interim SVG; request official vector | Supplied PNG is 222 × 108 px, too small for print | Brand, posters |
| A-128 | Visual treatment: white pages, yellow top band, blue actions | Applies D-25 with accessible contrast | UI |
| A-129 | Free-tier mitigations and upgrade triggers | D-27 has no SLA, backups or headroom | Ops, DR |
| A-130 | QR points have codes and posters but no branch link | REQ §2.4 forbids location-as-branch | M05 |
| A-131 | Schemas public/survey/analytics/pii/audit/ops | Limits what the Data API exposes | DB |
| A-132 | Seed departments list | D-17 chose routing, not the department list | M02 |
| A-133 | JWT 15 min + function re-check of grants | Revocations take effect quickly | Security |
| A-134 | Ghana public holidays maintained by System Admin | D-18 working-day SLA | M02, M11 |
| A-135 | Turnstile outage: accept as `unverified`, excluded by default | Never lose real feedback; keep KPIs clean | M07, M08 |
