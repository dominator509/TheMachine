import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { legacyCommandToSpec, runSafeProcessSync } from "@the-machine/agent-runtime";
import type { ActivityStatus, EntityId, Priority, Severity } from "@the-machine/core";
import {
  ALL_MIGRATIONS,
  closeConnection,
  createConnection,
  migrate,
  type DbConnection,
} from "@the-machine/storage";
import type { PlanResponse } from "../contracts/plan.js";
import type { RunResponse } from "../contracts/run.js";
import type { ValidationResponse } from "../contracts/validation.js";

const DEFAULT_WORKSPACE_ID = "default" as EntityId;
const DEFAULT_DB_PATH = resolve(process.cwd(), ".machine", "the-machine.db");
const LEGACY_EXECUTION_FLAG = "MACHINE_ALLOW_LEGACY_PLAN_EXECUTION";

interface ParsedMilestone {
  readonly id: EntityId;
  readonly label: string;
  readonly goal: string;
  readonly status: ActivityStatus;
  readonly validationCommand: string | null;
  readonly expectedResult: string | null;
  readonly recoveryInstruction: string | null;
}

interface ParsedExecPlan {
  readonly id: EntityId;
  readonly title: string;
  readonly status: PlanResponse["status"];
  readonly priority: Priority;
  readonly milestones: ParsedMilestone[];
}

interface ExecPlanRow {
  readonly id: string;
  readonly title: string;
  readonly status: PlanResponse["status"];
  readonly priority: Priority;
}

interface MilestoneRow {
  readonly id: EntityId;
  readonly validation_command: string | null;
  readonly expected_result: string | null;
}

interface CountRow {
  readonly count: number;
}

function nowId(prefix: string): EntityId {
  return `${prefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}` as EntityId;
}

function extractBacktickedValue(value: string): string | null {
  const match = /`([^`]+)`/.exec(value);
  return match?.[1] ?? value.trim();
}

function milestoneStatus(label: string, content: string): ActivityStatus {
  return new RegExp(`^- \\[x\\] ${label}\\b`, "im").test(content) ? "completed" : "pending";
}

function legacyExecutionAllowed(): boolean {
  return process.env[LEGACY_EXECUTION_FLAG] === "1";
}

export function parseExecPlanMarkdown(filePath: string): ParsedExecPlan {
  if (!existsSync(filePath)) throw new Error(`ExecPlan file not found: ${filePath}`);
  const content = readFileSync(filePath, "utf-8");
  const parsedTitle = /^#\s+(.+)$/m.exec(content)?.[1]?.trim();
  const title = parsedTitle && parsedTitle.length > 0 ? parsedTitle : "Loaded Plan";
  const matches = Array.from(content.matchAll(/^###\s+(M\d+):\s*(.+)$/gm));
  const milestones = matches.map((match, index): ParsedMilestone => {
    const next = matches[index + 1];
    const section = content.slice(match.index, next?.index ?? content.length);
    const label = match[1] ?? `M${String(index)}`;
    const goalLine = /^-\s+Goal:\s*(.+)$/m.exec(section);
    const validationLine = /^-\s+Validation command:\s*(.+)$/m.exec(section);
    const expectedLine = /^-\s+Expected result:\s*(.+)$/m.exec(section);
    const recoveryLine = /^-\s+Recovery instruction:\s*(.+)$/m.exec(section);
    return {
      id: `${filePath}#${label}` as EntityId,
      label,
      goal: goalLine?.[1]?.trim() ?? match[2]?.trim() ?? label,
      status: milestoneStatus(label, content),
      validationCommand: validationLine ? extractBacktickedValue(validationLine[1] ?? "") : null,
      expectedResult: expectedLine?.[1]?.trim() ?? null,
      recoveryInstruction: recoveryLine?.[1]?.trim() ?? null,
    };
  });
  if (milestones.length === 0) {
    throw new Error(`ExecPlan contains no executable milestones: ${filePath}`);
  }
  const allDone = milestones.every((milestone) => milestone.status === "completed");
  return {
    id: filePath as EntityId,
    title,
    status: allDone ? "completed" : "pending",
    priority: 5,
    milestones,
  };
}

export class ServiceStore {
  readonly conn: DbConnection;

  constructor(dbPath = process.env["MACHINE_DB_PATH"] ?? DEFAULT_DB_PATH) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.conn = createConnection({ path: dbPath });
    migrate(this.conn, ALL_MIGRATIONS);
    this.ensureWorkspace(DEFAULT_WORKSPACE_ID, process.cwd());
  }

  close(): void {
    closeConnection(this.conn);
  }

  ensureWorkspace(id: EntityId, path: string): void {
    this.conn.db
      .prepare(
        `INSERT INTO workspaces (id, path, status)
         VALUES (?, ?, 'pending')
         ON CONFLICT(id) DO UPDATE SET path = excluded.path, updated_at = datetime('now')`,
      )
      .run(id, path);
  }

  loadPlan(filePath: string, workspaceId = DEFAULT_WORKSPACE_ID): PlanResponse {
    const absolutePath = resolve(filePath);
    this.ensureWorkspace(workspaceId, process.cwd());
    const parsed = parseExecPlanMarkdown(absolutePath);
    this.conn.db
      .prepare(
        `INSERT INTO execplans (id, workspace_id, title, status, priority)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           status = excluded.status,
           priority = excluded.priority,
           updated_at = datetime('now')`,
      )
      .run(parsed.id, workspaceId, parsed.title, parsed.status, parsed.priority);
    this.conn.db.prepare("DELETE FROM milestones WHERE execplan_id = ?").run(parsed.id);
    const insertMilestone = this.conn.db.prepare(
      `INSERT INTO milestones
        (id, execplan_id, label, goal, status, validation_command, expected_result, recovery_instruction)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const milestone of parsed.milestones) {
      insertMilestone.run(
        milestone.id,
        parsed.id,
        milestone.label,
        milestone.goal,
        milestone.status,
        milestone.validationCommand,
        milestone.expectedResult,
        milestone.recoveryInstruction,
      );
    }
    const saved = this.getPlan(parsed.id);
    if (!saved) throw new Error(`ExecPlan was not saved: ${parsed.id}`);
    return saved;
  }

  getPlan(planId: EntityId): PlanResponse | null {
    const row = this.conn.db
      .prepare("SELECT id, title, status, priority FROM execplans WHERE id = ?")
      .get(planId) as ExecPlanRow | undefined;
    if (!row) return null;
    const milestoneCount = (
      this.conn.db
        .prepare("SELECT COUNT(*) AS count FROM milestones WHERE execplan_id = ?")
        .get(planId) as CountRow
    ).count;
    const completedMilestones = (
      this.conn.db
        .prepare(
          "SELECT COUNT(*) AS count FROM milestones WHERE execplan_id = ? AND status = 'completed'",
        )
        .get(planId) as CountRow
    ).count;
    const current = this.conn.db
      .prepare(
        "SELECT label FROM milestones WHERE execplan_id = ? AND status != 'completed' ORDER BY rowid LIMIT 1",
      )
      .get(planId) as { label: string } | undefined;
    return {
      id: row.id as EntityId,
      title: row.title,
      status: row.status,
      priority: row.priority,
      milestoneCount,
      completedMilestones,
      currentMilestone: current?.label ?? null,
    };
  }

  listPlans(): PlanResponse[] {
    const rows = this.conn.db
      .prepare("SELECT id FROM execplans ORDER BY updated_at DESC, id ASC")
      .all() as { id: string }[];
    return rows
      .map((row) => this.getPlan(row.id as EntityId))
      .filter((plan): plan is PlanResponse => plan !== null);
  }

  startRun(planId: EntityId, requestedMilestoneId?: EntityId): RunResponse {
    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`ExecPlan not found: ${planId}`);
    const milestone = this.selectMilestone(planId, requestedMilestoneId);
    const runId = nowId("run");
    this.conn.db
      .prepare(
        "INSERT INTO agent_runs (id, execplan_id, milestone_id, status) VALUES (?, ?, ?, 'active')",
      )
      .run(runId, planId, milestone?.id ?? null);

    if (!milestone) {
      if (plan.milestoneCount > 0 && plan.completedMilestones === plan.milestoneCount) {
        this.markRun(runId, "completed");
        this.markPlan(planId, "completed");
      } else {
        this.recordValidation(
          runId,
          "milestone-selection",
          false,
          null,
          "No pending milestone could be selected.",
          "error",
        );
        this.markRun(runId, "failed");
        this.markPlan(planId, "failed");
      }
      return this.savedRun(runId);
    }

    if (!milestone.validation_command) {
      this.recordValidation(
        runId,
        "validation-policy",
        false,
        null,
        "Milestones cannot complete without a deterministic validation command.",
        "error",
      );
      this.markMilestone(milestone.id, "failed");
      this.markRun(runId, "failed");
      this.markPlan(planId, "failed");
      return this.savedRun(runId);
    }

    if (!legacyExecutionAllowed()) {
      this.recordValidation(
        runId,
        milestone.validation_command,
        false,
        null,
        `Legacy Markdown command execution is disabled. Use a versioned .machine.json plan and the agentic runtime, or explicitly set ${LEGACY_EXECUTION_FLAG}=1 for a trusted local compatibility run.`,
        "warning",
      );
      this.markMilestone(milestone.id, "stopped");
      this.markRun(runId, "stopped");
      this.markPlan(planId, "stopped");
      return this.savedRun(runId);
    }

    const started = Date.now();
    let exitCode = 1;
    let stdout = "";
    let stderr: string;
    try {
      const spec = legacyCommandToSpec(milestone.validation_command, process.cwd());
      const result = runSafeProcessSync({
        ...spec,
        timeoutMs: 30_000,
        maxOutputBytes: 2 * 1024 * 1024,
      });
      exitCode = result.exitCode;
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      stderr = error instanceof Error ? error.message : String(error);
    }

    const output = `${stdout}${stderr}`;
    const expectedMatched =
      milestone.expected_result === null || output.includes(milestone.expected_result);
    const passed = exitCode === 0 && expectedMatched;
    this.recordCommand(
      runId,
      milestone.validation_command,
      exitCode,
      stdout,
      stderr,
      Date.now() - started,
    );
    this.recordValidation(
      runId,
      milestone.validation_command,
      passed,
      exitCode,
      output,
      passed ? "info" : "error",
    );
    this.markMilestone(milestone.id, passed ? "completed" : "failed");
    this.markRun(runId, passed ? "completed" : "failed");
    this.refreshPlanStatus(planId, passed);
    return this.savedRun(runId);
  }

  getRun(runId: EntityId): RunResponse | null {
    const row = this.conn.db
      .prepare(
        `SELECT id, execplan_id, milestone_id, status,
          (SELECT COUNT(*) FROM commands WHERE run_id = agent_runs.id) AS command_count,
          (SELECT COUNT(*) FROM validations WHERE run_id = agent_runs.id) AS validation_count
         FROM agent_runs WHERE id = ?`,
      )
      .get(runId) as
      | {
          id: string;
          execplan_id: string;
          milestone_id: string | null;
          status: ActivityStatus;
          command_count: number;
          validation_count: number;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id as EntityId,
      execPlanId: row.execplan_id as EntityId,
      milestoneId: row.milestone_id as EntityId | null,
      status: row.status,
      commandCount: row.command_count,
      validationCount: row.validation_count,
    };
  }

  listRuns(): RunResponse[] {
    const rows = this.conn.db
      .prepare("SELECT id FROM agent_runs ORDER BY created_at DESC")
      .all() as {
      id: string;
    }[];
    return rows
      .map((row) => this.getRun(row.id as EntityId))
      .filter((run): run is RunResponse => run !== null);
  }

  recordValidation(
    runId: EntityId,
    command: string,
    passed: boolean,
    exitCode: number | null,
    output: string,
    severity: Severity,
  ): ValidationResponse {
    this.conn.db
      .prepare(
        `INSERT INTO validations (id, run_id, command, passed, exit_code, output, severity)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(nowId("validation"), runId, command, passed ? 1 : 0, exitCode, output, severity);
    return { runId, command, passed, exitCode, output, severity };
  }

  listValidations(runId: EntityId): ValidationResponse[] {
    const rows = this.conn.db
      .prepare(
        "SELECT command, passed, exit_code, output, severity FROM validations WHERE run_id = ?",
      )
      .all(runId) as {
      command: string;
      passed: number;
      exit_code: number | null;
      output: string | null;
      severity: Severity;
    }[];
    return rows.map((row) => ({
      runId,
      command: row.command,
      passed: row.passed === 1,
      exitCode: row.exit_code,
      output: row.output ?? "",
      severity: row.severity,
    }));
  }

  private selectMilestone(planId: EntityId, requestedMilestoneId?: EntityId): MilestoneRow | null {
    if (requestedMilestoneId) {
      return (
        (this.conn.db
          .prepare(
            "SELECT id, validation_command, expected_result FROM milestones WHERE id = ? AND execplan_id = ? AND status != 'completed'",
          )
          .get(requestedMilestoneId, planId) as MilestoneRow | undefined) ?? null
      );
    }
    return (
      (this.conn.db
        .prepare(
          "SELECT id, validation_command, expected_result FROM milestones WHERE execplan_id = ? AND status != 'completed' ORDER BY rowid LIMIT 1",
        )
        .get(planId) as MilestoneRow | undefined) ?? null
    );
  }

  private savedRun(runId: EntityId): RunResponse {
    const run = this.getRun(runId);
    if (!run) throw new Error(`Run was not saved: ${runId}`);
    return run;
  }

  private markRun(runId: EntityId, status: ActivityStatus): void {
    this.conn.db
      .prepare("UPDATE agent_runs SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, runId);
  }

  private markPlan(planId: EntityId, status: ActivityStatus): void {
    this.conn.db
      .prepare("UPDATE execplans SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, planId);
  }

  private markMilestone(milestoneId: EntityId, status: ActivityStatus): void {
    this.conn.db
      .prepare("UPDATE milestones SET status = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, milestoneId);
  }

  private refreshPlanStatus(planId: EntityId, lastValidationPassed: boolean): void {
    if (!lastValidationPassed) {
      this.markPlan(planId, "failed");
      return;
    }
    const remaining = (
      this.conn.db
        .prepare(
          "SELECT COUNT(*) AS count FROM milestones WHERE execplan_id = ? AND status != 'completed'",
        )
        .get(planId) as CountRow
    ).count;
    this.markPlan(planId, remaining === 0 ? "completed" : "pending");
  }

  private recordCommand(
    runId: EntityId,
    command: string,
    exitCode: number,
    stdout: string,
    stderr: string,
    durationMs: number,
  ): void {
    this.conn.db
      .prepare(
        `INSERT INTO commands (id, run_id, command, exit_code, stdout, stderr, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(nowId("command"), runId, command, exitCode, stdout, stderr, durationMs);
  }
}
