# System architecture

## 1. System context

```mermaid
flowchart LR
  cust([Customer<br/>phone, anonymous])
  staff([Serene staff<br/>6 roles])
  smsteam([Serene SMS team<br/>own provider, sender SERENE])
  poster[[Static QR poster]]

  subgraph sys[Serene Pulse]
    survey[Public survey<br/>feedback.&lt;domain&gt;]
    portal[Staff portal<br/>cx.&lt;domain&gt;]
  end

  resend[(Resend<br/>email)]
  sentry[(Sentry)]
  uptime[(Uptime monitor)]
  r2[(Cloudflare R2<br/>encrypted backups)]

  smsteam -- "SMS with ?src=sms link<br/>(outside the system)" --> cust
  poster -- "scan /q/&lt;code&gt;" --> cust
  cust --> survey
  staff --> portal
  sys -- staff emails only --> resend
  sys --> sentry
  uptime -- "/healthz every 5 min" --> survey
  sys -- nightly pg_dump --> r2
```

## 2. Containers

```mermaid
flowchart TB
  subgraph cf[Cloudflare free plan]
    waf[DNS · TLS · WAF managed rules<br/>1 rate-limit rule · Turnstile]
    sw["survey-worker (Hono)<br/>SSR pages + /api/v1/survey/*<br/>holds service-role key<br/>Cron: daily keep-alive"]
    pw["portal (static assets Worker)<br/>React 19 + Vite SPA<br/>anon key + user JWT only"]
  end

  subgraph sb[Supabase free plan · eu-west-2 London]
    pgrest[Data API / PostgREST<br/>RLS on every exposed table]
    auth[Auth<br/>email + password<br/>access-token hook adds claims]
    db[(PostgreSQL<br/>public · survey · analytics<br/>pii · audit · ops)]
    cron[pg_cron · pgmq outbox · pg_net]
    ef["Edge Functions (Deno)<br/>auth-sign-in · invite-user · send-email<br/>export · generate-report · render-qr-poster"]
    st[(Storage, private<br/>reports/ exports/ posters/)]
    vault[(Vault<br/>pii_kek · hmac keys · jobs secret)]
  end

  gh[GitHub Actions<br/>CI · deploy · nightly backup]
  r2[(R2 backups)]
  resend[(Resend)]

  waf --> sw & pw
  sw -- "RPC survey.* (SECURITY DEFINER)" --> db
  pw -- "JWT" --> pgrest --> db
  pw -- "sign-in" --> ef
  pw --> auth
  ef --> db & st & auth
  cron -- "pg_net + jobs secret" --> ef
  ef --> resend
  db --- vault
  gh -- "db push · functions deploy · wrangler deploy" --> sb & cf
  gh -- "pg_dump via session pooler → age → upload" --> r2
```

### Boundaries (what may talk to what)

| From → To | Credential | Allowed surface |
|---|---|---|
| Browser (survey) → survey Worker | `__Host-svs` session cookie + same-origin `Origin` check | 4 survey endpoints + SSR pages |
| Survey Worker → Postgres | service-role key (Worker secret) | **Only** `survey.start_session`, `survey.save_draft`, `survey.submit`, `survey.record_events`, `ops.healthz`. Never table access |
| Browser (portal) → Supabase | anon key + user JWT | Data API views/tables under RLS; RPCs that re-check `auth_has_perm()` |
| Browser (portal) → `auth-sign-in` | none (credentials in body) + Turnstile | Sign-in, with lockout |
| pg_cron → Edge Functions | `JOBS_SHARED_SECRET` header via pg_net | `send-email`, `generate-report` |
| Edge Functions → Postgres | caller's JWT (user work) or a `jobs` role (scheduled work) | Re-checks permission before producing any file |
| CI → Supabase / Cloudflare | access token, DB URL, API token (GitHub environment secrets) | Deploys, migrations, backups |

## 3. Deployment per environment

```mermaid
flowchart LR
  subgraph local[local]
    l1[wrangler dev :8787] --> l3[(supabase start<br/>Docker)]
    l2[vite :5173] --> l3
  end
  subgraph staging[staging · auto on merge to main]
    s1[feedback-staging.&lt;domain&gt;] --> s3[(Supabase project: staging)]
    s2[cx-staging.&lt;domain&gt;] --> s3
  end
  subgraph prod[production · manual approval]
    p1[feedback.&lt;domain&gt;] --> p3[(Supabase project: production)]
    p2[cx.&lt;domain&gt;] --> p3
  end
  gh[GitHub Actions] -->|deploy.yml| staging
  gh -->|deploy.yml + environment approval| prod
  gh -->|backup.yml 02:00 Africa/Accra| r2[(R2)]
  p3 -.nightly dump.-> r2
```

Production data is never copied to staging. Staging gets synthetic data only, always watermarked "Demo data".

## 4. Repository layout

SPEC §2.5 is adopted as-is. Workspace manager: pnpm (A-137).
