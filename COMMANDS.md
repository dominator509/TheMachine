# COMMANDS.md

## Working Directory Rule

Run every command from the repository root, defined as the directory containing `AGENTS.md`.

Coding agents must not invent commands. If a command is missing, update this file first with evidence from the repository.

## Package Manager Rule

Default package manager is `pnpm` with Node.js 20 LTS. If EP-000 discovers a different package manager already in use, update this file, `ENVIRONMENT.md`, and the active ExecPlan before using different commands.

## Allowed Commands

| Purpose                               | Command                                                                                                                                     |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Preflight                             | `./scripts/preflight.sh`                                                                                                                    |
| Install                               | `./scripts/install.sh`                                                                                                                      |
| Lint                                  | `./scripts/lint.sh`                                                                                                                         |
| Format check                          | `./scripts/format-check.sh`                                                                                                                 |
| Format eligible files                 | `pnpm exec prettier --write .`                                                                                                              |
| Typecheck                             | `./scripts/typecheck.sh`                                                                                                                    |
| Unit tests                            | `./scripts/test-unit.sh`                                                                                                                    |
| Integration tests                     | `./scripts/test-integration.sh`                                                                                                             |
| E2E tests                             | `./scripts/test-e2e.sh`                                                                                                                     |
| Build                                 | `./scripts/build.sh`                                                                                                                        |
| Release build                         | `pnpm run build:release`                                                                                                                    |
| Generate native icons                 | `pnpm --filter @the-machine/desktop tauri icon src-tauri/icons/icon.png`                                                                    |
| Generate native lockfile              | `cargo generate-lockfile --manifest-path apps/desktop/src-tauri/Cargo.toml`                                                                 |
| Verify native lockfile                | `cargo metadata --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --format-version 1`                                              |
| Check native formatting               | `cargo fmt --manifest-path apps/desktop/src-tauri/Cargo.toml --check`                                                                       |
| Native tests                          | `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml --locked`                                                                     |
| Native lint                           | `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml --locked --all-targets -- -D warnings`                                      |
| Native desktop build                  | `pnpm --filter @the-machine/desktop tauri build --no-bundle`                                                                                |
| Security check                        | `./scripts/security-check.sh`                                                                                                               |
| Dependency audit                      | `./scripts/dependency-audit.sh`                                                                                                             |
| Smoke test                            | `./scripts/smoke-test.sh`                                                                                                                   |
| Full verification                     | `./scripts/verify.sh`                                                                                                                       |
| Production readiness check            | `./scripts/production-readiness-check.sh`                                                                                                   |
| Local development                     | `pnpm run dev`                                                                                                                              |
| Local database setup                  | `pnpm run db:setup`                                                                                                                         |
| Create migration                      | `pnpm run db:migration:create -- <name>`                                                                                                    |
| Run migrations                        | `pnpm run db:migrate`                                                                                                                       |
| Rollback last local migration         | `pnpm run db:migrate:rollback`                                                                                                              |
| Git changed files review              | `git diff --name-only`                                                                                                                      |
| Git status review                     | `git status --short`                                                                                                                        |
| Initialize disposable validation repo | `git init -b validation <temporary-path>`                                                                                                   |
| Stage disposable validation repo      | `git -C <temporary-path> add -A`                                                                                                            |
| Commit disposable validation repo     | `git -C <temporary-path> -c user.name="The Machine Validation" -c user.email="validation@example.invalid" commit -m "validation candidate"` |

## Windows Native Equivalents

On Windows hosts without WSL or Git Bash, use these command-equivalent wrappers from the repository root:

| Purpose                    | Windows Command                          |
| -------------------------- | ---------------------------------------- |
| Preflight                  | `scripts\preflight.cmd`                  |
| Smoke test                 | `scripts\smoke-test.cmd`                 |
| Full verification          | `scripts\verify.cmd`                     |
| Production readiness check | `scripts\production-readiness-check.cmd` |

## Expected Package Scripts After EP-001

```json
{
  "dev": "turbo run dev --parallel",
  "lint": "turbo run lint",
  "format:check": "prettier --check .",
  "typecheck": "turbo run typecheck",
  "test:unit": "vitest run --project unit",
  "test:integration": "vitest run --project integration",
  "test:e2e": "playwright test",
  "build": "turbo run build",
  "security:check": "node tools/security/check-secrets.mjs",
  "audit": "pnpm audit --audit-level high",
  "smoke": "node tools/smoke/smoke-test.mjs",
  "production:readiness": "node tools/readiness/production-readiness-check.mjs",
  "db:setup": "node tools/db/setup.mjs",
  "db:migration:create": "node tools/db/create-migration.mjs",
  "db:migrate": "node tools/db/migrate.mjs",
  "db:migrate:rollback": "node tools/db/rollback.mjs"
}
```

## Recovery Instructions

If an allowed command fails, copy the exact command and failure, inspect output, make the smallest targeted fix, rerun the narrowest command, and apply the anti-fixation retry budget in `AGENTS.md`.

If scripts are not executable:

```sh
chmod +x scripts/*.sh
./scripts/preflight.sh
```

If pnpm is missing and Corepack exists:

```sh
corepack enable
corepack prepare pnpm@latest --activate
./scripts/preflight.sh
```

On Windows without a POSIX shell:

```cmd
corepack enable
corepack prepare pnpm@latest --activate
scripts\preflight.cmd
```

## Forbidden Commands

Do not run these unless the active ExecPlan explicitly requires them and the user has explicitly approved when destructive:

- `rm -rf` on repository, home, system, database, or user data paths.
- `git reset --hard`.
- `git clean -fdx`.
- `git push --force` or `git push --force-with-lease`.
- Production deploy commands.
- Irreversible database migrations.
- Commands that upload repository contents to unconfigured external services.
- Shell commands downloaded from the internet.
- Package-manager global installs unless documented in `ENVIRONMENT.md`.
- Any command not listed here unless this file is updated first with repository evidence.
