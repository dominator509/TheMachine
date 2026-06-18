import { describe, it, expect } from "vitest";
import type { PlanResponse } from "@the-machine/service";
import type { RunResponse } from "@the-machine/service";
import type { ValidationResponse } from "@the-machine/service";
import {
  buildMilestoneDisplay,
  buildPlanStatusDisplay,
  buildRunDisplay,
  buildValidationPanelDisplay,
  buildStopConditionDisplay,
  formatMilestoneList,
  formatProgressBar,
  formatValidationPanel,
  formatPlanStatus,
} from "../../apps/desktop/src/planUI.js";

describe("planUI", () => {
  // ── buildMilestoneDisplay ──────────────────────────────────────────────

  describe("buildMilestoneDisplay", () => {
    it("returns empty list for zero milestones", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Test",
        status: "pending",
        priority: 5,
        milestoneCount: 0,
        completedMilestones: 0,
        currentMilestone: null,
      };
      expect(buildMilestoneDisplay(plan)).toEqual([]);
    });

    it("marks completed, active, and pending milestones correctly", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Test",
        status: "active",
        priority: 5,
        milestoneCount: 4,
        completedMilestones: 2,
        currentMilestone: "M2",
      };
      const result = buildMilestoneDisplay(plan);
      expect(result).toHaveLength(4);
      expect(result[0].status).toBe("completed");
      expect(result[1].status).toBe("completed");
      expect(result[2].status).toBe("active");
      expect(result[3].status).toBe("pending");
    });

    it("marks all milestones stopped when plan is stopped", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Test",
        status: "stopped",
        priority: 5,
        milestoneCount: 3,
        completedMilestones: 1,
        currentMilestone: null,
      };
      const result = buildMilestoneDisplay(plan);
      expect(result[0].status).toBe("completed");
      expect(result[1].status).toBe("stopped");
      expect(result[2].status).toBe("stopped");
    });

    it("marks all milestones pending when plan is pending", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Test",
        status: "pending",
        priority: 5,
        milestoneCount: 2,
        completedMilestones: 0,
        currentMilestone: null,
      };
      const result = buildMilestoneDisplay(plan);
      expect(result[0].status).toBe("pending");
      expect(result[1].status).toBe("pending");
    });
  });

  // ── buildPlanStatusDisplay ─────────────────────────────────────────────

  describe("buildPlanStatusDisplay", () => {
    it("computes progress percentage", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Progress Test",
        status: "active",
        priority: 5,
        milestoneCount: 10,
        completedMilestones: 3,
        currentMilestone: null,
      };
      const display = buildPlanStatusDisplay(plan, []);
      expect(display.progressPercent).toBe(30);
      expect(display.isRunning).toBe(false);
      expect(display.isStopped).toBe(false);
      expect(display.isCompleted).toBe(false);
    });

    it("detects running when active runs exist", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Active Test",
        status: "active",
        priority: 5,
        milestoneCount: 5,
        completedMilestones: 2,
        currentMilestone: null,
      };
      const activeRun: RunResponse = {
        id: "r-1" as any,
        execPlanId: "p-1" as any,
        milestoneId: null,
        status: "active",
        commandCount: 3,
        validationCount: 1,
      };
      const display = buildPlanStatusDisplay(plan, [activeRun]);
      expect(display.isRunning).toBe(true);
    });

    it("detects stopped state", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Stopped Test",
        status: "stopped",
        priority: 5,
        milestoneCount: 5,
        completedMilestones: 1,
        currentMilestone: null,
      };
      const display = buildPlanStatusDisplay(plan, []);
      expect(display.isStopped).toBe(true);
      expect(display.isCompleted).toBe(false);
    });

    it("detects completed state", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Done",
        status: "completed",
        priority: 5,
        milestoneCount: 5,
        completedMilestones: 5,
        currentMilestone: null,
      };
      const display = buildPlanStatusDisplay(plan, []);
      expect(display.isCompleted).toBe(true);
      expect(display.progressPercent).toBe(100);
    });
  });

  // ── buildRunDisplay ───────────────────────────────────────────────────

  describe("buildRunDisplay", () => {
    it("includes validations and active flag", () => {
      const run: RunResponse = {
        id: "r-1" as any,
        execPlanId: "p-1" as any,
        milestoneId: null,
        status: "active",
        commandCount: 2,
        validationCount: 1,
      };
      const validations: ValidationResponse[] = [
        {
          runId: "r-1" as any,
          command: "./scripts/test-unit.sh",
          passed: true,
          exitCode: 0,
          output: "all tests pass",
          severity: "info",
        },
      ];
      const display = buildRunDisplay(run, validations);
      expect(display.isActive).toBe(true);
      expect(display.validations).toHaveLength(1);
      expect(display.validations[0].command).toBe("./scripts/test-unit.sh");
      expect(display.validations[0].passed).toBe(true);
    });
  });

  // ── buildValidationPanelDisplay ───────────────────────────────────────

  describe("buildValidationPanelDisplay", () => {
    it("returns empty array for no validations", () => {
      expect(buildValidationPanelDisplay([])).toEqual([]);
    });

    it("maps validation responses to display objects", () => {
      const validations: ValidationResponse[] = [
        {
          runId: "r-1" as any,
          command: "test",
          passed: true,
          exitCode: 0,
          output: "ok",
          severity: "info",
        },
      ];
      const result = buildValidationPanelDisplay(validations);
      expect(result[0].command).toBe("test");
      expect(result[0].passed).toBe(true);
    });
  });

  // ── buildStopConditionDisplay ─────────────────────────────────────────

  describe("buildStopConditionDisplay", () => {
    it("returns a triggered stop condition", () => {
      const stop = buildStopConditionDisplay();
      expect(stop.triggered).toBe(true);
      expect(stop.blocker).toBeTruthy();
      expect(stop.recommendedDefault).toBeTruthy();
    });
  });

  // ── Formatters ────────────────────────────────────────────────────────

  describe("formatMilestoneList", () => {
    it("formats milestones with correct icons", () => {
      const milestones = [
        { label: "M0", status: "completed" as const },
        { label: "M1", status: "active" as const },
        { label: "M2", status: "pending" as const },
        { label: "M3", status: "stopped" as const },
      ];
      const output = formatMilestoneList(milestones);
      expect(output).toContain("[x] M0");
      expect(output).toContain("[>] M1");
      expect(output).toContain("[ ] M2");
      expect(output).toContain("[!] M3");
    });
  });

  describe("formatProgressBar", () => {
    it("renders a 50% progress bar at default width", () => {
      const bar = formatProgressBar(50);
      expect(bar).toContain("50%");
      expect(bar).toContain("[");
      expect(bar).toContain("]");
      // 50% of 20 = 10 filled
      expect(bar.length).toBeGreaterThan(10);
    });

    it("renders 0% and 100% correctly", () => {
      const empty = formatProgressBar(0, 10);
      expect(empty).toContain("0%");
      const full = formatProgressBar(100, 10);
      expect(full).toContain("100%");
    });
  });

  describe("formatValidationPanel", () => {
    it("shows placeholder when empty", () => {
      expect(formatValidationPanel([])).toBe("  No validations recorded.");
    });

    it("formats PASS and FAIL entries", () => {
      const validations = [
        {
          command: "test-unit",
          passed: true,
          exitCode: 0,
          output: "ok",
          severity: "info",
        },
        {
          command: "lint",
          passed: false,
          exitCode: 1,
          output: "errors",
          severity: "error",
        },
      ];
      const output = formatValidationPanel(validations);
      expect(output).toContain("PASS test-unit");
      expect(output).toContain("FAIL lint");
    });
  });

  describe("formatPlanStatus", () => {
    it("includes STOP condition when plan is stopped", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Stopped Plan",
        status: "stopped",
        priority: 5,
        milestoneCount: 3,
        completedMilestones: 1,
        currentMilestone: null,
      };
      const display = buildPlanStatusDisplay(plan, []);
      const output = formatPlanStatus(display);
      expect(output).toContain("Stopped Plan");
      expect(output).toContain("STOP Condition");
      expect(output).toContain("Running: No");
    });

    it("shows progress for active plan", () => {
      const plan: PlanResponse = {
        id: "p-1" as any,
        title: "Active Plan",
        status: "active",
        priority: 5,
        milestoneCount: 4,
        completedMilestones: 2,
        currentMilestone: "M2",
      };
      const activeRun: RunResponse = {
        id: "r-1" as any,
        execPlanId: "p-1" as any,
        milestoneId: null,
        status: "active",
        commandCount: 5,
        validationCount: 2,
      };
      const display = buildPlanStatusDisplay(plan, [activeRun]);
      const output = formatPlanStatus(display);
      expect(output).toContain("Active Plan");
      expect(output).toContain("50%");
      expect(output).toContain("Running: Yes");
    });
  });
});
