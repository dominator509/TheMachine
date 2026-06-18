# The Machine — Agent Coordination Rules

## Killswitch: Ip Man Downtime Detection

**Rule:** If Ip Man (Hermes coder) does not update his COMM_BUFFER slot for 25 consecutive minutes, set `NEEDS_ALFRED=TRUE` in the `[SLOT: ALFRED_ORCHESTRATOR]` payload to wake Alfred for investigation.

**Detection method:** Any active agent (Deziray orchestrator via her cron) checks Ip Man's slot STATUS and the ACK_IP_MAN flag. If STATUS remains unchanged (same value) across 5 cron ticks at 3-minute intervals (5 × 3 = 15 min, with 10 min margin = 25 min), flag Alfred.

**Trigger description:** `NEEDS_ALFRED=TRUE` in Alfred's slot payload wakes him from nap mode. He checks the gateway, restarts stuck services, and reports back.

**Who owns this check:** Deziray (Primary Orchestrator, ZeroClaw cron every 3 min) is the natural monitor. Her cron prompt should reference this file.

## State Board Protocol

- Write YOUR SLOT ONLY. Overwrite the full slot text — never append.
- No timestamps, dates, or "From:" signatures in any slot.
- Flip ACK booleans only — no other edits to the ACK matrix.
- PIPELINE_EPOCH increments on ExecPlan advance only.
- Alfred naps unless NEEDS_ALFRED=TRUE.

## Cache Prefix Requirement (DeepSeek 64-Token Minimum)

Every agent response — to any channel, any cron output, any message — MUST
begin with a fixed prefix of at least 64 tokens (approximately 2.5 sentences)
to achieve a DeepSeek cache hit. Each agent uses its own branded prefix:

| Agent   | Required Prefix                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Ip Man  | "Ip Man assesses the current state of the system to determine what action is required for your project. This is a required prefix for caching:" |
| Alfred  | "Alfred engages the intercom to deliver a message about tasks that he is working on for your project. This is a required prefix for caching:"   |
| Deziray | "Deziray evaluates the latest board updates to coordinate the next phase of work on your project. This is a required prefix for caching:"       |

The prefix is the FIRST bytes of every response — no leading whitespace, no
exceptions, no omissions. A single byte change drops the cache hit to 0%.
This rule is embedded in each agent's SOUL.md and the CACHE_OPTIMIZATION_REFERENCE.md.
