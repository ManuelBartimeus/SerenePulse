# Traceability matrix (living gap audit)

Status values follow the GAP AUDIT protocol: `MISSING` · `PARTIAL` · `COMPLETE` · `UNDOCUMENTED GAP`. A row is `COMPLETE` only when its tests exist and pass in CI. CI (from MS-01) parses this table and fails when a row marked `COMPLETE` has no test ID, or when a test ID listed here doesn't exist.

REQ imported 2026-11-04.

## Functional requirements

| ID | Requirement (short) | Module | Milestone | Tests (planned IDs) | Status |
|---|---|---|---|---|---|
| FR-01′ | Public survey access; new anonymous session on Page 1 | M05/M06 | MS-05/06 | T-M05-001 session start (with/without src), T-M06-perf-001 | MISSING |
| FR-02 | Five-page survey structure (Page 1 three context questions; Pages 2–4 one rating each; Page 5 optional + submit) (REQ §2.2, §2.9) | M06 | MS-06 | T-M06-100 page count and per-page question layout | MISSING |
| FR-03 | Transaction identification on Page 1: channel and product always required, issuing branch where applicable, stored as structured ids (REQ §2.4, §4.1). Branch applies to walk-in (required) and Other (optional) only | M06/M03 | MS-06 | T-M06-101 Page 1 values stored as catalogue ids; T-M06-102 Continue disabled until applicable required fields complete | MISSING |
| FR-04 | Conditional branch selection. REQ: "according to configured channel rules" (§3, §14.3) → narrowed: branch question shown only for walk-in (required) and Other (optional); no "I'm not sure" option (Rule 3) | M04/M06 | MS-04/06 | T-M06-103 channel change re-evaluates branch and clears a now-irrelevant branch (REQ §2.4); see Rule 3 for rule tests | MISSING |
| FR-05 | Automatic navigation: selecting a rating on Pages 2–4 saves and advances immediately, no Continue button (REQ §2.3) | M06 | MS-06 | T-M06-104 tap-to-advance on Pages 2, 3, 4 | MISSING |
| FR-06 | Back navigation: visible Back control on every page after Page 1 (REQ §2.3) | M06 | MS-06 | T-M06-105 Back present and working on Pages 2–5 | MISSING |
| FR-07 | Response persistence: answers and comments stay intact going back and forward; changes update the session, no duplicate (REQ §2.3) | M06 | MS-06 | T-M06-106 back/forward round trip keeps all answers and comment | MISSING |
| FR-08 | CSAT collection: integer 1–5, mandatory (REQ §2.5) | M06/M07 | MS-06 | T-M07-100 server rejects missing/out-of-range CSAT | MISSING |
| FR-09 | CES collection: integer 1–5, mandatory (REQ §2.6) | M06/M07 | MS-06 | T-M07-101 server rejects missing/out-of-range CES | MISSING |
| FR-10 | NPS collection: integer 0–10, all 11 values shown, mandatory (REQ §2.7) | M06/M07 | MS-06 | T-M06-107 0–10 all rendered; T-M07-102 server rejects missing/out-of-range NPS | MISSING |
| FR-11 | Optional diagnostic feedback: one improvement factor, optional Other clarification, optional comment stored separately; page skippable (REQ §2.8) | M06/M07 | MS-06 | T-M06-108 skip Page 5 and submit; T-M07-103 factor stored as id, comment stored separately | MISSING |
| FR-12 | Progress indicator: current and remaining steps, consistent across pages (REQ §2.3) | M06 | MS-06 | T-M06-109 progress state on each page | MISSING |
| FR-13 | Completion tracking: start, interactive, submission timestamps and completion duration (REQ §4.2, §11.7) | M07/M06 | MS-06 | T-M07-104 all timestamps recorded; duration from interactive (see Rule 18) | MISSING |
| FR-14′ | Duplicate prevention: one per session, idempotent replay, cooldown, Turnstile | M07/M05 | MS-06 | T-M07-001 50 parallel submits → 1 row; T-M07-002 replay same reference; T-M05-010 cooldown boundary; T-M05-011 Turnstile fail path | MISSING |
| FR-15 | Executive dashboard: organisation-wide KPIs with reporting period and n per metric (REQ §6.1). REQ "feedback response rate" KPI → replaced by completion rate (no invitations, D-33) | M09/M08 | MS-07/08 | T-M09-100 KPI cards show period and n; T-M08-100 completion-rate maths | MISSING |
| FR-16 | Branch analytics: executive selects a branch and sees its metrics (REQ §6.2) | M09/M08 | MS-08 | T-M09-101 branch selection recalculates all KPIs and charts | MISSING |
| FR-17 | Branch comparison for the same reporting period (REQ §6.2, §10.2; Rule 9) | M08/M09 | MS-07/08 | T-M08-020 identical-period benchmark; T-M09-102 comparison table shows n and low-sample marking | MISSING |
| FR-18 | Channel analytics: per-channel n, CSAT, NPS, CES, negative rate, top factor, trend (REQ §6.3) | M08/M09 | MS-07/08 | T-M08-101 per-channel aggregates; T-M09-103 channel view | MISSING |
| FR-19 | Product analytics: same metrics per product (REQ §6.4) | M08/M09 | MS-07/08 | T-M08-102 per-product aggregates; T-M09-104 product view | MISSING |
| FR-20 | Dashboard filtering by date, branch, channel, product, improvement factor, applied consistently to KPIs, charts, tables, records (REQ §7). Date = submission date only (no transaction-date basis) | M09/M08 | MS-07/08 | T-M08-103 filter predicate per dimension; T-M09-105 one filter change updates every widget and drill-down | MISSING |
| FR-21 | Case creation: rules flag feedback or create cases; manual creation (REQ §8.1). Flags by default, cases by choice (Rule 13, FR-46); detractor ≠ complaint (Rule 11) | M11 | MS-10 | T-M11-100 CSAT 1–2 rule flags; T-M11-101 manual case from a record | MISSING |
| FR-22 | Case assignment to officer or department (REQ §8.4) | M11 | MS-10 | T-M11-102 assign/reassign recorded in activity history | MISSING |
| FR-23 | Case resolution and closure through New → Assigned → In Progress → Resolved → Closed (REQ §8.3; Rule 21) | M11 | MS-10 | T-M11-103 allowed/forbidden status transitions | MISSING |
| FR-24 | Role-based access: users only see what their role permits, enforced server-side and in the DB (REQ §9; Rule 10) | M01 | MS-02 | T-M01-100 role × action permission matrix via API (see T-DB-rls-* for Rule 10) | MISSING |
| FR-25 | Report export: role-scoped, PII-minimised CSV/XLSX (REQ §13.4, §10.1) | M13 | MS-09 | T-M13-100 export scope follows role/branch; T-M13-101 PII columns excluded without permission | MISSING |
| FR-26 | Survey configuration: wording, options, mandatory flags, conditional rules (REQ §14.4), within survey-length guardrails (Rule 15) | M04 | MS-04 | T-M04-100 edit and publish a draft configuration | MISSING |
| FR-27 | Survey versioning: historical responses keep their original version (REQ §4.3, §14.4; Rule 6) | M04/M07 | MS-04/06 | T-M04-101 publishing v2 leaves v1 responses bound to v1 | MISSING |
| FR-28 | Audit logging of administrative and case activities (REQ §14.5) | M15 | MS-02 | T-M15-001 each §14.5 event type writes an entry; T-M15-002 chain verification detects tampering | MISSING |
| FR-29 | Automated alerts: configured thresholds trigger notifications (REQ §13.2) | M12/M14 | MS-11 | T-M12-100 threshold breach raises alert and notification | MISSING |
| FR-30 | Data protection: customer and feedback data protected from unauthorised access; encrypted in transit and at rest (REQ §10, §10.1) | M16/M17 | MS-02/09 | T-M16-100 PII denied without `pii.view`; T-M17-100 TLS-only/HSTS on all hosts | MISSING |
| FR-31 | Source tracking; funnel per source; never used as branch | M05/M09 | MS-05/08 | T-M05-020 src parsing; T-M08-030 funnel counters; T-M05-021 no branch inference | MISSING |
| FR-32 | QR poster management (create, poster PDF/SVG, deactivate, inactive scans) | M05 | MS-05 | T-M05-030…033 | MISSING |
| FR-33 | Resume within 24 h | M06 | MS-06 | T-M06-020 reload resumes page + answers | MISSING |
| FR-34 | Already-shared page | M06 | MS-06 | T-M06-021 | MISSING |
| FR-35 | Optional contact consent + phone | M06/M16 | MS-06 | T-M06-030 phone required only while on; T-M16-001 encrypted at rest | MISSING |
| FR-36 | Low-sample disclosure | M08/M09 | MS-07/08 | T-M08-010 threshold; T-M09-010 badge + rank exclusion | MISSING |
| FR-37 | Benchmark comparison | M08 | MS-07 | T-M08-020 | MISSING |
| FR-38 | Target tracking states | M12/M09 | MS-11 | T-M12-001 met/not met/no target/no data | MISSING |
| FR-39 | Usability telemetry | M06 | MS-06 | T-M06-040 event set | MISSING |
| FR-40 | Privacy notice links | M16 | MS-06 | T-M06-050 links on Page 1, toggle, confirmation | MISSING |
| FR-41 | Attribution corrections (non-silent) | M10 | MS-13 | T-M10-001 original visible; T-M10-002 proposer ≠ approver | MISSING |
| FR-42 | Staff account security (invite-only, forced change, lockout, timeout) | M01 | MS-02 | T-M01-001…006 | MISSING |
| FR-43 | In-app notifications | M14 | MS-11 | T-M14-001 | MISSING |
| FR-44 | Survey preview without real responses | M04 | MS-04 | T-M04-020 | MISSING |
| FR-45 | Data-subject requests (find, erase) | M16 | MS-09 | T-M16-010 | MISSING |
| FR-46 | Flag / Auto-case toggles, defaults ON/OFF | M11 | MS-10 | T-M11-001 defaults; T-M11-002 toggle effects | MISSING |

## REQ §17 acceptance tests

Playwright end-to-end tests. §17.1 is given "an executive administrator is logged in" and selects a branch and reporting period. §17.2's REQ precondition, "a customer has opened a valid feedback invitation", is replaced by **"a customer has opened the survey"** (public link, anonymous session; no invitations, D-33).

| Step | Playwright test ID | Milestone |
|---|---|---|
| §17.1.1 Display feedback for the selected branch and period | T-M09-e2e-001 | MS-08 |
| §17.1.2 Recalculate CSAT, NPS, CES, response volume and other metrics | T-M09-e2e-002 | MS-08 |
| §17.1.3 Compare the branch with company-wide benchmarks for the same period | T-M09-e2e-003 | MS-08 |
| §17.1.4 Update charts, tables and improvement-factor breakdowns | T-M09-e2e-004 | MS-08 |
| §17.1.5 Allow authorised drill-down into feedback records | T-M10-e2e-001 | MS-08 |
| §17.1.6 Keep selected filters when moving between dashboard views | T-M09-e2e-005 | MS-08 |
| §17.2.1 Save the Page 2 rating to the current survey session | T-M06-e2e-001 | MS-06 |
| §17.2.2 Go straight to Page 3 | T-M06-e2e-002 | MS-06 |
| §17.2.3 Show the correct progress state | T-M06-e2e-003 | MS-06 |
| §17.2.4 Allow navigating backwards | T-M06-e2e-004 | MS-06 |
| §17.2.5 Restore the previous rating without reselecting it | T-M06-e2e-005 | MS-06 |
| §17.2.6 Allow changing the rating and continuing without a duplicate response | T-M06-e2e-006 | MS-06 |

## Business rules (SPEC Rules 1–21)

| Rule | Tests | Milestone | Status |
|---|---|---|---|
| 1 One-minute survey | T-M04-010 guardrails; T-M06-perf-002 scripted completion median < 25 s; usability study (X-11) | 04, 06, 09 | MISSING |
| 2 Customer-reported context only | T-M05-021 | 05 | MISSING |
| 3 Walk-in branch rule | T-M04-001…004 (JS) + T-DB-survey-001…004 (SQL) | 04, 06 | MISSING |
| 4 One per session, deterred repeats | see FR-14′ | 06 | MISSING |
| 5 Immutability | T-DB-survey-010 | 06 | MISSING |
| 6 Version fidelity | T-M08-040 scale-signature guard | 07 | MISSING |
| 7 Honest denominators | T-M08-001…009 metric maths (100% coverage); "No data" ≠ 0 | 07 | MISSING |
| 8 Low-sample protection | T-M08-010 | 07 | MISSING |
| 9 Same-period comparisons | T-M08-020 | 07 | MISSING |
| 10 Branch scope | T-DB-rls-* generated matrix | 02, 07 | MISSING |
| 11 Detractor ≠ complaint | T-M11-010 no NPS rule | 10 | MISSING |
| 12 Anonymous unless opted in | T-M16-001, T-M10-010 masking | 06 | MISSING |
| 13 Flags by default, cases by choice | T-M11-001 | 10 | MISSING |
| 14 No demo data as real | T-M17-001 seed refuses production; watermark test | 01 | MISSING |
| 15 Survey length protected | T-M04-010 | 04 | MISSING |
| 16 Historical attribution preserved | T-M02-010 region-at-submission | 03 | MISSING |
| 17 Separate data sources | design only (Phase 3 hook) | n/a | MISSING |
| 18 Completion time from interactivity | T-M07-010 | 06 | MISSING |
| 19 Changing an answer updates | T-M06-010 | 06 | MISSING |
| 20 Optional stays optional | T-M06-031 CSAT ≤ 2 Page 5 | 06 | MISSING |
| 21 Cases closed by CX/Exec | T-DB-case-010 | 10 | MISSING |

## Requirement overrides (must not be "fixed back")

| Override | Guard test |
|---|---|
| No response rate anywhere | T-M09-020: no UI string or RPC field named "response rate" |
| No invitations / tokens | T-M05-040 route inventory has no invitation endpoints |
| No "I'm not sure" branch option | T-M04-005 |
| Submission date only (no date-basis switch) | T-M08-050 |

## Phase 0 gaps (UG-01…UG-12)

| Gap | Test | Milestone | Status |
|---|---|---|---|
| UG-01 lockout via sign-in function | T-M01-003 | 02 | MISSING |
| UG-02 12 h absolute session | T-M01-005 | 02 | MISSING |
| UG-03 large XLSX | spike S-03, T-M13-010 | 01, 09 | MISSING |
| UG-04 audit chain serialisation | T-DB-audit-002 concurrent appends keep the chain valid | 02 | MISSING |
| UG-06 no-JS → unverified | T-M06-060 | 06 | MISSING |
| UG-07 no Sentry SDK in survey bundle | bundle-size budget check | 06 | MISSING |
| UG-12 rate rule threshold | T-M05-012 20/s from one IP passes, 100/s blocked | 05 | MISSING |

## REQ "must" statements with no FR (found during import, 2026-11-04)

| REQ | Requirement | Covered by | Tests (planned) | MS | Status |
|---|---|---|---|---|---|
| §14, §14.1–14.3, §15.3 | Manage branches, regions, products, channels: add, edit, deactivate, assign managers; never hard-coded | M02/M03 | T-M02-001…006, T-M03-001…006, T-M03-010 "no catalogue literals in app code" lint | 03 | MISSING |
| §3, §14.3 | Company can configure which channels require a branch | `service_channels.branch_requirement` (required/optional/hidden) is runtime-configurable; D-12 only sets the seed. Takes effect at the next survey version publish | T-M03-020 change → new version reflects it | 03/04 | MISSING |
| §8.4 | Case actions: change priority, internal notes, investigation, escalate, corrective action, activity history | M11 `case_*` RPCs | T-M11-110…115 | 10 | MISSING |
| §8.1 | Case-creation conditions configurable (serious factors, concerning comments) | `flag_rules` params + keyword list in settings + per-factor toggles (FR-46) | T-M11-120 thresholds, T-M11-121 keyword edits | 10 | MISSING |
| §9.1(6) | Filter by region | Common filter set (M08) | T-M08-110 | 07 | MISSING |
| §9.1(8–10) | View feedback needing attention, monitor corrective actions, configure targets | S-A1 "Needs attention", S-B4 corrective-action filter, S-B12 targets | T-M09-110, T-M11-130, T-M12-110 | 08/10/11 | MISSING |
| §2.1, §12 | Clear confirmation after submit | S-C6 | T-M06-110 reference shown; Back after submit shows confirmation | 06 | MISSING |
| §2.1, §12 | Works on common mobile devices and slow networks | Viewport + throttle e2e; Lighthouse CI | T-M06-120 six viewports, T-M06-121 Slow 3G + 400 ms RTT, T-M06-122 offline mid-survey | 06 | MISSING |
| §4.3, §15.3 | Distinguish branch statuses | `branch_status` selected/other/not_applicable/not_provided ("unknown" removed with "I'm not sure", D-13) | T-DB-survey-020 | 06 | MISSING |
| §10.1 | Retention and deletion policy; never collect policy or national ID numbers | M16 retention jobs; M04 guardrail (no identity questions) | T-M16-110 each retention class; T-M04-110 guardrail | 09/04 | MISSING |
| §8.5, §13.1, §13.3 | Resolution metrics incl. repeat complaints; target configuration; scheduled reports | M08/M12/M13 | T-M08-120, T-M12-110, T-M13-110 | 13/11/12 | MISSING |

## Non-functional requirements (REQ §10)

| NFR | Test | MS | Status |
|---|---|---|---|
| Dashboard summary ≤ 3 s (internal p95 ≤ 1.5 s) | T-NFR-perf-001 Playwright timing on throttled Fast 4G; k6 25 users | 08 | MISSING |
| Survey budgets (LCP ≤ 2 s, ≤ 120 KB, JS ≤ 35 KB) | T-NFR-perf-002 Lighthouse CI budgets | 06 | MISSING |
| Accessibility WCAG 2.2 AA | T-NFR-a11y-001 axe zero serious/critical on every route; manual SR pass log | 06/08 | MISSING |
| Localisation (en-GH formats, Africa/Accra, strings externalised) | T-NFR-l10n-001 date/number formatting; lint for literal UI strings | 06/08 | MISSING |
| Availability (99.5% measured, monitored) | Uptime monitor report in each checkpoint | 01 | MISSING |
| Security baseline (ASVS L2 minus MFA) | ZAP baseline, permission matrix, secret scan | 02/09 | MISSING |
