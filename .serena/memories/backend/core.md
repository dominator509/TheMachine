# Backend / Core Modules

- `packages/core`: domain types, integration config shapes, readiness primitives, validators, control helpers.
- `packages/service`: service contracts, handlers, client factory, GUI server helpers, persisted ExecPlan/run/validation behavior.
- `packages/storage`: SQLite connection/migrator, migrations, generic repositories, secret-reference validation, backup/restore.
- `packages/agent-runtime`: command registry and runtime composition for plan execution.
- Persistence path default is repo-local `.machine/the-machine.db`; tests should use temp DBs and close stores.
- Service readiness currently composes provider/MCP/plugin/UI state plus production approval; keep optional live integrations distinct from accepted local release posture.
- Read `mem:integrations/core` before changing provider/MCP/plugin/security behavior.