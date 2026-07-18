# ENVIRONMENT.md

## Required Tools

| Tool                |                        Version | Required For             | Verification                     |
| ------------------- | -----------------------------: | ------------------------ | -------------------------------- |
| Node.js             |                        20 LTS+ | TypeScript runtime/build | `node --version`                 |
| Corepack            |           bundled with Node 20 | pnpm management          | `corepack --version`             |
| pnpm                |     latest stable after EP-001 | package management       | `pnpm --version`                 |
| Git                 |                          2.40+ | repository operations    | `git --version`                  |
| Rust                |                         stable | Tauri desktop build      | `rustc --version`                |
| WebView2 Runtime    |                        current | Windows desktop runtime  | Installed apps                   |
| SQLite              | bundled driver or CLI optional | local persistence        | `sqlite3 --version` if CLI used  |
| Playwright browsers |            installed by EP-001 | E2E tests                | `pnpm exec playwright --version` |

## Package Manager

Default package manager is `pnpm`. EP-000 must confirm no package-manager conflict. EP-001 must set `packageManager` in root `package.json`.

## Environment Variables

| Name                     | Required | Environment    | Example Value                    | Secret | Description                       | Validation Rule                       |
| ------------------------ | -------- | -------------- | -------------------------------- | ------ | --------------------------------- | ------------------------------------- |
| `MACHINE_HOME`           | Optional | all            | `/home/alice/.the-machine`       | No     | Base local app data directory.    | Absolute path if set.                 |
| `MACHINE_DB_PATH`        | Optional | all            | `${MACHINE_HOME}/machine.sqlite` | No     | SQLite database path.             | Parent dir exists or creatable.       |
| `MACHINE_LOG_LEVEL`      | Optional | all            | `info`                           | No     | Log level.                        | One of `trace/debug/info/warn/error`. |
| `MACHINE_BIND_HOST`      | Optional | dev/test/local | `127.0.0.1`                      | No     | Local service bind host.          | Must be loopback in v1.               |
| `MACHINE_BIND_PORT`      | Optional | dev/test/local | `3765`                           | No     | Local service port.               | Integer 1024-65535.                   |
| `OPENAI_API_KEY`         | Optional | local          | `sk-placeholder`                 | Yes    | OpenAI provider key.              | Required only when provider active.   |
| `ANTHROPIC_API_KEY`      | Optional | local          | `sk-ant-placeholder`             | Yes    | Anthropic provider key.           | Required only when provider active.   |
| `LOCAL_LLM_BASE_URL`     | Optional | local          | `http://127.0.0.1:11434/v1`      | No     | Local OpenAI-compatible endpoint. | Valid URL.                            |
| `MCP_CONFIG_PATH`        | Optional | local          | `${MACHINE_HOME}/mcp.json`       | No     | MCP registry path.                | JSON if present.                      |
| `MACHINE_PLUGIN_DIR`     | Optional | local          | `${MACHINE_HOME}/plugins`        | No     | Plugin directory.                 | Directory exists/creatable.           |
| `MACHINE_TELEMETRY_MODE` | Optional | all            | `local-only`                     | No     | Telemetry mode.                   | Must be `local-only` in v1.           |

## Secrets

Secrets are optional until a provider is activated. Missing provider secrets are STOP conditions only when the active flow requires that provider.

## Local Development Setup

After EP-001:

```sh
./scripts/preflight.sh
./scripts/install.sh
pnpm run dev
```

## Local Database Setup

After EP-003:

```sh
pnpm run db:setup
pnpm run db:migrate
```

## Test Environment Setup

Tests use temp databases, fake provider transports, and mock MCP servers. No real API keys are required by default.

## Staging Environment Setup

V1 staging means a release-candidate install on a clean OS user profile or VM. Use packaged artifacts, not dev server.

## Production Environment Setup

Production means user-installed desktop/CLI release on local PC with release notes, rollback package, checksums where practical, and production-readiness report.

## Configuration Validation

Validate DB path, log path, bind host, provider profile completeness, MCP JSON, plugin directory permissions, and secret references at startup.

## Environment Parity Rules

Dev/test/staging/prod use the same command wrappers. Test uses fake providers. Staging uses packaged artifacts. Production does not require dev dependencies.

## Troubleshooting

If `pnpm` is missing, enable Corepack. If desktop build fails, verify Rust and WebView2. If provider test fails, re-enter credentials without committing them. If DB is locked, stop duplicate app process.
