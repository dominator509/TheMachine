// Unit tests for anti-failure controller.
import { describe, it, expect } from "vitest";
import {
  createRetryBudget,
  recordFailure,
  clearFailure,
  hasExhaustedFailures,
  evaluateStopConditions,
  checkScope,
} from "@the-machine/core";

// ─── Retry Budget ────────────────────────────────────────────────────

describe("createRetryBudget", () => {
  it("should create an empty budget", () => {
    const budget = createRetryBudget();
    expect(budget.rootFailures.size).toBe(0);
  });
});

describe("recordFailure", () => {
  it("should suggest smallest_fix on first failure", () => {
    const budget = createRetryBudget();
    const result = recordFailure(budget, "typecheck error");
    expect(result.action.action).toBe("smallest_fix");
    expect(result.action.remaining).toBe(2);
  });

  it("should suggest narrow_diagnostic on second failure", () => {
    let budget = createRetryBudget();
    budget = recordFailure(budget, "typecheck error").budget;
    const result = recordFailure(budget, "typecheck error");
    expect(result.action.action).toBe("narrow_diagnostic");
    expect(result.action.remaining).toBe(1);
    expect(result.budget.rootFailures.get("typecheck error")?.narrowDiagnosticUsed).toBe(true);
  });

  it("should suggest stop_and_abandon on third failure", () => {
    let budget = createRetryBudget();
    budget = recordFailure(budget, "typecheck error").budget;
    budget = recordFailure(budget, "typecheck error").budget;
    const result = recordFailure(budget, "typecheck error");
    expect(result.action.action).toBe("stop_and_abandon");
    expect(result.budget.rootFailures.get("typecheck error")?.exhausted).toBe(true);
  });
});

describe("clearFailure", () => {
  it("should remove a root cause from the budget", () => {
    let budget = createRetryBudget();
    budget = recordFailure(budget, "typecheck error").budget;
    expect(budget.rootFailures.size).toBe(1);
    budget = clearFailure(budget, "typecheck error");
    expect(budget.rootFailures.size).toBe(0);
  });

  it("should not throw when clearing a non-existent failure", () => {
    const budget = createRetryBudget();
    const cleared = clearFailure(budget, "nonexistent");
    expect(cleared.rootFailures.size).toBe(0);
  });
});

describe("hasExhaustedFailures", () => {
  it("should return false when no failures", () => {
    expect(hasExhaustedFailures(createRetryBudget())).toBe(false);
  });

  it("should return true when a failure is exhausted", () => {
    let budget = createRetryBudget();
    budget = recordFailure(budget, "err").budget;
    budget = recordFailure(budget, "err").budget;
    budget = recordFailure(budget, "err").budget;
    expect(hasExhaustedFailures(budget)).toBe(true);
  });
});

// ─── STOP Conditions ────────────────────────────────────────────────

describe("evaluateStopConditions", () => {
  it("should not stop when all conditions are clear", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: true,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(false);
    expect(result.blockers).toEqual([]);
  });

  it("should stop on missing secret", () => {
    const result = evaluateStopConditions({
      requiresSecret: true,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: true,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
    expect(result.blockers).toContain("Provide the required credential");
  });

  it("should stop on destructive action", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: true,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: true,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
    expect(result.blockers).toContain("User permission required before destructive operations");
  });

  it("should stop on missing command", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: false,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: true,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
    expect(result.blockers).toContain("Update COMMANDS.md before using a new command");
  });

  it("should stop on dirty repo", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: false,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
    expect(result.blockers).toContain("Commit or stash unrelated changes before proceeding");
  });

  it("should stop on unverifiable third-party API", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: true,
      repoClean: true,
      hasThirdPartyApi: true,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("should stop on missing tests framework", () => {
    const result = evaluateStopConditions({
      requiresSecret: false,
      secretAvailable: false,
      mayDestroyData: false,
      commandDefined: true,
      specAvailable: true,
      testFrameworkAvailable: false,
      repoClean: true,
      hasThirdPartyApi: false,
      apiVerifiable: false,
    });
    expect(result.shouldStop).toBe(true);
  });
});

// ─── Scope Enforcement ─────────────────────────────────────────────

describe("checkScope", () => {
  it("should pass when all changes match expected files", () => {
    const result = checkScope(["src/a.ts", "src/b.ts"], ["src/a.ts", "src/b.ts"]);
    expect(result.compliant).toBe(true);
    expect(result.unexpected).toEqual([]);
  });

  it("should detect unexpected files", () => {
    const result = checkScope(["src/a.ts"], ["src/a.ts", "src/unexpected.ts"]);
    expect(result.compliant).toBe(false);
    expect(result.unexpected).toEqual(["src/unexpected.ts"]);
  });

  it("should accept justified unexpected files", () => {
    const result = checkScope(["src/a.ts"], ["src/a.ts", "src/extra.ts"], ["src/extra.ts"]);
    expect(result.compliant).toBe(true);
    expect(result.unexpected).toEqual([]);
  });

  it("should handle empty actual changes", () => {
    const result = checkScope(["src/a.ts"], []);
    expect(result.compliant).toBe(false);
    expect(result.unexpected).toEqual([]);
    expect(result.missing).toEqual(["src/a.ts"]);
  });

  it("should handle empty expected files", () => {
    const result = checkScope([], ["src/a.ts"]);
    expect(result.compliant).toBe(false);
    expect(result.unexpected).toEqual(["src/a.ts"]);
  });
});
