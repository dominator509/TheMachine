# Suggested Commands

- Run from repo root containing `AGENTS.md`; prefer commands documented in `COMMANDS.md`.
- Windows preflight/smoke/verify/readiness wrappers: `scripts\preflight.cmd`, `scripts\smoke-test.cmd`, `scripts\verify.cmd`, `scripts\production-readiness-check.cmd`.
- Core package scripts: `pnpm run dev`, `pnpm run lint`, `pnpm run typecheck`, `pnpm run test:unit`, `pnpm run test:integration`, `pnpm run test:e2e`, `pnpm run build`.
- Release/local readiness: `pnpm run build:release`, `node tools\smoke\smoke-test.mjs`, `node tools\readiness\production-readiness-check.mjs`.
- DB tools: `pnpm run db:setup`, `pnpm run db:migrate`, `pnpm run db:migration:create -- <name>`, `pnpm run db:migrate:rollback`.
- Security/deps: `pnpm run security:check` scans staged files; `pnpm run audit` enforces high-severity audit gate and may still report low vulnerabilities.
- Git review commands: `git diff --name-only`, `git status --short --untracked-files=all`.
- On this machine, repository guidance may require RTK prefix for external shell commands; use Windows wrappers instead of POSIX scripts when WSL/Git Bash is unavailable.