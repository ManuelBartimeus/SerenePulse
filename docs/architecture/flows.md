# Core flows and state machines

## 1. Staff authentication (F16)

```mermaid
sequenceDiagram
  autonumber
  actor A as System Admin
  actor U as New staff user
  participant P as Portal SPA
  participant IF as Edge fn invite-user
  participant SI as Edge fn auth-sign-in
  participant AU as Supabase Auth
  participant DB as Postgres
  A->>P: Invite (email, role, branch scope)
  P->>IF: POST (admin JWT)
  IF->>DB: check users.manage, create profile (invited, must_change_password)
  IF->>AU: admin.inviteUserByEmail (24 h, single use)
  AU-->>U: Invite email (Resend SMTP)
  U->>P: Open link → "Set a new password"
  P->>AU: updateUser(password ≥ 12, not common)
  U->>P: Sign in (email, password)
  P->>SI: POST credentials (+ Turnstile token)
  SI->>DB: locked_until in future? → generic "can't sign in" + retry-after
  SI->>AU: signInWithPassword (server-side)
  alt wrong password
    SI->>DB: failed_login_count++ (5 → lock 15 min, email notice)
    SI-->>P: enumeration-safe error
  else success
    AU->>DB: access-token hook: claims; refuse if session older than 12 h
    SI->>DB: reset counter; new device? → security email
    SI-->>P: session → supabase.auth.setSession()
    P->>P: must_change_password → forced "Set a new password" screen
  end
```

## 2. Authorisation (every portal request)

```mermaid
flowchart LR
  req[Portal request with JWT] --> kind{Read or write?}
  kind -- read --> rls[RLS policy on table/view<br/>perm ∧ branch scope]
  kind -- write/rule --> rpc[RPC]
  rpc --> p1{auth_has_perm?}
  p1 -- no --> e403[42501 → 403 'You don't have access']
  p1 -- yes --> p2{sensitive?}
  p2 -- yes --> regrant[re-read user_role_grants]
  regrant -- revoked --> e403
  regrant -- ok --> tx
  p2 -- no --> tx[transaction: validate → write → audit.append → outbox]
  rls --> rows[rows in scope only]
```

## 3. Survey session (F1, F2, F5–F7)

```mermaid
sequenceDiagram
  autonumber
  actor C as Customer
  participant W as survey Worker
  participant DB as Postgres (survey.*)
  participant T as Turnstile
  C->>W: GET /?src=sms  or  /q/K7P2
  W->>DB: start_session(src, qr, device_hmac, session_hmac?)
  alt device inside cooldown
    DB-->>W: cooldown(reference?)
    W-->>C: S-C7 "You've already shared your feedback"
  else DB unreachable
    W-->>C: S-C8 "We can't take feedback right now" (no form)
  else ok
    DB-->>W: session (new or resumed), bound version, draft
    W-->>C: Page 1 HTML + inlined definition + catalogue (edge-cached by checksum)<br/>Set-Cookie __Host-svs (24 h), __Host-svd (1 y)
  end
  C->>C: pages 1–5 run client-side, no network on page change
  C-)W: PATCH /answers {seq, answers} (debounced 300 ms, ≤ 1 in flight)
  W->>DB: save_draft (ignore stale seq; ≤ 60 writes)
  C->>T: Turnstile (on page 5 only)
  C->>W: POST /submit {answers, token} + Idempotency-Key
  W->>T: siteverify (retry once; outage → unverified)
  W->>DB: submit(): lock session, re-validate, cooldown, insert response (+pii), outbox
  DB-->>W: {reference}
  W-->>C: S-C6 confirmation (history replaced, Back can't return to the form)
  C-)W: sendBeacon /events (batched telemetry)
```

## 4. Survey page state machine (Page 1 rule, F3/F4)

```mermaid
stateDiagram-v2
  [*] --> P1
  state P1 {
    [*] --> ChooseChannel
    ChooseChannel --> BranchRequired: WALK_IN
    ChooseChannel --> BranchOptional: OTHER
    ChooseChannel --> BranchHidden: any other channel\n(clear branch → not_applicable)
    BranchRequired --> ChooseChannel: change channel
    BranchOptional --> ChooseChannel: change channel
    BranchHidden --> ChooseChannel: change channel\n(old branch NOT restored)
  }
  P1 --> P2: Continue (all applicable required fields valid)
  P2 --> P3: tap rating (250 ms hold)
  P3 --> P4: tap rating
  P4 --> P5: tap rating
  P2 --> P1: Back
  P3 --> P2: Back
  P4 --> P3: Back
  P5 --> P4: Back
  P5 --> Submitting: Submit
  Submitting --> Confirmed: 200 / replayed reference
  Submitting --> P5: offline / 5xx (answers kept, same Idempotency-Key)
  Submitting --> AlreadyShared: 409 already_shared
  Confirmed --> [*]
```

## 5. Case lifecycle (F9, F10; R2)

```mermaid
stateDiagram-v2
  [*] --> new: flag converted / auto-case / manual
  new --> assigned: case_assign (CX central queue, D-17)
  assigned --> in_progress: case_start
  in_progress --> resolved: case_resolve (officer, BM own branch, CX, Exec)
  resolved --> in_progress: case_reopen ≤ 30 days (CX/Exec)
  resolved --> closed: case_close (CX/Exec only, D-21)
  closed --> in_progress: Executive reopen with reason
  closed --> [*]
  note right of in_progress
    Escalation is orthogonal: is_escalated + level
    officer → dept head → CX Admin → Executive (D-20)
    SLA: P1 1 / P2 3 / P3 5 / P4 10 working days,
    Mon–Fri 08:00–17:00 Africa/Accra, minus holidays.
    75% → warning; 100% → breach + auto-escalate one level
  end note
```

## 6. Analytics pipeline

```mermaid
flowchart LR
  sub[survey.submit] -- same tx --> ob[(pgmq outbox 'events')]
  ob -- pg_cron every minute --> c1[consumer: flag rules<br/>D-19 toggles]
  ob --> c2[consumer: roll-up upsert<br/>responses_daily / sessions_daily]
  ob --> c3[consumer: notifications]
  c3 -- email jobs --> pn[pg_net → send-email<br/>daily budget guard]
  c2 --> rpc[analytics_* RPCs<br/>value · n · low_sample · benchmark · target]
  rpc --> dash[Portal dashboards]
  nightly[nightly rebuild trailing 35 days<br/>+ reconciliation vs raw] --> c2
  nightly -- mismatch --> alert[ops alert]
```

Roll-ups are additive histograms (csat_hist[5], ces_hist[5], nps_hist[11]), so every metric for any filter combination is an exact sum over the grain. There are no averages of averages.
