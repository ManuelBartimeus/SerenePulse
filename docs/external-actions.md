# External actions needed from Nii

Nothing on this list has been done or verified by the build. Each item says what it unblocks and which `.env` values it produces. After each one, run `node scripts/env-check.mjs`.

**Never paste secret values into chat.** Put them only in `.env` (git-ignored). Variables marked SECRET in `.env.example` are secrets.

---

## Before MS-01 (platform foundation)

### X-01 GitHub repository

* **Unblocks:** CI, deploys, nightly backups.
* **How:** Create a private repo under a Serene-controlled organisation (e.g. `serene-insurance/serene-pulse`). Settings → Branches → add a protection rule on `main` (require PR + status checks). Settings → Environments → create `staging` and `production`, and add yourself as a required reviewer on `production`. Then, in this folder: `git remote add origin git@github.com:<owner>/<repo>.git`.
* **Produces:** `GITHUB_REPOSITORY`.
* **If not done:** MS-01 is blocked (no CI/CD or backups).

### X-02 Cloudflare account + two Supabase projects

* **Unblocks:** everything that runs in the cloud.
* **Cloudflare:** sign up (free) with a Serene-owned email. Copy the Account ID.
* **Supabase:** sign up with a Serene-owned login and create an organisation "Serene Insurance". Create project `serene-pulse-staging` and project `serene-pulse-production`, **region West EU (London) / eu-west-2**. Generate a strong database password for each and save it in your password manager. For each project:
  * Settings → API Keys → copy the publishable (anon) key and the secret (service_role) key.
  * Connect → **Session pooler** → copy the URI (replace `[YOUR-PASSWORD]`).
  * Account → Access Tokens → create one token named `serene-pulse-ci`.
* **Produces:** `CLOUDFLARE_ACCOUNT_ID`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF_*`, `SUPABASE_ANON_KEY_*`, `SUPABASE_SERVICE_ROLE_KEY_*`, `SUPABASE_DB_PASSWORD_*`, `SUPABASE_DB_URL_*`.
* **If not done:** MS-01 is blocked. Local development can still start (`supabase start` needs only Docker Desktop).

### X-03 Domain in Cloudflare DNS (D-29)

* **Unblocks:** survey and portal hostnames, email domain verification.
* **How:** Cloudflare → Add a site → Serene's domain → Free plan, then change the nameservers at the registrar to the two Cloudflare gives you. If moving the whole domain isn't possible, tell me and we'll plan a delegated subdomain instead. Records for `feedback`, `cx`, `feedback-staging` and `cx-staging` are created by `wrangler deploy` (custom domains), so don't create them by hand. Then My Profile → API Tokens → Create a custom token with the permissions listed in `.env.example` §1.
* **Produces:** `SERENE_ROOT_DOMAIN`, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, `CF_WEB_ANALYTICS_TOKEN` (Web Analytics → Add site).
* **If not done:** staging and production deploys are blocked; local works.

### X-05 R2 bucket + age key pair (backups)

* **How:** Cloudflare → R2 → enable (free, 10 GB) → Create bucket `serene-pulse-backups`. Manage R2 API Tokens → Create token → Object Read & Write → this bucket only. Install `age` (`winget install FiloSottile.age`) and run `age-keygen -o serene-backup.agekey`. Put the `Public key: age1…` line in `.env`. Move `serene-backup.agekey` **out of this folder**, into your password manager plus one offline copy. Without it, backups can't be restored.
* **Produces:** `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `BACKUP_AGE_PUBLIC_KEY`.
* **If not done:** MS-01 can't be completed. SPEC forbids calling backups done until a restore is tested.

### X-07 Sentry + uptime monitor

* **How:** sentry.io (free) → create the organisation and the projects `survey-worker` (platform: Cloudflare Workers), `portal` (React) and `edge-functions` (Deno). Copy the 3 DSNs. Settings → Auth Tokens → org token. For uptime, use Better Stack or UptimeRobot (free): monitors on `https://feedback.<domain>/healthz` and `https://cx.<domain>/` every 5 min, alert to your email. Also create a heartbeat (expected every 24 h, grace 2 h) and copy its URL.
* **Produces:** `SENTRY_*`, `BACKUP_HEARTBEAT_URL`.
* **If not done:** MS-01 can't be completed (observability is part of it). It does not block coding.

### Local tooling (your machine)

* Install **pnpm**: `npm install -g pnpm@9` (not currently installed).
* Install **Docker Desktop** (needed by `supabase start`).
* Already present: Node 22.19, git 2.50, Supabase CLI 2.113 (via npx), Wrangler 4.157 (via npx).

## Before MS-02 (identity)

### X-06 Resend email

* **How:** resend.com → Add domain (Serene's domain) → add the shown SPF/DKIM records in Cloudflare DNS → add DMARC `_dmarc TXT "v=DMARC1; p=quarantine; rua=mailto:<you>"` → Verify. API Keys → Create (sending access, this domain). In **both** Supabase projects, go to Authentication → Emails → SMTP Settings → enable custom SMTP: host `smtp.resend.com`, port 465, user `resend`, password = the API key, sender = `EMAIL_FROM`.
* **Produces:** `RESEND_API_KEY`, `EMAIL_REPLY_TO`.
* **If not done:** invites and password resets can't be sent; MS-02 is blocked.

### X-08 Seed administrator password

* **How:** choose a **new** 12+ character password (not the one shared in chat on 2026-11-04) and put it in `SEED_ADMIN_PASSWORD`. Remove it from `.env` after the seed has run; you'll be forced to change it at first sign-in.

## Before MS-05 (survey access)

### X-04 Turnstile

* **How:** Cloudflare → Turnstile → Add widget twice: (1) hostname `feedback-staging.<domain>` plus `localhost`; (2) `feedback.<domain>`. Mode: **Managed**.
* **Produces:** `TURNSTILE_SITE_KEY_*`, `TURNSTILE_SECRET_KEY_*`.

### X-10 Official vector logo

The PNG is 222 × 108 px. `assets/serene-logo.svg` is an interim trace. Print posters need the official SVG/AI/EPS from Serene's designer.

## Before MS-09 (go-live)

| # | Action |
|---|---|
| X-09 | Serene approves the privacy notice and consent wording (draft produced in MS-06); provide `DATA_PROTECTION_CONTACT_EMAIL`, `DPC_REGISTRATION_NUMBER`, `SUPPORT_PHONE`, `SUPPORT_EMAIL` |
| X-11 | Recruit ≥ 20 representative customers for the usability test |
| X-12 | Print and place QR posters; brief the SMS team on the link and wording |

## Open questions (see the blueprint)

Q-35 source documents into `docs/source/` · Q-36 shared branch tablets? · Q-38 second approver.
