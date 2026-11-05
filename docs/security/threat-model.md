# Threat model (STRIDE)

Scope: the open survey, the staff portal, and the handling of keys and secrets. Baseline is OWASP ASVS 4.0.3 L2, with MFA off by decision [D-23]. Each threat has a planned control, a test, and the milestone that delivers it.

## Assets

| Asset | Why it matters |
|---|---|
| Integrity of feedback (scores, attribution) | Management decisions and branch reputations depend on it |
| Consented phone numbers and names (`pii`) | Personal data under Act 843 |
| Free-text comments | May contain personal data or complaints |
| Service-role key | Bypasses RLS entirely |
| Staff accounts (Executive, System Admin) | Full data access, configuration |
| Audit log | Evidence; must be tamper-evident |
| Backups (R2) | Contain everything above |

## A. Open survey

| STRIDE | Threat | Control | Test | MS |
|---|---|---|---|---|
| Spoofing | Bot submits fake responses (ballot-stuffing) | Turnstile on submit; unverified excluded from KPIs; one response per session; 24 h device cooldown | T-M05-abuse-*: scripted submits without a token are stored as unverified | 05 |
| Spoofing | Attacker clears cookies to repeat-submit by hand | Accepted residual risk (D-33). Detected by the spam-wave alert (> 5× hourly average per source/QR point); unverified filter; volume is visible per QR point | Alert fires on a synthetic burst | 05, 11 |
| Tampering | Crafted answer values (out-of-range codes, hidden-branch injection) | `survey.submit` re-validates against the bound version; DB CHECKs | Property test: 10k random answer sets, JS and SQL agree | 04, 06 |
| Tampering | Modify an existing response | No endpoint; trigger + REVOKE; immutability pgTAP | T-M07-immutable | 06 |
| Tampering | Inject a branch via a QR poster's location | QR points have no branch FK (Rule 2) | Schema test | 05 |
| Repudiation | "I never submitted that" | Not applicable to anonymous feedback; the server timestamps are authoritative | n/a | n/a |
| Info disclosure | Session cookie theft over the network | `__Host-`, Secure, HttpOnly, SameSite=Lax, HSTS preload | Header test | 06 |
| Info disclosure | Enumerating references `FB-YYYY-NNNNNN` | No lookup endpoint exists (A-142) | Route inventory test | 06 |
| Info disclosure | XSS through comments into the portal | Stored raw, rendered as text only; strict CSP with nonces; no `dangerouslySetInnerHTML` (ESLint rule) | XSS payload e2e in record drawer | 06, 08 |
| DoS | SMS-blast burst / flood | Edge-cached definition; 1 DB call per load; rate rule (A-143); 8 KB body cap; k6 20 submits/s | k6 run | 05, 09 |
| DoS | Exhaust free-tier Worker requests | Quota snapshot + 80% alert; ≤ 4 requests per survey | Quota alert test | 01, 11 |
| Elevation | Survey Worker used to reach arbitrary tables | Worker calls only 5 named functions; the service role is used through them only, enforced by code review + a test that greps the Worker for `.from(` | Static check | 06 |

## B. Staff portal

| STRIDE | Threat | Control | Test | MS |
|---|---|---|---|---|
| Spoofing | Password guessing / credential stuffing | 8+ chars (D-43), common-password list, lockout 5 → 15 min (A-139) also enforced by the token hook (A-152), IP rate limit 20/5 min (no CAPTCHA, D-44), new-device emails, sign-in spike alert | T-M01-lockout | 02 |
| Spoofing | No MFA | Accepted by decision; compensating controls above; TOTP recommendation raised at MS-09 | n/a | 09 |
| Tampering | JWT claim tampering | Signature verified by PostgREST; sensitive RPCs re-read grants | Forged-claim test | 02 |
| Tampering | Silent attribution change | Only via `attribution_corrections`, proposer ≠ approver, original kept visible | T-M10-correction | 13 |
| Repudiation | Staff denies a contact reveal or export | Hash-chained audit with reason; nightly copy to R2 | `audit_verify_chain` test; chain-break alert | 02 |
| Info disclosure | IDOR across branches (Branch Manager) | RLS by `auth_branch_ids()`; aggregate-only ranking view | Generated permission matrix: every role × view/RPC × scope | 02, 07 |
| Info disclosure | Contact details leaked via export or email | Excluded from exports by default; `pii.export` + reason; report emails carry links, not attachments; signed URLs 15 min | Export permission tests | 09 |
| Info disclosure | Formula injection in CSV/XLSX | Prefix `'` to cells starting with `= + - @` (and tab/CR) | Unit test | 09 |
| DoS | Expensive analytics queries | Roll-ups; RPC statement timeout 5 s; page caps | EXPLAIN baselines in `/docs/performance` | 07 |
| Elevation | Revoked user keeps access until JWT expiry | 15 min JWT; sensitive RPCs re-check grants; suspension revokes refresh tokens | Revocation test | 02 |
| Elevation | Self-granting `pii.view` | Separation of duties: second approver (A-68, Q-38) | Grant-approval test | 02 |

## C. Keys, secrets, supply chain

| Threat | Control |
|---|---|
| Service-role key in a browser bundle | Portal ships the anon key only; CI scans `dist/` of both apps for `sb_secret_` and the service-role JWT pattern; `env-check` rejects a secret-looking value in an anon slot |
| Secrets in the repo | `.gitignore` covers `.env*` except `.env.example`; gitleaks in CI and as a pre-commit hook |
| Seed password exposure | Read only from the environment; the seed refuses if the user exists; forced change at first sign-in; never logged (log redaction test) |
| Compromised dependency | Lockfile, Renovate, `pnpm audit` / OSV in CI, Actions pinned by SHA |
| Backup theft from R2 | `age` encryption; private key offline; separate R2 credentials scoped to one bucket |
| Lost PII key-encryption key | KEK kept in Vault **and** in Nii's offline password manager; restore runbook tests decryption |
