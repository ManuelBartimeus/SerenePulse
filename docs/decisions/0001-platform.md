# 0001 Cloudflare Workers + Supabase platform

**Status:** Accepted, 2026-11-04 (D-27, D-28, A-115)

**Context.** The system needs free hosting, one maintainer with intermediate experience, database-level authorisation (REQ §9.3), and a survey that's fast on 3G in Ghana.

**Decision.**
* Survey: a Hono Worker rendering HTML at the edge; the only holder of the service-role key; calls 5 named SQL functions.
* Portal: a Vite + React SPA served as Worker static assets (A-146); it talks to Supabase directly under the user's JWT.
* Backend: Supabase Postgres (eu-west-2) with RLS and SQL functions for every rule, Edge Functions for CPU-heavy or secret-holding work, pg_cron + pgmq for background jobs.

**Alternatives rejected.**
* Next.js on Workers: hits free-plan size and CPU limits.
* A Node API server on a VPS: one more tier to patch and run for one maintainer.
* Firebase: no relational constraints and no SQL analytics.

**Consequences.** No application server. Business rules are tested with pgTAP. Moving to paid tiers needs no code change. Free-tier limits become explicit risks (ADR-0002).
