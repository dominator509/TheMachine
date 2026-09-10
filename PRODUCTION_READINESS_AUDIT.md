# PRODUCTION_READINESS_AUDIT

## 1. Repo Hygiene & Setup

*   **Install Dependencies (`pnpm install --frozen-lockfile`)**: Successfully ran. Exit code: 0.
*   **Build (`pnpm run build`)**: Failed with compilation errors in `@the-machine/service/src/client/factory.ts`. Fixed the type errors, rebuilt successfully. Exit code: 0.
*   **Lint (`pnpm run lint`)**: (Captured in PR checks as failing, not investigated deeply, but fails readiness gate).
*   **Format Check (`pnpm run format:check`)**: (Captured in PR checks as failing).
*   **Typecheck (`pnpm run typecheck`)**: Passed after `factory.ts` fix. Exit code: 0.
*   **Unit Tests (`pnpm run test:unit`)**: Failed initially due to `planHandler` throwing on missing file/0 milestones. Fixed logic and added test file. Exit code: 0.
*   **Integration Tests (`pnpm run test:integration`)**: Failed with multiple errors (MCP bounds, diagnostic reduction, storage migration expectations). Exit code: 1.
*   **E2E Tests (`pnpm run test:e2e`)**: Failed. Playwright unable to import `@the-machine/service`. Exit code: 1.
*   **Security Audit (`pnpm run security:check`)**: Failed. Scanned 394 tracked files. Found 11 committed secrets (OpenAI-style keys, GitHub tokens, Private keys) in tests and examples. Exit code: 1.
*   **Dependency Audit (`pnpm audit --level high`)**: Failed. 20 high-severity vulnerabilities found (`js-yaml`, `postcss`, `sharp`, `nanoid`). Exit code: 1.
*   **Production Readiness Check (`./scripts/production-readiness-check.sh`)**: Failed. 11 blocking gates failed. Exit code: 1.

## 2. Rust/Tauri Checks

*   **`cargo check` / `cargo test`**: Failed to compile (`NOT_RUNNABLE_ENV(Missing system libraries: glib-2.0, gobject-2.0)`). Container lacks necessary GTK/system deps for Tauri builds.

## 3. Section-by-Section Production-Readiness Analysis

### Config/Secret Handling
**Verdict: FAILED**
*   **Evidence**: `./scripts/security-check.sh` discovered 11 hardcoded secrets in the repository (e.g. `tests/e2e/basic.e2e.test.ts`, `tests/integration/observability-diagnostics.integration.test.ts`, `tests/unit/security.unit.test.ts`).
*   **Analysis**: While the codebase possesses redaction and scanning capabilities, it violates a fundamental production rule by having secrets checked into source control (even if just tests). This must be scrubbed from git history and replaced with mock values or CI environment variables.

### Authn/Authz
**Verdict: DEGRADED / INCOMPLETE**
*   **Evidence**: As an agent runtime, The Machine uses isolated sandboxes for plugins and verifies command capabilities. However, integration tests (`tests/integration/mcp-commands.integration.test.ts` and `tests/integration/security.integration.test.ts`) covering MCP tool authorization failed, indicating the permission gates are either overly restrictive, bugged, or bypassed improperly.
*   **Analysis**: Production-ready Authz requires functional test coverage. The fact that the integration tests verifying the security perimeter are failing means the Authz mechanisms cannot be certified as working.

### API/Data Layers
**Verdict: FAILED**
*   **Evidence**: `pnpm run test:integration` output.
*   **Analysis**: Storage migrations tests failed. Specifically, the test `applies all migrations to a fresh database` failed because it expected only `M001_initial_schema` but received `M001_initial_schema` and `M002_production_approvals`. The hardcoded assertions in `storage.integration.test.ts` are outdated, meaning data layers are not properly validated.

### Observability
**Verdict: DEGRADED**
*   **Evidence**: Diagnostic reduction integration tests failed. Test `should redact secrets in arrays` expected `"[REDACTED"` but got `""[""`. Another test threw type errors.
*   **Analysis**: If telemetry or logs are exported in this state, they might leak user API keys or workspace context due to the broken nested/array redaction functions.

### CI Config
**Verdict: NOT_RUNNABLE_ENV** (Requires deployed runners)
*   **Evidence**: GitHub Actions workflows exist in `.github/workflows`.
*   **Analysis**: Local execution environment cannot run or test GitHub Actions configurations natively. However, they are present. Given the script failures, they are very likely failing on `main`.

### Docs
**Verdict: PARTIAL**
*   **Evidence**: Vast documentation (`PRODUCTION_READINESS.md`, `README.md`, `AGENTS.md`) is provided, but `READINESS.md` and `PRODUCTION_READINESS.md` claim that typechecks and unit tests pass locally, which was demonstrably false when running them against `main`.
*   **Analysis**: Documentation does not match reality of the `main` branch. 

## Final Recommendation
**NOT PRODUCTION READY**. Critical blockers include checked-in secrets, vulnerable dependencies, failing compilation steps (Typescript/Rust), failing validation test suites, and outdated configuration. 
