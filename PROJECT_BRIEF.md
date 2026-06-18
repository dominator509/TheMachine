# Project Brief: The Machine

## Project Name

The Machine

## Problem Statement

Most coding-agent workflows fail because they drift from scope, freeze behind vague approval gates, or repeatedly fixate on the same failed approach. The Machine is a local-first software development platform that turns a repository and a strict blueprint pack into a controlled, test-backed, restartable implementation workflow that can be executed by lower-tier or higher-tier LLM coding agents.

## Target Users

General users and builders who need user-friendly software development support. The product must work for people who want a fully shippable repository without manually orchestrating every coding-agent step.

## Primary User Outcomes

- Open or bootstrap a repository.
- Discover repository state and applicable implementation plans.
- Run small, bounded ExecPlans through autonomous coding-agent passes.
- Connect OpenAI-compatible, Anthropic-compatible, REST, and local/self-hosted model providers.
- Connect MCP servers and plugins with explicit permissions.
- Validate work through exact commands and evidence.
- Continue hardening passes until production readiness is achieved or a STOP condition applies.

## Business Goals

- Produce fully shippable software repositories with minimal supervision.
- Make lower-tier coding agents reliable by constraining scope, commands, validation, and recovery.
- Provide Windows 10+ desktop GUI plus PowerShell/Linux CLI.
- Remain local-first and repository-local by default.
- Support broad LLM and MCP connectivity without provider lock-in.

## Technical Goals

- Local-first desktop GUI, CLI, service/runtime, SQLite persistence, provider adapters, MCP adapters, plugin SDK, and observability.
- Persisted runs, command logs, validation results, decisions, assumptions, and plan progress.
- One active ExecPlan at a time.
- Exact commands from `COMMANDS.md` only.
- Milestone validation and final diff review for every implementation pass.

## Out of Scope

- Hosted multi-tenant SaaS in v1.
- Autonomous production deployment without explicit permission.
- Fine-tuning LLMs.
- Guaranteed correctness of third-party LLM output.
- Unrestricted plugin execution.
- Cloud sync or remote multi-user auth in v1.

## Success Metrics

- EP-000 through EP-010 can complete on a clean repository.
- `./scripts/verify.sh` passes from a clean checkout.
- `./scripts/production-readiness-check.sh` passes before release.
- At least one OpenAI-compatible, Anthropic-compatible, and local model endpoint can be configured and tested.
- At least one MCP server can be configured, permissioned, invoked, and audited.
- GUI and CLI critical flows are covered by acceptance tests.

## Production Readiness Definition

Production readiness is achieved when all required specs are implemented, all required validation commands pass, release and rollback procedures are documented and tested, observability is available, security and privacy controls pass, and remaining risks are explicitly recorded.
