# Low-fidelity wireframes

These are structure and states only. Visual values come from SPEC E1–E10, implemented in `packages/ui`. Phone layouts are drawn at 360 px; the survey is mobile-first. Every screen has to cover the states in the matrix at the end.

## Survey (feedback.<domain>)

### S-C1 Page 1: transaction information

```text
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀  ← 4 px yellow band (decorative)
[Serene logo 32px]          Step 1 of 5
[■■■■■■□□□□□□□□□□□□□□□□□□□□□□□□]    ← 5-segment blue progress
Thanks for choosing Serene Insurance.
5 quick questions, under a minute.

How did you obtain your insurance policy?
┌──────────────────────────────────┐
│ ○ Mobile application             │  ← full-width choice cards ≥ 56 px
├──────────────────────────────────┤
│ ● Walk-in at a branch office   ✓ │  ← selected: 2px blue border, blue-50, check
├──────────────────────────────────┤
│ ○ Company website …  ○ Other     │
└──────────────────────────────────┘
  ↓ (revealed only for Walk-in / Other; aria-live "Branch question added")
Which branch issued your policy?
[ Select a branch               ▾ ]   ← native <select>: 13 A–Z + "Other branch"
The branch that issued your policy, which may differ from one you visited.

What type of insurance policy did you get?
[Motor insurance ] [Fire & property ]   ← 2-column chips ≥ 360 px
[Marine          ] [Travel          ]
[General accident] [Engineering     ]
[Workmen's comp. ] [Bonds (e.g. bid…)]
[Other           ]
Privacy notice
┌──────────────────────────────────┐
│           Continue               │  ← sticky above safe area; disabled until valid.
└──────────────────────────────────┘     A tap while disabled scrolls to the first missing field.
```

### S-C2 / S-C3 Pages 2–3: five-point scales

```text
[logo]                      Step 2 of 5
[■■■■■■■■■■■■□□□□□□□□□□□□□□□□□□]
‹ Back
How satisfied are you with the insurance
service you received?                     ← display 28/36, focus lands here
Choosing an answer moves you to the next question.
┌──────────────────────────────────┐
│ 1  Very dissatisfied             │   radiogroup; each option "1, Very dissatisfied"
│ 2  Dissatisfied                  │   phones: vertical 1→5
│ 3  Neither                       │   ≥ 810 px: horizontal 5-up
│ 4  Satisfied                     │   tap → selected state, 250 ms hold, slide 240 ms
│ 5  Very satisfied                │
└──────────────────────────────────┘
```

### S-C4 Page 4: 0–10 scale

```text
How likely are you to recommend Serene Insurance to someone you know?
 < 520 px                               ≥ 520 px
[0][1][2][3][4][5]                      [0][1][2][3][4][5][6][7][8][9][10]
[6][7][8][9][10]                        Not at all likely      Extremely likely
Not at all likely   Extremely likely    (square buttons ≥ 48 px; no slider)
```

### S-C5 Page 5: additional feedback

```text
What is the main thing we could improve? (optional)
  ← if CSAT ≤ 2: "We're sorry we fell short. What should we improve?"
[Speed of service] [Staff professionalism] [Communication…] [Ease…]
[Technical issues] [Pricing and charges] [Other] [Nothing, I am satisfied]
Anything else you'd like to tell us? (optional)
┌──────────────────────────────────┐
│                                  │  counter appears from 800: "812 / 1000"
└──────────────────────────────────┘
[ ○— ] You may contact me about my feedback
       We'll only use your number to follow up on this feedback. Privacy notice
   ↓ when on
   Your mobile number   [ 024 123 4567      ]  (numeric keypad)
   Your first name (optional) [           ]
┌──────────────────────────────────┐
│         Submit feedback          │  → "Sending…" + spinner, disabled
└──────────────────────────────────┘
```

### S-C6 Confirmation · S-C7 Already shared · S-C8 Unavailable · S-C10 Offline/error

```text
S-C6 ┌─────────── blue panel ───────────┐   S-C7  [logo]
     │ ❦ (yellow leaf)                  │         You've already shared your
     │ Thank you! Your feedback has     │         feedback — thank you!
     │ been received.                   │         Reference FB-2026-000123 (if known)
     │ Reference  FB-2026-000123        │
     │ We read every response and use   │   S-C8  We can't take feedback right now.
     │ it to improve our service.       │         Please try again a little later.
     │ Our CX team may call you on      │         [ Try again ]   (no form shown)
     │ 024 ••• 4567.   (only if consent)│
     └──────────────────────────────────┘   S-C10 inline banner above Submit:
     Privacy notice                               "You seem to be offline. Your answers are
                                                   saved on this device — tap Submit again…"
```

S-C9 Privacy notice: a single prose column at 560 px, with headings: Who we are · What we collect · Why · How long · Your rights · Contact. S-C11 No-JS: all five sections stacked on one page, posted to the server; radios are native, there's no auto-advance, and one Submit at the end.

## Portal (cx.<domain>)

### App shell (E7)

```text
Desktop ≥ 1200
┌────────────┬──────────────────────────────────────────────────────────────┐
│ [logo 28]  │ Last 30 days · All branches · All channels ▾   🔍   🔔3   NB ▾ │ 64px
│            ├──────────────────────────────────────────────────────────────┤
│▌Overview   │  Executive overview            Data updated 2 min ago        │
│ Branches   │  ┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐┌─────┐    │
│ Channels   │  │CSAT%││Avg  ││ NPS ││ CES ││Resp.││Compl││Neg. ││Main │    │
│ Products   │  │82.4 ││4.21 ││ +31 ││4.05 ││1,204││ 71% ││ 6%  ││Speed│    │
│ Trends     │  │n=1204│▲2.1 ││ ... ││     ││     ││ ⓘ   ││     ││ 23% │    │
│ Factors    │  └─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘└─────┘    │
│ Sources    │  [ Trend chart: metric ▾ ─────────────────── ] [NPS composition]│
│ Records    │  [ Branch table: n · CSAT · NPS · CES · Neg · vs target · ⚠low] │
│ Flags   12 │  [ Channel mini ] [ Product mini ]  [ Needs attention (yellow-50)]│
│ Cases    4 │                                                              │
│ ── Admin ──│                                                              │
│ QR points  │  264 px sidebar (collapses to 72 px rail); nav is permission-aware │
└────────────┴──────────────────────────────────────────────────────────────┘
Phone < 810: top bar [☰ button aria-expanded] [logo] [🔔] · "Filters (3)" button → full-screen
sheet with Apply + result count · KPI cards 2-up · tables → stacked cards (4 fields + Details).
```

### S-B1/S-B2 Records + drawer

```text
┌ Records ───────────────────────────── [Export ▾] ┐ ┌ FB-2026-000123 ─────────── ✕ ┐
│ 🔍 reference or comment                          │ │ Submitted 03/11/2026 14:12   │
│ Ref        Date   Source Channel Branch Prod CSAT│ │ Source: QR "Tema C25 counter"│
│ FB-…0123  03/11  QR     Walk-in Kasoa  Motor  2 ▸│ │ Q: How satisfied…  2 Dissat. │
│ FB-…0122  03/11  SMS    App     n/a    Travel 5  │ │ … all answers, version v1 wording │
│ cursor pagination 25/50/100 · sticky header      │ │ Comment (escaped text)        │
└──────────────────────────────────────────────────┘ │ Contact: +233 •• ••• 4821     │
                                                     │ [Reveal…] (reason, audited)   │
                                                     │ Flags · Case · Corrections    │
                                                     │ [Create case] [Propose corr.] │
                                                     └ 560 px drawer; full screen on phone ┘
```

### S-B3 Flag queue · S-B5 Case detail

```text
S-B3  View: [CSAT ≤ 2 ▾]  Group by rule ▾   ☐ select all  [Dismiss with reason] [Convert]
      ☐ FB-…0123  Low CSAT (2)  Kasoa · Walk-in · Motor   "waited 3 hours…"   2 h ago
S-B5  ┌ CASE-2026-00042  P2 · In progress · SLA 1d 3h left ▓▓▓▓▓░░ ┐
      │ Summary | Linked response | Contact (masked, Reveal)        │ Timeline (append-only)
      │ Assign ▾  Priority ▾  Escalate  Resolve…  Close (CX/Exec)   │ notes with @mention
      └ desktop two-pane; phone: tabs Summary / Timeline / Response ┘
```

### S-A0 Sign-in (E8)

```text
           #F7F7F7 background
      ┌──────── 420 px card ────────┐
      │        [logo 48px]          │
      │  Sign in to Serene CX       │
      │  Email     [             ]  │
      │  Password  [           👁]  │
      │  [        Sign in        ]  │  ← full-width blue pill
      │  Forgot password?           │
      └─────────────────────────────┘
 Errors are enumeration-safe: "That email and password don't match, or the account is
 temporarily locked. Try again in a few minutes or reset your password."
```

### Remaining screens (same shell, patterns above)

| Screen | Layout | Notable states |
|---|---|---|
| S-A2 Branch performance | List/compare toggle; compare ≤ 6; detail page with KPI vs benchmark/target, trend, products, factors, comments (scoped), cases | Subtitle "Based on customers who obtained their policy by walking into a branch."; low-sample excluded from rank |
| S-A3 Channels / S-A4 Products / S-A6 Factors | Ranked table + small multiples | Labels as at survey version (tooltip shows current) |
| S-A5 Trends | Multi-metric series + granularity | Version-change annotations; "Not comparable — survey scale changed on <date>" |
| S-A7 Sources & funnel | Funnel per source/QR point | Info: "Completion rate, not response rate…"; unverified count |
| S-A8 Case performance · S-A9 Completion | KPI row + histogram | R2 / always |
| S-B4 Case list/board · S-B6 My cases | Table with filters; board columns by status | Overdue badge; conflict banner on stale version |
| S-B7/B8 QR points · S-B9 SMS guide | List + detail with poster download (A4/A5/SVG) | Inactive points still listed, with scans |
| S-B9a Flag rules | Rows with two toggles, Flag / Auto-create case | "Nothing, I am satisfied" toggles fixed off |
| S-B10/B11 Exports & schedules | Job list with status, expiry; schedule form | Large export → "We'll notify you when it's ready" |
| S-B12 Targets · S-B13 Alert rules · S-B14 Alerts | Forms + effective dating; alert list with acknowledge | No default targets ("No target") |
| S-B15 Users & grants | Search list; detail with grants editor | Last-System-Admin guard; pending second approval |
| S-B16/17/18 Directory & catalogues | Sortable lists, drag reorder, deactivate with impact summary | "Changes reach the survey when the next version is published" |
| S-B19 Survey versions | Outline + inspector + phone/desktop preview + diff | Four-eyes; scale-signature warning |
| S-B20 Audit log | Filterable table; Verify chain action | Chain OK / broken banner |
| S-B21 Settings & free-tier usage | Settings form; quota bars at 80% | Backup status, last keep-alive |
| S-B22 Notifications · S-B23 Profile | List with deep links; sessions list with sign out others | Security emails can't be disabled |
| S-B24 Access denied / 404 / error | Icon badge, one line, primary action | Request id under "Details" |

## State matrix (required for every screen)

| State | Pattern |
|---|---|
| Loading | Skeletons shaped like the content (KPI, chart, table); no blank spinners |
| Empty | 64 px icon badge, one line, one action |
| No data | "No data for this period", distinct from 0 |
| Low sample | Hatched or 40% marks + "Low sample (n = 12, minimum 30)" |
| Error | Inline alert: what happened + what to do + "Details" (request id) |
| Permission | Item hidden from nav; direct URL → S-B24 + 403 |
| Stale data | "Data updated n min ago"; amber when > 15 min |
| Demo | Diagonal "Demo data" watermark outside production |
