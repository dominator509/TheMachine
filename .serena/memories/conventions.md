# Conventions

- TypeScript ESM; relative emitted imports need Node-compatible `.js` extensions when source imports local modules.
- Service package exposes typed contracts in `packages/service/src/contracts`, handlers in `handlers`, and client composition through `client/ServiceClient.ts` + `client/factory.ts`.
- Behavior changes require focused tests: pure logic in unit tests, service/storage/provider/MCP/plugin/CLI boundaries in integration tests, CLI/UI flows in e2e where relevant.
- ExecPlans are markdown ledgers with milestone validation, progress, discoveries, decisions, and outcomes; update them during work, not only at final response.
- Production claims must distinguish local validation, release approval records, unsigned build artifacts, and actual deployment/signing/publishing.
- Secrets represented as references, never raw values; provider credentials, MCP servers, plugins, filesystem, and command execution are security boundaries.
- Prefer existing package boundaries and handlers over new abstractions; avoid broad refactors and mass formatting inside scoped plans.
- `REPO_BRIEF.md` is the compact Obsidian/Serena/Codex context; do not duplicate large docs into memories.