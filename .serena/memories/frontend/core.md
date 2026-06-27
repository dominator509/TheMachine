# Frontend / Client Modules

- `apps/cli`: Node CLI entrypoint and command output contract; smoke/integration tests execute built CLI commands.
- `apps/desktop`: Tauri v2 scaffold plus TypeScript plan/readiness/settings UI helpers used by e2e tests.
- `packages/ui-components`: deterministic shared UI registry and release-readiness surface, not a large React component library.
- CLI and desktop should consume service client contracts rather than duplicating business logic.
- UI tests emphasize redaction, readiness/report formatting, settings permission projections, and stable text outputs.
- Release build emits unsigned `release/machine.js` and `release/desktop.js`; do not commit `release/`.