# Integrations / Security Modules

- `packages/providers`: OpenAI-compatible, Anthropic-compatible, and local HTTP adapters; tests use mocked fetch/local responses, no live keys by default.
- `packages/mcp`: MCP registry/transport with stdio JSON-RPC fixture coverage; unsupported transports should return explicit errors.
- `packages/plugin-sdk`: plugin loader/registry plus subprocess sandbox executor using Node permission flags, scoped reads, denied writes by default, timeout, and scrubbed env.
- `packages/security`: permissions, secret redaction/reference handling, secure wrappers around provider/MCP/plugin actions.
- Provider/MCP/plugin credentials and endpoints are optional until a task activates them; missing live credentials are STOP only for flows that require them.
- Keep fake/mock behavior test-only; production adapters should fail closed or use real local transport paths.