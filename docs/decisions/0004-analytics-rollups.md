# 0004 Additive daily roll-ups

**Status:** Accepted, 2026-11-04 (A-32)

**Decision.**
* `analytics.responses_daily` and `analytics.sessions_daily` store histograms and counts at the SPEC grain, keyed by the Africa/Accra local date.
* They're updated from the outbox within about 60 s, and rebuilt nightly for the trailing 35 days with a reconciliation check against raw rows.
* Every metric (CSAT %, averages, NPS, median completion time from fixed buckets) is computed from sums, so it's exact for any filter combination.

**Consequences.**
* Dashboard cost doesn't depend on raw volume, and no cache tier is needed.
* Medians from buckets are approximate within the bucket width (1 s up to 120 s). The completion-time report states this.
* Golden-dataset tests compare roll-ups with brute-force SQL.
