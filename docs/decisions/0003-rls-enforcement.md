# 0003 RLS + SQL functions as the enforcement layer

**Status:** Accepted, 2026-11-04 (REQ §9.3, A-79, A-119, A-133)

**Decision.**
* Reads go through the Data API on tables or `security_invoker` views with RLS.
* Every write or multi-step rule goes through a `SECURITY DEFINER` function with `SET search_path = ''` that starts with `app.require_perm(key)`.
* Claims (`app_roles`, `app_permissions`, `app_branch_ids`, `app_org_scope`) come from the custom access-token hook. Sensitive functions re-read `user_role_grants`, so a revocation takes effect before the 15-minute JWT expires.
* `survey`, `pii`, `audit` and `ops` are not in the exposed schemas.

**Consequences.**
* The browser can't bypass any rule.
* Tests live in pgTAP. A generated role × object × scope matrix test is the gate for every database change.
* Helper calls are wrapped as `(select …)` so Postgres evaluates them once per statement, for performance.
