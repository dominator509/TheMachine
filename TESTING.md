# TESTING.md

## Test Pyramid

1. Unit tests: core domain, validators, state machines, redaction, permissions.
2. Integration tests: SQLite, migrations, repositories, provider adapters, MCP mock server, plugin permissions, service contracts, CLI commands.
3. E2E/acceptance tests: GUI and CLI flows for workspace setup, provider setup, ExecPlan execution, validation, readiness report.
4. Smoke tests: packaged app/CLI startup, health check, read-only repository scan.

## Unit Test Rules

Unit tests must not require network, real credentials, persistent local services, or filesystem mutation outside temp directories. Every new domain rule needs positive and negative tests.

## Integration Test Rules

Cover migrations, repositories, command persistence, provider fake transports, MCP mock tool invocation, plugin permission denial, CLI-to-service boundary, service validation and error codes.

## E2E Test Rules

Cover first-run workspace creation, repository discovery, selecting/running/resuming an ExecPlan, validation failure display, provider/MCP settings validation, production readiness report, and keyboard navigation for critical GUI flows.

## Contract Test Rules

Required for provider adapters, MCP tool invocation, plugin manifests, CLI JSON output, and local service/IPC contracts.

## Smoke Test Rules

Verify CLI starts, local service health passes, desktop starts in test mode where available, repository discovery read-only works, and no secret is required for read-only smoke.

## Regression Test Rules

Every bug fix must add a regression test that fails before the fix where practical.

## Performance Test Rules

Initial gates: small repository discovery under 5 seconds, unit tests under 30 seconds on typical developer machine, health check under 500 ms, long-running runs emit progress at least every 10 seconds. EP-010 must refine targets.

## Accessibility Test Rules

If UI exists: keyboard navigation, accessible names, error text, focus handling, and no color-only communication for critical flows.

## Security Test Rules

Cover secret redaction, provider credential safety, MCP/plugin permission denial, loopback-only service, input validation, dependency audit behavior.

## Test Data Rules

Use generated fixtures, placeholders only, temp dirs, fake providers, mock MCP servers, no production data.

## Mocking Rules

Mock provider transports and MCP servers. Do not mock core domain logic for runtime behavior.

## Required Tests Per Feature

Unit tests for domain behavior, integration tests for persistence/service, contract tests for external/internal API, E2E/acceptance tests for user-visible behavior, regression tests for bugs, security tests for trust boundaries.

## Validation Matrix

| Change Type     | Commands                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| Docs only       | `./scripts/preflight.sh`, `git diff --name-only`                                     |
| Core domain     | `./scripts/lint.sh`, `./scripts/typecheck.sh`, `./scripts/test-unit.sh`              |
| Persistence     | `./scripts/typecheck.sh`, `./scripts/test-integration.sh`                            |
| Service/API/CLI | `./scripts/typecheck.sh`, `./scripts/test-integration.sh`, `./scripts/smoke-test.sh` |
| GUI             | `./scripts/typecheck.sh`, `./scripts/test-e2e.sh`                                    |
| Security        | `./scripts/security-check.sh`, `./scripts/dependency-audit.sh`                       |
| Release         | `./scripts/verify.sh`, `./scripts/production-readiness-check.sh`                     |

## Definition of Test Done

Required tests exist, pass, are deterministic, use safe fixtures, require no real external credentials by default, and CI runs the same commands documented in `COMMANDS.md`.
