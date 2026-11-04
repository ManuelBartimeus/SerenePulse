# 0005 Open link, anonymous sessions, device cooldown

**Status:** Accepted, 2026-11-04 (D-33, A-12, A-123, A-135, A-144)

**Context.** There's one public link (SMS or QR) and no invitations, so the system can't know who was asked or link a response to a customer.

**Decision.**
* Each visit creates or resumes a session: `__Host-svs`, 24 h, stored as an HMAC.
* One response per session, enforced by the database.
* A per-device cooldown (`__Host-svd`, 1 year, HMAC, default 24 h).
* Turnstile on submit. Unverified submissions (Turnstile outage or no-JS) are stored and excluded from KPIs by default.
* The completion rate (submitted ÷ started) replaces any response rate.

**Consequences.**
* A determined person can clear cookies and submit again. This residual risk is accepted, monitored by spam-wave alerts, and disclosed in the metric handbook.
* A shared device in a branch would be blocked after one customer (Q-36; `qr_points.mode` is reserved for that).
