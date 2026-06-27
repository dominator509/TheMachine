# Tech Stack

- TypeScript monorepo; package manager `pnpm@11.6.0`; Node requirement `>=20.0.0`.
- Workspaces: `apps/*`, `packages/*`, `tools/*`; Turbo tasks coordinate build/lint/typecheck/dev/test.
- Quality/test stack: ESLint 9, Prettier 3, TypeScript 5.8, Vitest 3, Playwright 1.52.
- Runtime/storage: Node ESM packages, SQLite via storage package/migrator, local DB default `.machine/the-machine.db` or `MACHINE_DB_PATH`.
- Release tooling: `tools/release/build-release.mjs` bundles unsigned CLI/desktop artifacts into `release/`.
- Desktop surface: Tauri v2 scaffold under `apps/desktop/src-tauri`; TypeScript desktop shell helpers under `apps/desktop/src`.
- External integration surfaces: OpenAI-compatible/Anthropic/local providers, stdio MCP registry, plugin SDK subprocess sandbox, permission/security packages.
- Use `mem:suggested_commands` for command forms and Windows wrapper differences.