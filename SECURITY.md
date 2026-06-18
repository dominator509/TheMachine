# SECURITY.md

## Security Goals

Protect local repositories and secrets, prevent unpermissioned provider/MCP/plugin/command/filesystem access, redact sensitive data, fail closed, and make dangerous actions STOP conditions.

## Threat Model Summary

Threats include malicious repository content, malicious MCP servers/plugins, leaked API keys, prompt/log secret leakage, shell command escape, local service exposure, destructive migration, dependency vulnerability, and prompt injection.

## Authentication Rules

V1 is local single-user. No remote multi-user auth is required. Local service binds to loopback. Remote access is out of scope unless a future ExecPlan adds authentication.

## Authorization Rules

Provider use requires configured profile. MCP tools and plugins require explicit grants. Commands must be allowed by `COMMANDS.md`. Filesystem writes must stay in the workspace/repo unless approved. Production deployment requires explicit permission.

## Input Validation Rules

Validate CLI args, GUI forms, service requests, provider config, MCP config, plugin manifests, paths, command names, ExecPlan paths, migration names, and environment variables.

## Output Encoding Rules

GUI renders content safely, markdown previews sanitize unsafe HTML, logs escape control characters where practical, secrets are never displayed raw.

## Secret Management Rules

Never commit secrets. Store provider keys in OS keychain or encrypted local vault. `.env` is local and ignored. Example env files use placeholders. Redact before persistence.

## Dependency Security Rules

Add dependencies only when necessary. Run `./scripts/dependency-audit.sh`. Critical/high vulnerabilities must be fixed or explicitly accepted before production readiness.

## Logging Redaction Rules

Redact API keys, bearer tokens, passwords, private keys, auth headers, MCP credentials, plugin secrets, and sensitive prompt contents.

## Data Protection Rules

Store only required local state. Avoid storing full prompts/code by default. Provide deletion and export of local workspace state. Diagnostic exports must be redacted.

## Production Data Rules

Do not mutate production data, run destructive migrations, upload repository contents, or log production data without explicit permission.

## Safe Migration Rules

Use migrations, test them, backup before destructive changes, stop before irreversible migration, prefer additive schema changes.

## API Security Rules

Local service binds to `127.0.0.1` by default. Unknown commands are rejected. Long-running actions require run IDs and audit events. Errors must not leak secrets.

## CSRF/CORS/Session Rules

Disable broad CORS. If browser-accessible local API exists, require an unguessable local session token generated at startup and never stored in repository files.

## Rate Limiting Rules

Provider, MCP, plugin, and local service actions must have timeouts and concurrency limits.

## File Upload Rules

Future import features must store files only under workspace, enforce size limits, and not execute imported files.

## Security Checklist

- [ ] No secrets committed.
- [ ] Redaction tests pass.
- [ ] Provider keys stored securely.
- [ ] MCP/plugin permissions enforced.
- [ ] Local service loopback-only.
- [ ] Dependency audit reviewed.
- [ ] Security check passes.
- [ ] Destructive actions guarded by STOP.

## STOP Conditions for Security-Sensitive Actions

Stop on missing secrets, secret exposure, destructive commands, remote service binding, irreversible migration, unapproved sensitive plugin permissions, legal/compliance judgment, or paid provider account setup.
