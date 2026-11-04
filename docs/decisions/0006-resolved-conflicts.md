# 0006 Resolved source conflicts

**Status:** Accepted, 2026-11-04

| # | Conflict | Resolution | Authority |
|---|---|---|---|
| 1 | DS voice "lightly playful", emoji | Warm, plain, no jokes or emoji | A-28 |
| 2 | DS parallax, staggers, loops vs REQ §2.9 | Keep 120–240 ms feedback motion only; reduced-motion honoured | A-29 |
| 3 | DS a11y defects (no focus ring, `#7D7D7D`, div hamburger) | Not copied; WCAG 2.2 AA wins | A-30 |
| 4 | DS 18 px desktop body | Apps use 16 px body / 14 px tables | A-41 |
| 5 | SPEC "Turnstile non-interactive" for the no-JS form | Impossible without JS: no-JS submits are stored `unverified_no_js` | A-144 |
| 6 | A-33 availability 99.9% vs NFR 99.5% best effort | NFR row (99.5%, monitored) | D-27 |
| 7 | A-37 RPO 15 min / RTO 4 h vs NFR RPO 24 h / RTO 8 h | NFR row (no PITR on free) | D-27 |
| 8 | A-17 OTel/Grafana vs A-122 free stack | A-122 | D-27 |
| 9 | Lockout and session limits assume paid Supabase features | Sign-in Edge Function + access-token hook | A-139, A-149 |
