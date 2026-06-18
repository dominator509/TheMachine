# The Machine

Local-first agentic development platform that turns a repository + blueprint pack
into controlled, restartable implementation workflows for LLM coding agents.

## Quick Start

```bash
git clone <repo-url>
cd machine
pnpm install
pnpm build
pnpm cli --help
```

## Architecture

12 subsystems organized as PNPM workspace packages:

| Subsystem | Package | Purpose |
|-----------|---------|---------|
| core | `packages/core/` | Domain model, entity IDs, config |
| storage | `packages/storage/` | File system persistence |
| service | `packages/service/` | Business logic orchestration |
| providers | `packages/providers/` | LLM provider adapters |
| mcp | `packages/mcp/` | Model Context Protocol integration |
| security | `packages/security/` | Auth, tokens, permissions |
| observability | `packages/observability/` | Events, snapshots, drift detection |
| agent-runtime | `packages/agent-runtime/` | Agent lifecycle management |
| plugin-sdk | `packages/plugin-sdk/` | Plugin loader and registry |
| cli | `apps/cli/` | Command-line interface |
| desktop | `apps/desktop/` | Tauri v2 desktop application |
| ui-components | `packages/ui-components/` | Shared UI primitives |

### Key Documents

- [ARCHITECTURE.md](./ARCHITECTURE.md) — full system design
- [ROADMAP.md](./ROADMAP.md) — development roadmap
- [BUILD_ROADMAP.md](./BUILD_ROADMAP.md) — build pipeline stages
- [RELEASE.md](./RELEASE.md) — release process and versioning
- [AGENTS.md](./AGENTS.md) — agent rules and protocol
- [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — bug and gap registry

## Testing

```bash
pnpm test:unit          # Unit tests (~290 suites)
pnpm test:integration   # Integration tests
node tools/auto-review.mjs  # Full pipeline: typecheck → lint → unit → integration
```

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development setup and guidelines.

All code changes go through the proposal feedback loop (AGENTS.md §5.1).
Agents discover gaps, post structured proposals to COMM_BUFFER.md, and Alfred
(Overseer) validates through a 5-layer gate before human review.

## License

MIT
