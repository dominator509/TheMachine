# Rollback Runbook

Rollback is an operator-controlled recovery operation. Agents may prepare commands and evidence, but they must not execute a destructive restore or production deployment without explicit authorization.

## Preconditions

A rollback may proceed only when all of the following are true:

1. The application is stopped and no process holds the SQLite database open.
2. The exact previous application artifact and its checksum are available.
3. A pre-upgrade SQLite backup exists and its SHA-256 digest is known.
4. The database has no `-wal` or `-shm` sidecar. Their presence causes the restore tool to fail closed.
5. The operator has recorded the current version, target version, backup timestamp, expected data-loss window, and approval.

The project has no reversible down migrations. Database rollback means restoring an exact verified backup.

## Create a Pre-Upgrade Backup

Build the storage package, then create and record a verified backup:

```sh
pnpm build
pnpm db:backup .machine/backups/pre-upgrade.sqlite
```

The command prints the source path, backup path, byte size, schema counts, timestamp, and SHA-256 digest. Preserve that output with the release evidence.

## Database Rollback

1. Stop The Machine and all processes that can access its database.
2. Preserve redacted diagnostics and a copy of the failed database for incident analysis.
3. Set the target database explicitly when it is not the default:

   ```sh
   export MACHINE_DB_PATH=/absolute/path/to/the-machine.db
   ```

4. Authorize and execute the exact backup restore:

   ```sh
   export MACHINE_ALLOW_DB_ROLLBACK=1
   pnpm db:migrate:rollback \
     .machine/backups/pre-upgrade.sqlite \
     --yes \
     --sha256=<RECORDED_BACKUP_SHA256>
   ```

5. The restore command performs these checks and actions:
   - rejects missing, corrupt, or checksum-mismatched backups;
   - rejects active/incompletely checkpointed SQLite sidecars;
   - copies the backup to a staging file;
   - independently runs SQLite `quick_check` on the source and staging copy;
   - atomically moves the current database aside;
   - installs and re-verifies the restored database;
   - restores the original database automatically if final verification fails;
   - retains the pre-restore database for postmortem analysis.

6. Restart only after the exact rolled-back application artifact is installed.
7. Run clean-start smoke, readiness, repository discovery, and data-integrity checks.
8. Record RTO, actual data-loss interval, restored SHA-256, and the retained pre-restore path.

For a non-rollback restore operation, use the equivalent guarded command:

```sh
export MACHINE_ALLOW_DESTRUCTIVE_RESTORE=1
pnpm db:restore <backup.sqlite> --yes --sha256=<EXPECTED_SHA256>
```

## Application Rollback

Application rollback requires a previously retained release artifact, not a rebuild of the same source tag.

1. Verify the previous artifact checksum and provenance.
2. Stop the current application.
3. Install the retained previous artifact according to its platform-specific manifest.
4. Restore a compatible database backup when the prior version cannot read the current schema.
5. Run the exact-artifact clean-room smoke and readiness gates.
6. Record versions, artifact digests, installer result, rollback duration, and any lost writes.

Until signed native installers and an exact-artifact installation campaign exist, application rollback remains an external release gate rather than a completed capability.

## Verification Checklist

- [ ] Exact previous artifact digest verified.
- [ ] Backup digest verified.
- [ ] SQLite `quick_check` passed before and after restore.
- [ ] No unexpected WAL/SHM sidecar remained.
- [ ] Application started from the retained artifact.
- [ ] CLI and native desktop smoke tests passed.
- [ ] Candidate-bound readiness evidence was regenerated for the rolled-back artifact.
- [ ] Repository discovery and representative data reads passed.
- [ ] Original incident is no longer reproducible.
- [ ] No secrets appeared in diagnostics or rollback logs.
- [ ] RTO and data-loss interval were recorded.

## STOP Conditions

Stop immediately when:

- the previous artifact or database backup is missing;
- any checksum or SQLite integrity check fails;
- the database is still open or sidecars remain;
- the backup is incompatible with the target application;
- the expected data-loss interval is unacceptable;
- the operator has not explicitly approved the destructive operation;
- the restore would overwrite the only surviving copy of current state;
- a production or third-party system lies outside the authorized scope.
