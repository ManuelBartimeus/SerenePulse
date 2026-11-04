# Architecture decision records

One file per decision: `NNNN-title.md` with Status, Context, Decision, Consequences. If an `[A-nn]` assumption changes, it gets an ADR (SPEC §2.6). Superseded ADRs stay, marked "Superseded by NNNN".

| ADR | Title | Status |
|---|---|---|
| [0001](0001-platform.md) | Cloudflare Workers + Supabase platform | Accepted (D-27) |
| [0002](0002-free-tier.md) | Free-tier limits, measured | Pending MS-01 measurements |
| [0003](0003-rls-enforcement.md) | RLS + SQL functions as the enforcement layer | Accepted |
| [0004](0004-analytics-rollups.md) | Additive daily roll-ups | Accepted |
| [0005](0005-open-link-sessions.md) | Open link, anonymous sessions, device cooldown | Accepted (D-33) |
| [0006](0006-resolved-conflicts.md) | Resolved source conflicts | Accepted |
| [0007](0007-backup-key-offline.md) | Backup key offline; local monthly restore drill | Accepted (UG-13) |
