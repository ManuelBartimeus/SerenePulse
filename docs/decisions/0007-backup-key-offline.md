# 0007 Backup decryption key stays offline; restore drill runs locally

**Status:** Accepted, 2026-11-04 (UG-13; resolves a conflict inside SPEC DISASTER RECOVERY)

**Context.** SPEC requires nightly `age`-encrypted backups whose private key is "held offline by Nii". It also requires a "monthly automated restore into a local Supabase in CI". CI can't decrypt a backup unless the private key is stored in GitHub, which would defeat the purpose of holding it offline.

**Decision.**
* Backups are encrypted to Nii's public key only, and the private key never enters CI.
* CI checks every night that the backup exists, is at least 10 KB, and was stored; a failed run emails the repository owner (D-41, D-42).
* Once a month Nii runs the restore drill locally (`docs/runbooks/restore-backup.md`): download → decrypt → `pg_restore` into the local Docker Supabase → row-count and `audit.verify_chain()` checks. The output is pasted into the next checkpoint.

**Alternative rejected.** A second "restore-test" recipient key stored as a GitHub secret. It would allow a fully automatic drill, but anyone with Actions access could then decrypt production data, including encrypted contact details' ciphertext and all comments.

**Consequences.** One manual monthly task (~10 minutes). The checkpoint template lists the last drill date, so a skipped month is visible.
