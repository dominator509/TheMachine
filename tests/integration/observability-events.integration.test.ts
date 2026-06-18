// Integration tests for observability events module — metrics recording and querying.
import { describe, it, expect, beforeEach } from "vitest";
import {
  createEventRecorder,
  type ObservableEvent,
  type EventFilter,
} from "@the-machine/observability";

describe("EventRecorder (integration)", () => {
  let recorder: ReturnType<typeof createEventRecorder>;

  beforeEach(() => {
    recorder = createEventRecorder();
  });

  it("should record run events and query by type", () => {
    recorder.record({
      type: "run",
      timestamp: "2026-06-16T12:00:00.000Z",
      run_id: "run-001",
      execplan_path: "EP-008.md",
      status: "started",
    });

    recorder.record({
      type: "run",
      timestamp: "2026-06-16T12:05:00.000Z",
      run_id: "run-001",
      execplan_path: "EP-008.md",
      status: "completed",
      duration_ms: 300000,
    });

    const runs = recorder.query({ type: "run" });
    expect(runs).toHaveLength(2);
    expect(runs[0]).toMatchObject({ run_id: "run-001", execplan_path: "EP-008.md" });
    expect(runs[1]).toMatchObject({ status: "completed", duration_ms: 300000 });
  });

  it("should record milestone events", () => {
    recorder.record({
      type: "milestone",
      timestamp: "2026-06-16T12:00:00.000Z",
      run_id: "run-001",
      milestone_id: "M1",
      status: "started",
    });

    recorder.record({
      type: "milestone",
      timestamp: "2026-06-16T12:10:00.000Z",
      run_id: "run-001",
      milestone_id: "M1",
      status: "completed",
      duration_ms: 600000,
    });

    const milestones = recorder.query({ type: "milestone" });
    expect(milestones).toHaveLength(2);
  });

  it("should record command events", () => {
    recorder.record({
      type: "command",
      timestamp: "2026-06-16T12:00:00.000Z",
      command: "pnpm run build",
      exit_code: 0,
      duration_ms: 15000,
      stdout_length: 2048,
      stderr_length: 0,
    });

    recorder.record({
      type: "command",
      timestamp: "2026-06-16T12:01:00.000Z",
      command: "pnpm run test",
      exit_code: 1,
      duration_ms: 5000,
      stdout_length: 512,
      stderr_length: 128,
      error_code: "TEST_FAILURE",
    });

    const commands = recorder.query({ type: "command" });
    expect(commands).toHaveLength(2);

    const [first, second] = commands as ObservableEvent[];
    if ("command" in first!) {
      expect(first.command).toBe("pnpm run build");
    }
    if ("command" in second!) {
      expect(second.exit_code).toBe(1);
      expect(second.error_code).toBe("TEST_FAILURE");
    }
  });

  it("should record provider events", () => {
    recorder.record({
      type: "provider",
      timestamp: "2026-06-16T12:00:00.000Z",
      run_id: "run-001",
      provider_id: "openai",
      model: "gpt-4",
      duration_ms: 2500,
      success: true,
      token_count: 150,
    });

    recorder.record({
      type: "provider",
      timestamp: "2026-06-16T12:05:00.000Z",
      run_id: "run-002",
      provider_id: "anthropic",
      model: "claude-3",
      duration_ms: 10000,
      success: false,
      error_code: "RATE_LIMITED",
    });

    const providers = recorder.query({ type: "provider" });
    expect(providers).toHaveLength(2);
  });

  it("should record MCP events", () => {
    recorder.record({
      type: "mcp",
      timestamp: "2026-06-16T12:00:00.000Z",
      mcp_server_id: "filesystem",
      tool_name: "read_file",
      duration_ms: 50,
      success: true,
    });

    const mcpEvents = recorder.query({ type: "mcp" });
    expect(mcpEvents).toHaveLength(1);
    if ("mcp_server_id" in mcpEvents[0]!) {
      expect(mcpEvents[0].mcp_server_id).toBe("filesystem");
      expect(mcpEvents[0].tool_name).toBe("read_file");
    }
  });

  it("should record plugin events", () => {
    recorder.record({
      type: "plugin",
      timestamp: "2026-06-16T12:00:00.000Z",
      plugin_id: "linter",
      action: "lint_file",
      duration_ms: 200,
      success: true,
    });

    const pluginEvents = recorder.query({ type: "plugin" });
    expect(pluginEvents).toHaveLength(1);
    if ("plugin_id" in pluginEvents[0]!) {
      expect(pluginEvents[0].plugin_id).toBe("linter");
    }
  });

  it("should query all events across types", () => {
    recorder.record({ type: "run", timestamp: "T1", execplan_path: "EP.md", status: "started" });
    recorder.record({ type: "milestone", timestamp: "T2", milestone_id: "M1", status: "started" });
    recorder.record({ type: "command", timestamp: "T3", command: "echo hi", exit_code: 0 });
    recorder.record({
      type: "provider",
      timestamp: "T4",
      provider_id: "openai",
      model: "gpt-4",
      duration_ms: 100,
      success: true,
    });
    recorder.record({
      type: "mcp",
      timestamp: "T5",
      mcp_server_id: "fs",
      tool_name: "read",
      duration_ms: 10,
      success: true,
    });
    recorder.record({
      type: "plugin",
      timestamp: "T6",
      plugin_id: "p",
      action: "run",
      duration_ms: 50,
      success: true,
    });

    const all = recorder.query();
    expect(all).toHaveLength(6);
    expect(recorder.count()).toBe(6);
    expect(recorder.types()).toEqual(
      expect.arrayContaining(["run", "milestone", "command", "provider", "mcp", "plugin"]),
    );
  });

  it("should filter by run_id", () => {
    recorder.record({
      type: "run",
      timestamp: "T1",
      run_id: "A",
      execplan_path: "EP.md",
      status: "started",
    });
    recorder.record({
      type: "run",
      timestamp: "T2",
      run_id: "B",
      execplan_path: "EP.md",
      status: "started",
    });
    recorder.record({
      type: "milestone",
      timestamp: "T3",
      run_id: "A",
      milestone_id: "M1",
      status: "started",
    });

    const runA = recorder.query({ run_id: "A" });
    expect(runA).toHaveLength(2);

    const runB = recorder.query({ run_id: "B" });
    expect(runB).toHaveLength(1);
  });

  it("should filter by status", () => {
    recorder.record({ type: "run", timestamp: "T1", execplan_path: "EP.md", status: "started" });
    recorder.record({ type: "run", timestamp: "T2", execplan_path: "EP.md", status: "completed" });
    recorder.record({ type: "milestone", timestamp: "T3", milestone_id: "M1", status: "failed" });

    const completed = recorder.query({ status: "completed" });
    expect(completed).toHaveLength(1);
  });

  it("should limit results", () => {
    for (let i = 0; i < 10; i++) {
      recorder.record({
        type: "command",
        timestamp: `T${i}`,
        command: `cmd-${i}`,
        exit_code: 0,
      });
    }

    const limited = recorder.query({ type: "command", limit: 3 });
    expect(limited).toHaveLength(3);
  });

  it("should filter by timestamp (since)", () => {
    recorder.record({
      type: "run",
      timestamp: "2026-01-01T00:00:00.000Z",
      execplan_path: "EP.md",
      status: "started",
    });
    recorder.record({
      type: "run",
      timestamp: "2026-06-16T00:00:00.000Z",
      execplan_path: "EP.md",
      status: "completed",
    });

    const recent = recorder.query({ since: "2026-06-01T00:00:00.000Z" });
    expect(recent).toHaveLength(1);
  });

  it("should clear all events", () => {
    recorder.record({ type: "run", timestamp: "T1", execplan_path: "EP.md", status: "started" });
    expect(recorder.count()).toBe(1);
    recorder.clear();
    expect(recorder.count()).toBe(0);
  });

  it("should return immutable copies from query", () => {
    recorder.record({ type: "run", timestamp: "T1", execplan_path: "EP.md", status: "started" });
    const result = recorder.query();
    // Mutating the result must not affect the store
    result.length = 0;
    expect(recorder.count()).toBe(1);
  });
});
