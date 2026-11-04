# Serene Pulse: Serene Insurance Customer Feedback System

A public, one-minute mobile survey (`feedback.<domain>`) and a staff analytics, case-management and configuration portal (`cx.<domain>`) for Serene Insurance LTD. It runs on Cloudflare (free) and Supabase (free, London).

**Status: MS-01 (platform foundation) in progress.** The Phase 0 plan was approved on 2026-11-04: [docs/00-phase0-blueprint.md](docs/00-phase0-blueprint.md).

## What exists

| Path | Contents |
|---|---|
| `docs/` | Phase 0 blueprint, architecture diagrams, API drafts, threat model, wireframes, traceability, ADRs, external actions |
| `assets/serene-logo.png` | Supplied logo (222 × 108) |
| `assets/serene-logo.svg`, `serene-logo-reversed.svg` | **Interim** traced vectors, pending the official file (X-10); not for print |
| `.env.example` | Every configuration value and secret, with where to get it and where it's deployed |
| `scripts/env-check.mjs` | Reports missing `.env` values per milestone; `--generate` fills app keys |

| `apps/survey-worker` | Hono Worker: `/healthz`, keep-alive cron, security headers (survey pages arrive in MS-06) |
| `apps/portal` | React + Vite SPA skeleton with config validation (sign-in arrives in MS-02) |
| `packages/contracts`, `packages/ui` | Env schemas and error codes; Serene design tokens |
| `supabase/` | Hardened local config, foundation migration, pgTAP tests |
| `.github/workflows/` | ci, deploy (staging automatic, production manual), nightly encrypted backup |
| `scripts/` | env-check, sync-secrets (github, worker, supabase, local), scan-bundles |

## Everyday commands

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test   # all must pass before a PR
pnpm db:start && pnpm db:test               # needs Docker Desktop running
node scripts/sync-secrets.mjs local         # local .dev.vars / .env.local from `supabase status`
pnpm dev:survey                             # http://127.0.0.1:8787
pnpm dev:portal                             # http://127.0.0.1:5173
```

## Environment setup

```sh
node scripts/env-check.mjs --generate   # creates .env if missing, fills generated keys
# fill the remaining values, following docs/external-actions.md
node scripts/env-check.mjs              # repeat until the milestone you need shows ✓
```

`.env` is git-ignored. Never commit it or paste its values anywhere.
