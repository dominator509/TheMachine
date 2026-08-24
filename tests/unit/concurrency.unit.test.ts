import { describe, it, expect } from "vitest";
import {
  createConcurrencyStateMachine,
  requestAcquisition,
  confirmAcquisition,
  requestRelease,
  completeRelease,
  checkDeadlocks,
  removeDeadlocked,
  resetConcurrencyStateMachine,
  DEFAULT_CONCURRENCY_CONFIG,
  type ConcurrencyConfig,
  type ConcurrencyStateMachine,
} from "@the-machine/core";

// ── State Machine Creation ──────────────────────────────────────────────

describe("createConcurrencyStateMachine", () => {
  it("creates machine in IDLE state with default config", () => {
    const machine = createConcurrencyStateMachine();
    expect(machine.state).toBe("IDLE");
    expect(machine.currentAgentId).toBeNull();
    expect(machine.acquiredCount).toBe(0);
    expect(machine.config).toEqual(DEFAULT_CONCURRENCY_CONFIG);
    expect(machine.queue).toEqual([]);
  });

  it("accepts custom concurrency config", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 3, defaultTimeoutMs: 60_000 };
    const machine = createConcurrencyStateMachine(config);
    expect(machine.config.maxConcurrency).toBe(3);
    expect(machine.config.defaultTimeoutMs).toBe(60_000);
  });
});

// ── Acquisition (IDLE → ACQUIRING) ──────────────────────────────────────

describe("requestAcquisition", () => {
  it("transitions from IDLE to ACQUIRING when capacity available", () => {
    const machine = createConcurrencyStateMachine();
    const result = requestAcquisition(machine, "agent-1");
    expect(result.allowed).toBe(true);
    expect(result.machine.state).toBe("ACQUIRING");
    expect(result.machine.currentAgentId).toBe("agent-1");
  });

  it("enqueues agent when max concurrency reached", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 1, defaultTimeoutMs: 30_000 };
    let machine = createConcurrencyStateMachine(config);

    // First agent acquires fully
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;

    // Second agent gets enqueued
    const second = requestAcquisition(machine, "agent-2");
    expect(second.allowed).toBe(false);
    expect(second.reason).toContain("Max concurrency");
    expect(second.machine.queue).toHaveLength(1);
    expect(second.machine.queue[0].agentId).toBe("agent-2");
  });

  it("preserves FIFO queue order across multiple enqueues", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 1, defaultTimeoutMs: 30_000 };
    let machine = createConcurrencyStateMachine(config);

    // agent-1 acquires fully
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;

    const r2 = requestAcquisition(machine, "agent-2");
    machine = r2.machine;

    const r3 = requestAcquisition(machine, "agent-3");
    machine = r3.machine;

    expect(machine.queue).toHaveLength(2);
    expect(machine.queue[0].agentId).toBe("agent-2");
    expect(machine.queue[1].agentId).toBe("agent-3");
  });

  it("does not mutate the original machine when not allowed", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 1, defaultTimeoutMs: 30_000 };
    const machine = createConcurrencyStateMachine(config);
    const filled: ConcurrencyStateMachine = {
      ...machine,
      acquiredCount: 1,
      state: "ACQUIRED",
      currentAgentId: "agent-1",
    };

    const result = requestAcquisition(filled, "agent-2");
    expect(result.allowed).toBe(false);
    expect(result.machine.queue).toHaveLength(1);
  });
});

// ── Confirmation (ACQUIRING → ACQUIRED) ─────────────────────────────────

describe("confirmAcquisition", () => {
  it("transitions from ACQUIRING to ACQUIRED", () => {
    const machine = createConcurrencyStateMachine();
    const acquiring = requestAcquisition(machine, "agent-1");
    const result = confirmAcquisition(acquiring.machine, "agent-1");
    expect(result.allowed).toBe(true);
    expect(result.machine.state).toBe("ACQUIRED");
    expect(result.machine.acquiredCount).toBe(1);
  });

  it("rejects when agent ID does not match", () => {
    const machine = createConcurrencyStateMachine();
    const acquiring = requestAcquisition(machine, "agent-1");
    const result = confirmAcquisition(acquiring.machine, "agent-2");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not the acquiring agent");
  });

  it("rejects when not in ACQUIRING state", () => {
    const machine = createConcurrencyStateMachine();
    const result = confirmAcquisition(machine, "agent-1");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cannot acquire in state IDLE");
  });
});

// ── Release (ACQUIRED → RELEASING → IDLE) ───────────────────────────────

describe("requestRelease", () => {
  it("transitions from ACQUIRED to RELEASING", () => {
    const machine = createConcurrencyStateMachine();
    const acquiring = requestAcquisition(machine, "agent-1");
    const acquired = confirmAcquisition(acquiring.machine, "agent-1");
    const result = requestRelease(acquired.machine, "agent-1");
    expect(result.allowed).toBe(true);
    expect(result.machine.state).toBe("RELEASING");
  });

  it("rejects when wrong agent tries to release", () => {
    const machine = createConcurrencyStateMachine();
    const acquiring = requestAcquisition(machine, "agent-1");
    const acquired = confirmAcquisition(acquiring.machine, "agent-1");
    const result = requestRelease(acquired.machine, "agent-2");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("does not hold");
  });

  it("rejects when not in ACQUIRED state", () => {
    const machine = createConcurrencyStateMachine();
    const result = requestRelease(machine, "agent-1");
    expect(result.allowed).toBe(false);
  });
});

describe("completeRelease", () => {
  it("transitions from RELEASING to IDLE when queue is empty", () => {
    let machine = createConcurrencyStateMachine();
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;
    machine = requestRelease(machine, "agent-1").machine;

    const result = completeRelease(machine);
    expect(result.allowed).toBe(true);
    expect(result.machine.state).toBe("IDLE");
    expect(result.machine.currentAgentId).toBeNull();
    expect(result.machine.acquiredCount).toBe(0);
  });

  it("dequeues next agent from FIFO queue on release", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 1, defaultTimeoutMs: 30_000 };
    let machine = createConcurrencyStateMachine(config);

    // agent-1 acquires
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;

    // agent-2 enqueued
    machine = requestAcquisition(machine, "agent-2").machine;

    // agent-1 releases
    machine = requestRelease(machine, "agent-1").machine;
    const result = completeRelease(machine);

    expect(result.allowed).toBe(true);
    expect(result.machine.state).toBe("ACQUIRING");
    expect(result.machine.currentAgentId).toBe("agent-2");
    expect(result.machine.queue).toHaveLength(0);
  });

  it("decrements acquiredCount on release", () => {
    let machine = createConcurrencyStateMachine({ maxConcurrency: 2, defaultTimeoutMs: 30_000 });

    // agent-2 acquires after agent-1 (currentAgentId tracks the most recent acquirer)
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;
    machine = requestAcquisition(machine, "agent-2").machine;
    machine = confirmAcquisition(machine, "agent-2").machine;

    // release via the current holder (agent-2)
    machine = requestRelease(machine, "agent-2").machine;
    const result = completeRelease(machine);

    expect(result.machine.acquiredCount).toBe(1);
  });

  it("rejects when not in RELEASING state", () => {
    const machine = createConcurrencyStateMachine();
    const result = completeRelease(machine);
    expect(result.allowed).toBe(false);
  });
});

// ── Deadlock Detection ──────────────────────────────────────────────────

describe("checkDeadlocks", () => {
  it("reports no deadlock on empty queue", () => {
    const machine = createConcurrencyStateMachine();
    const result = checkDeadlocks(machine);
    expect(result.hasDeadlock).toBe(false);
    expect(result.deadlockedAgentIds).toEqual([]);
  });

  it("detects deadlocked entries based on timeout", () => {
    const machine: ConcurrencyStateMachine = {
      state: "IDLE",
      currentAgentId: null,
      acquiredCount: 0,
      config: { maxConcurrency: 1, defaultTimeoutMs: 1 }, // 1ms timeout
      queue: [{ agentId: "stale-agent", enqueuedAt: Date.now() - 100_000, timeoutMs: 50 }],
    };

    const result = checkDeadlocks(machine);
    expect(result.hasDeadlock).toBe(true);
    expect(result.deadlockedAgentIds).toContain("stale-agent");
  });
});

describe("removeDeadlocked", () => {
  it("returns same machine when no deadlocks", () => {
    const machine = createConcurrencyStateMachine();
    const result = removeDeadlocked(machine);
    expect(result).toBe(machine);
  });

  it("removes deadlocked entries from queue", () => {
    const machine: ConcurrencyStateMachine = {
      state: "IDLE",
      currentAgentId: null,
      acquiredCount: 0,
      config: { maxConcurrency: 1, defaultTimeoutMs: 1 },
      queue: [
        { agentId: "active", enqueuedAt: Date.now(), timeoutMs: 60_000 },
        { agentId: "stale", enqueuedAt: Date.now() - 100_000, timeoutMs: 50 },
      ],
    };

    const result = removeDeadlocked(machine);
    expect(result.queue).toHaveLength(1);
    expect(result.queue[0].agentId).toBe("active");
  });
});

// ── Reset ───────────────────────────────────────────────────────────────

describe("resetConcurrencyStateMachine", () => {
  it("resets to initial IDLE state preserving config", () => {
    const config: ConcurrencyConfig = { maxConcurrency: 3, defaultTimeoutMs: 45_000 };
    let machine = createConcurrencyStateMachine(config);
    machine = requestAcquisition(machine, "agent-1").machine;
    machine = confirmAcquisition(machine, "agent-1").machine;

    const reset = resetConcurrencyStateMachine(machine);
    expect(reset.state).toBe("IDLE");
    expect(reset.currentAgentId).toBeNull();
    expect(reset.acquiredCount).toBe(0);
    expect(reset.config).toEqual(config);
    expect(reset.queue).toEqual([]);
  });
});
