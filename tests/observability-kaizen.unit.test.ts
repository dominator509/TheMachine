// Unit tests for META-KAIZEN-ADVISOR proposal generator.
import { describe, it, expect } from "vitest";
import {
  parseKnownIssues,
  computeStationFailures,
  generateProposal,
  runKaizenAdvisor,
} from "@the-machine/observability";
import type { DriftDetectorState } from "@the-machine/observability";

// ─── Sample KNOWN_ISSUES.md ────────────────────────────────────────────

const SAMPLE_MARKDOWN = `# Known Issues

## Open Issues

### KI-001 — HIGH

- **Component**: packages/core/
- **Source**: audit
- **Description**: Core domain model lacks validation boundaries
- **Evidence**: No Zod schemas in types.ts
- **Status**: open
- **Proposed Fix**: null
- **Resolution**: null

### KI-002 — MEDIUM

- **Component**: packages/core/
- **Source**: audit
- **Description**: Missing error serialization for IPC
- **Evidence**: Error messages lost in IPC layer
- **Status**: open
- **Proposed Fix**: null
- **Resolution**: null

### KI-003 — LOW

- **Component**: packages/storage/
- **Source**: audit
- **Description**: File handles not released on read errors
- **Evidence**: fs.open without try/finally
- **Status**: resolved
- **Proposed Fix**: null
- **Resolution**: Fixed in commit abc123
`;

const DRIFT_STATE: DriftDetectorState = {
  baselineMean: 0.2,
  currentWindowErrors: 3,
  driftDelta: 0.35,
  anomalyActive: false,
  windowCount: 10,
  snapshotHistory: [],
};

// ─── Parse Known Issues ────────────────────────────────────────────────

describe("parseKnownIssues", () => {
  it("should parse all KI entries", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    expect(issues.length).toBe(3);
  });

  it("should extract KI IDs", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    expect(issues[0]!.id).toBe("KI-001");
    expect(issues[1]!.id).toBe("KI-002");
  });

  it("should extract severity from header", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    expect(issues[0]!.severity).toBe("HIGH");
    expect(issues[1]!.severity).toBe("MEDIUM");
    expect(issues[2]!.severity).toBe("LOW");
  });

  it("should detect resolved status", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    // KI-003 has resolution text → resolved
    expect(issues[2]!.status).toBe("resolved");
    expect(issues[0]!.status).toBe("open");
  });

  it("should handle empty markdown", () => {
    const issues = parseKnownIssues("");
    expect(issues).toEqual([]);
  });
});

// ─── Station Failures ──────────────────────────────────────────────────

describe("computeStationFailures", () => {
  it("should compute concentration per station", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const stations = computeStationFailures(issues);
    expect(stations.length).toBe(2); // core, storage
  });

  it("should sort by concentration ratio descending", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const stations = computeStationFailures(issues);
    // core: 2 open / 2 total = 1.0
    // storage: 0 open / 1 total = 0.0
    expect(stations[0]!.station).toBe("packages/core/");
    expect(stations[0]!.concentrationRatio).toBe(1.0);
  });

  it("should correctly count open vs total", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const stations = computeStationFailures(issues);
    const coreStation = stations.find((s) => s.station === "packages/core/")!;
    expect(coreStation.openIssueCount).toBe(2);
    expect(coreStation.totalIssueCount).toBe(2);
  });
});

// ─── Generate Proposal ─────────────────────────────────────────────────

describe("generateProposal", () => {
  it("should return null when no open issues", () => {
    // All resolved: only KI-003 which is resolved
    const md = `### KI-003 — LOW
- **Component**: packages/storage/
- **Source**: audit
- **Description**: File handles not released
- **Status**: resolved
- **Proposed Fix**: null
- **Resolution**: Fixed
`;
    const issues = parseKnownIssues(md);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal).toBeNull();
  });

  it("should generate XML for the highest-concentration station", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal).not.toBeNull();
    expect(proposal!.xml).toContain("<architecture_proposal>");
    expect(proposal!.xml).toContain("</architecture_proposal>");
    expect(proposal!.selectedStation).toBe("packages/core/");
  });

  it("should include evidence block", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal!.evidence.primaryFailure).toBeTruthy();
    expect(proposal!.evidence.concentrationRatio).toBe(1.0);
    expect(proposal!.evidence.openIssues).toBe(2);
  });

  it("should include proposal ID in XML", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal!.xml).toMatch(/PROP-META-KAIZEN-\d+-[a-z0-9]{4}/);
  });

  it("should detect drift anomaly in evidence", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const withAnomaly: DriftDetectorState = {
      ...DRIFT_STATE,
      anomalyActive: true,
      driftDelta: 0.5,
    };
    const proposal = generateProposal(issues, withAnomaly);
    expect(proposal!.evidence.driftAnomaly).toBe(true);
    expect(proposal!.xml).toContain("Drift anomaly ACTIVE");
  });
});

// ─── runKaizenAdvisor ──────────────────────────────────────────────────

describe("runKaizenAdvisor", () => {
  it("should parse markdown and generate proposal in one call", () => {
    const result = runKaizenAdvisor(SAMPLE_MARKDOWN, DRIFT_STATE);
    expect(result).not.toBeNull();
    expect(result!.xml).toContain("architecture_proposal");
  });

  it("should return null when all issues are resolved", () => {
    const allResolved = `### KI-001 — MEDIUM
- **Component**: packages/core/
- **Source**: audit
- **Description**: Some old issue
- **Status**: resolved
- **Proposed Fix**: null
- **Resolution**: Done
`;
    const result = runKaizenAdvisor(allResolved, DRIFT_STATE);
    expect(result).toBeNull();
  });
});

// ─── Change Type Classification ────────────────────────────────────────

describe("proposal change types", () => {
  it("should classify CRITICAL as hotfix", () => {
    const md = `### KI-001 — CRITICAL
- **Component**: packages/security/
- **Source**: audit
- **Description**: Security hole
- **Status**: open
- **Proposed Fix**: null
- **Resolution**: null
`;
    const issues = parseKnownIssues(md);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal!.xml).toContain("<change>hotfix</change>");
  });

  it("should classify HIGH as hardening", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal!.xml).toContain("<change>hardening</change>");
  });

  it("should include reversibility and regression risk", () => {
    const issues = parseKnownIssues(SAMPLE_MARKDOWN);
    const proposal = generateProposal(issues, DRIFT_STATE);
    expect(proposal!.xml).toContain("reversibility");
    expect(proposal!.xml).toContain("regression_risk");
  });
});
