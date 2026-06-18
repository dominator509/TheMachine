# ROADMAP.md

Do not implement directly from this file. Implementation must happen through an ExecPlan.

| Phase                                        | Purpose                                                              | Dependencies                    | Exit Criteria                                                  | Linked Specs                 | Linked ExecPlans |
| -------------------------------------------- | -------------------------------------------------------------------- | ------------------------------- | -------------------------------------------------------------- | ---------------------------- | ---------------- |
| Phase 0: Repository discovery and foundation | Discover repository state and establish baseline foundation.         | Blueprint pack present.         | EP-000 and EP-001 complete; baseline commands work.            | SPEC-000, SPEC-008           | EP-000, EP-001   |
| Phase 1: Core domain                         | Implement entities, state machines, anti-failure workflow rules.     | Phase 0.                        | Core rules unit-tested.                                        | SPEC-001, SPEC-006           | EP-002           |
| Phase 2: Data and persistence                | Implement SQLite schema, migrations, repositories, backup/restore.   | Core domain stable.             | Persistence integration tests pass.                            | SPEC-002, SPEC-006           | EP-003           |
| Phase 3: API or service layer                | Implement local service/IPC, CLI contracts, provider/MCP boundaries. | Core + storage.                 | Contract and integration tests pass.                           | SPEC-003, SPEC-005, SPEC-006 | EP-004           |
| Phase 4: UI or client layer                  | Implement desktop GUI and CLI UX.                                    | Service contracts stable.       | GUI/CLI acceptance tests pass.                                 | SPEC-004, SPEC-006           | EP-005           |
| Phase 5: Auth, permissions, and security     | Implement secret storage, permissions, redaction, audit.             | Service/integration boundaries. | Security tests pass.                                           | SPEC-005, SPEC-006           | EP-006           |
| Phase 6: Testing hardening                   | Expand unit/integration/E2E/regression/failure coverage.             | Major layers implemented.       | Full verification passes reliably.                             | SPEC-001 through SPEC-008    | EP-007           |
| Phase 7: Observability and operations        | Add logs, metrics, health, diagnostics, runbooks.                    | Runtime/service stable.         | Observability acceptance passes.                               | SPEC-007, SPEC-008           | EP-008           |
| Phase 8: Deployment and release              | Package desktop/CLI, define release flow and rollback.               | Feature set stable.             | Release candidate builds and smoke-tests.                      | SPEC-008                     | EP-009           |
| Phase 9: Production readiness                | Complete final readiness gates.                                      | Phases 0-8.                     | `verify` and readiness checks pass; launch checklist complete. | SPEC-008                     | EP-010           |

## Production Readiness Milestone

All core outcomes work, specs are implemented, non-goals remain excluded, critical bugs are resolved or accepted, security/privacy controls pass, deployment and rollback are tested, observability exists, and known risks are documented.
