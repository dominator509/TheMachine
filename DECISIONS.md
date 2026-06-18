# DECISIONS.md

## Decision Table

| ADR      |       Date | Status   | Owner        | Decision                                                                                        | Scope               |
| -------- | ---------: | -------- | ------------ | ----------------------------------------------------------------------------------------------- | ------------------- |
| ADR-0001 | 2026-06-16 | Accepted | architecture | Use TypeScript/Node 20, pnpm workspaces, Tauri 2 + React/Vite, and SQLite as provisional stack. | Foundation          |
| ADR-0002 | 2026-06-16 | Accepted | architecture | Use provider adapters for OpenAI-compatible, Anthropic-compatible, and local endpoints.         | LLM connectivity    |
| ADR-0003 | 2026-06-16 | Accepted | architecture | Keep The Machine local-first and single-user by default.                                        | Deployment/security |
| ADR-0004 | 2026-06-16 | Accepted | architecture | Implementation occurs only through one active ExecPlan.                                         | Agent workflow      |
| ADR-0005 | 2026-06-16 | Accepted | architecture | Use SQLite migrations for persistent state.                                                     | Data layer          |
| ADR-0006 | 2026-06-16 | Accepted | architecture | Plugins and MCP tools require explicit permissions and audit events.                            | Security            |

## ADR Index

Use `.agent/templates/adr-template.md` for new ADRs. New ADR files may be added under `docs/adr/` after EP-001 creates the docs structure. This file remains the root decision index.

## Initial ADR Entries

### ADR-0001: Provisional Local-First TypeScript/Tauri Stack

Context: The project requires Windows 10+ GUI, PowerShell CLI, Linux CLI, broad model support, and local PC deployment. Decision: use TypeScript/Node 20, pnpm workspaces, Tauri 2 + React/Vite, and SQLite. Alternatives: Electron, Python desktop, Rust-only. Consequence: Node/pnpm/Rust/Tauri toolchain required. Status: Accepted.

### ADR-0002: Provider Adapter Boundary

Context: The Machine must support OpenAI, Anthropic, REST/OpenAI-compatible, and local models. Decision: define provider interfaces in `core` and adapters in `providers`. Consequence: provider contract tests required. Status: Accepted.

### ADR-0003: Local-First Single-User Default

Context: Deployment target is PC. Decision: no remote multi-user auth in v1; protect secrets and local capabilities. Consequence: shared-machine cases require future auth plan. Status: Accepted.

### ADR-0004: ExecPlan-Only Implementation

Context: Agents drift with broad roadmaps or chat-only prompts. Decision: implementation occurs through one active ExecPlan with exact scope, commands, validation, and recovery. Status: Accepted.

## Rules for Adding New Decisions

Append only. Include context, decision, alternatives, consequences, status, date, owner, and scope. Supersede by adding a new ADR; never delete old decisions. Agents must inspect this file before changing architecture, stack, persistence, security, deployment, or provider boundaries.
