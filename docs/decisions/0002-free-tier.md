# 0002 Free-tier limits, measured

**Status:** Pending. To be completed in MS-01 from the providers' current pricing pages and spikes S-01…S-07.

| Limit | As last known (SPEC) | Measured / confirmed on | Source URL |
|---|---|---|---|
| Supabase inactivity pause | ~7 days | | |
| Supabase DB / storage / egress | 500 MB / 1 GB / 5 GB | | |
| Supabase auth hooks on free | access-token: yes; password-verification: paid (UG-01) | | |
| Supabase session time-box / inactivity timeout | paid (UG-02) | | |
| Edge Function CPU / wall-clock | ~2 s CPU / 150 s | | |
| Workers requests / CPU | 100k/day / 10 ms | | |
| Cloudflare rate-limiting rules | 1 rule, 10 s period, IP only | | |
| Resend | 100/day, 3,000/month | | |
| R2 | 10 GB, 1M class A ops | | |

Upgrade triggers: SPEC "FREE-TIER CONSTRAINTS".
