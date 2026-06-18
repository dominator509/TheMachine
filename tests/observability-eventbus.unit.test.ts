// Unit tests for PANTAW-ERR event bus.
import { describe, it, expect, beforeEach } from "vitest";
import { createEventBus } from "@the-machine/observability";
import type { EventBus, ObsEvent } from "@the-machine/observability";

// ─── Event Bus Creation ────────────────────────────────────────────────

describe("createEventBus", () => {
  it("should create an empty bus", () => {
    const bus = createEventBus();
    expect(bus.size).toBe(0);
    expect(bus.all().length).toBe(0);
  });

  it("should accept custom config", () => {
    const bus = createEventBus({ maxEvents: 50, emitToStdout: false });
    expect(bus.size).toBe(0);
  });
});

// ─── Emit ───────────────────────────────────────────────────────────────

describe("emit", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = createEventBus();
  });

  it("should emit an event and return it with id and timestamp", () => {
    const event = bus.emit({
      category: "error",
      severity: "error",
      subsystem: "test",
      code: "TEST_001",
      message: "test error",
    });
    expect(event.id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    expect(event.timestamp).toBeGreaterThan(0);
    expect(event.category).toBe("error");
    expect(bus.size).toBe(1);
  });

  it("should preserve payload", () => {
    const event = bus.emit({
      category: "info",
      severity: "info",
      subsystem: "test",
      code: "TEST_002",
      message: "test with data",
      payload: { key: "value", count: 42 },
    });
    expect(event.payload).toEqual({ key: "value", count: 42 });
  });
});

// ─── Recent / All ───────────────────────────────────────────────────────

describe("recent", () => {
  it("should return newest events first", () => {
    const bus = createEventBus();
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "A", message: "first" });
    bus.emit({ category: "error", severity: "error", subsystem: "b", code: "B", message: "second" });
    const recent = bus.recent(2);
    expect(recent.length).toBe(2);
    expect(recent[0]!.message).toBe("second");
    expect(recent[1]!.message).toBe("first");
  });

  it("should cap at available events", () => {
    const bus = createEventBus();
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "A", message: "only" });
    expect(bus.recent(10).length).toBe(1);
  });
});

// ─── Filter ─────────────────────────────────────────────────────────────

describe("filter", () => {
  it("should filter by category", () => {
    const bus = createEventBus();
    bus.emit({ category: "error", severity: "error", subsystem: "a", code: "E1", message: "err1" });
    bus.emit({ category: "warning", severity: "warning", subsystem: "b", code: "W1", message: "warn1" });
    bus.emit({ category: "error", severity: "critical", subsystem: "c", code: "E2", message: "err2" });
    const errors = bus.filter((e) => e.category === "error");
    expect(errors.length).toBe(2);
  });

  it("should filter by severity", () => {
    const bus = createEventBus();
    bus.emit({ category: "error", severity: "critical", subsystem: "a", code: "C1", message: "crit" });
    bus.emit({ category: "error", severity: "error", subsystem: "b", code: "E1", message: "err" });
    const criticals = bus.filter((e) => e.severity === "critical");
    expect(criticals.length).toBe(1);
  });
});

// ─── InWindow ───────────────────────────────────────────────────────────

describe("inWindow", () => {
  it("should return events within time window", () => {
    const bus = createEventBus();
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "X", message: "recent" });
    const windowed = bus.inWindow(60_000); // 1 minute
    expect(windowed.length).toBe(1);
  });
});

// ─── Count ──────────────────────────────────────────────────────────────

describe("countByCategory", () => {
  it("should count events per category", () => {
    const bus = createEventBus();
    bus.emit({ category: "error", severity: "error", subsystem: "a", code: "E", message: "err" });
    bus.emit({ category: "error", severity: "error", subsystem: "b", code: "E2", message: "err2" });
    bus.emit({ category: "warning", severity: "warning", subsystem: "c", code: "W", message: "warn" });
    const counts = bus.countByCategory();
    expect(counts.get("error")).toBe(2);
    expect(counts.get("warning")).toBe(1);
    expect(counts.get("info")).toBeUndefined();
  });
});

// ─── Capacity ───────────────────────────────────────────────────────────

describe("capacity", () => {
  it("should evict oldest events when at capacity", () => {
    const bus = createEventBus({ maxEvents: 3 });
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "I1", message: "first" });
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "I2", message: "second" });
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "I3", message: "third" });
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "I4", message: "fourth" });
    expect(bus.size).toBe(3);
    const all = bus.all();
    expect(all[0]!.message).toBe("fourth");
    expect(all[2]!.message).toBe("second");
  });
});

// ─── Clear ──────────────────────────────────────────────────────────────

describe("clear", () => {
  it("should drop all events", () => {
    const bus = createEventBus();
    bus.emit({ category: "info", severity: "info", subsystem: "a", code: "X", message: "test" });
    bus.clear();
    expect(bus.size).toBe(0);
    expect(bus.all().length).toBe(0);
  });
});
