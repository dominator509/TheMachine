// META-KAIZEN-ADVISOR: Auto-proposal generator.
// Reads KNOWN_ISSUES.md and drift detector state to identify the station
// with the highest failure concentration. Generates ONE structured XML
// proposal matching AGENTS.md §5.1 schema for COMM_BUFFER.md submission.

import type { DriftDetectorState } from "../events/driftDetector.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** Parsed KI entry from KNOWN_ISSUES.md. */
export interface KnownIssue {
  readonly id: string;
  readonly component: string;
  readonly severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  readonly status: "open" | "in_progress" | "resolved";
  readonly description: string;
  readonly proposedFix: string | null;
  readonly resolution: string | null;
}

/** Station failure concentration data. */
export interface StationFailure {
  /** Component/station name. */
  readonly station: string;
  /** Open issues assigned to this station. */
  readonly openIssueCount: number;
  /** Total issues (open + resolved) for this station. */
  readonly totalIssueCount: number;
  /** Failure concentration ratio (open / total). */
  readonly concentrationRatio: number;
  /** The open issues themselves. */
  readonly issues: KnownIssue[];
}

/** A generated improvement proposal in AGENTS.md §5.1 XML format. */
export interface KaizenProposal {
  /** The raw XML string ready for COMM_BUFFER.md slot. */
  readonly xml: string;
  /** Which station was selected. */
  readonly selectedStation: string;
  /** The evidence backing this proposal. */
  readonly evidence: {
    readonly primaryFailure: string;
    readonly concentrationRatio: number;
    readonly openIssues: number;
    readonly driftAnomaly: boolean;
  };
}

// ── KNOWN_ISSUES.md Parser ──────────────────────────────────────────────────

function firstMatch(pattern: RegExp, text: string): RegExpExecArray | null {
  return pattern.exec(text);
}

/**
 * Parse a KNOWN_ISSUES.md file into structured KnownIssue entries.
 * Handles the semi-structured markdown format with `### KI-NNN` headers.
 */
export function parseKnownIssues(markdown: string): KnownIssue[] {
  const issues: KnownIssue[] = [];
  const blocks = markdown.split(/^### /m).slice(1); // Skip content before first KI header

  for (const block of blocks) {
    const idMatch = firstMatch(/^(KI-\d+)/m, block);
    if (!idMatch) continue;

    const id = idMatch[1];
    if (!id) continue;

    const compMatch = firstMatch(/\*\*Component\*\*:\s*(.+)/, block);
    const descMatch = firstMatch(/\*\*Description\*\*:\s*(.+)/, block);
    const statusMatch = firstMatch(/\*\*Status\*\*:\s*(\w+)/, block);
    const fixMatch = firstMatch(/\*\*Proposed Fix\*\*:\s*(.+)/, block);
    const resMatch = firstMatch(/\*\*Resolution\*\*:\s*(.+)/, block);

    // "Source" is actually "severity" in some older format entries,
    // but the current format uses "Source" for where it came from.
    // Severity is inferred from the header: KI-XXX — SEVERITY
    const headerSevMatch = firstMatch(
      /^KI-\d+\s*[—–-]\s*(CRITICAL|HIGH|MEDIUM|LOW)/m,
      block,
    );

    // Determine status — "open" if no resolution or explicit status is "open".
    const rawStatus = (statusMatch?.[1] ?? "").trim().toLowerCase();
    const status: KnownIssue["status"] =
      rawStatus === "in_progress" ? "in_progress"
      : rawStatus === "resolved" ? "resolved"
      : "open";

    const proposedFix = fixMatch?.[1]?.trim();
    const resolution = resMatch?.[1]?.trim();

    // If resolution text says "null" or is empty, treat as no resolution.
    const effectiveResolution = (resolution && resolution !== "null" && resolution !== "") ? resolution : null;

    // Auto-detect resolved status from resolution text.
    const effectiveStatus: KnownIssue["status"] =
      effectiveResolution !== null && status === "open" ? "resolved" : status;

    issues.push({
      id,
      severity: (headerSevMatch?.[1]?.trim() ?? "MEDIUM") as KnownIssue["severity"],
      component: compMatch?.[1]?.trim() ?? "unknown",
      description: descMatch?.[1]?.trim() ?? block.split("\n")[1]?.trim() ?? "no description",
      status: effectiveStatus,
      proposedFix: (proposedFix && proposedFix !== "null") ? proposedFix : null,
      resolution: effectiveResolution,
    });
  }

  return issues;
}

// ── Station Concentration Analysis ──────────────────────────────────────────

/**
 * Compute failure concentration per station/component.
 * Returns stations sorted by concentration ratio (highest first).
 */
export function computeStationFailures(issues: KnownIssue[]): StationFailure[] {
  const stationMap = new Map<string, { open: KnownIssue[]; total: KnownIssue[] }>();

  for (const issue of issues) {
    const station = issue.component;
    let entry = stationMap.get(station);
    if (!entry) {
      entry = { open: [], total: [] };
      stationMap.set(station, entry);
    }
    entry.total.push(issue);
    if (issue.status === "open" || issue.status === "in_progress") {
      entry.open.push(issue);
    }
  }

  const stations: StationFailure[] = [];

  for (const [station, entry] of stationMap) {
    const openCount = entry.open.length;
    const totalCount = entry.total.length;
    const ratio = totalCount > 0 ? openCount / totalCount : 0;
    stations.push({
      station,
      openIssueCount: openCount,
      totalIssueCount: totalCount,
      concentrationRatio: ratio,
      issues: entry.open,
    });
  }

  // Sort by concentration ratio descending, then by open count descending.
  stations.sort((a, b) => {
    const diff = b.concentrationRatio - a.concentrationRatio;
    if (Math.abs(diff) > 1e-10) return diff;
    return b.openIssueCount - a.openIssueCount;
  });

  return stations;
}

// ── Proposal Generator ──────────────────────────────────────────────────────

/** Configuration for the Kaizen Advisor. */
export interface KaizenAdvisorConfig {
  /** Agent name to use in proposal_id (default "META-KAIZEN"). */
  readonly agentName: string;
}

/**
 * Generate ONE structured architecture proposal for the station with the
 * highest failure concentration. Incorporates drift data when available.
 */
export function generateProposal(
  issues: KnownIssue[],
  driftState: DriftDetectorState | null,
  config?: Partial<KaizenAdvisorConfig>,
): KaizenProposal | null {
  const cfg: KaizenAdvisorConfig = {
    agentName: config?.agentName ?? "META-KAIZEN",
  };

  const stations = computeStationFailures(issues);

  // Select the station with the highest concentration ratio.
  const openStations = stations.filter((s) => s.openIssueCount > 0);
  const selected = openStations[0];
  if (!selected) return null;

  // Build evidence block.
  const primaryFailure = selected.issues[0]?.description ?? "No description available";
  const driftAnomaly = driftState?.anomalyActive ?? false;
  const driftDelta = driftState?.driftDelta?.toFixed(4) ?? "N/A";
  const baselineMean = driftState?.baselineMean.toFixed(4) ?? "N/A";
  const driftNote = driftAnomaly
    ? `Drift anomaly ACTIVE (delta ${driftDelta}, baseline ${baselineMean}). `
    : "";

  // Generate the proposal XML.
  const now = Date.now();
  const timestamp10min = Math.floor(now / 600_000) * 600_000; // 10-minute bucket
  const random4 = Math.floor(Math.random() * 10000).toString(36).padStart(4, "0");
  const proposalId = `PROP-${cfg.agentName}-${String(timestamp10min)}-${random4}`;

  // Determine change_type based on the issues.
  const allOpen = selected.issues;
  const hasCritical = allOpen.some((i) => i.severity === "CRITICAL");
  const hasHigh = allOpen.some((i) => i.severity === "HIGH");
  const changeType = hasCritical ? "hotfix" : hasHigh ? "hardening" : "refinement";

  // Determine risk_level.
  const riskLevel = hasCritical ? "high" : hasHigh ? "medium" : "low";

  // Build issue summary.
  const issueList = allOpen.map((i) => `  - ${i.id} [${i.severity}]: ${i.description}`).join("\n");

  const xml = [
    "<architecture_proposal>",
    `  <file>${selected.station}</file>`,
    `  <change>${changeType}</change>`,
    `  <payload>`,
    `Station ${selected.station} has the highest failure concentration (${(selected.concentrationRatio * 100).toFixed(0)}%, ${String(selected.openIssueCount)} open issues out of ${String(selected.totalIssueCount)} total). ${driftNote}The following issues require immediate resolution:`,
    issueList,
    ``,
    `Proposal ID: ${proposalId}`,
    `Source: obs_aggregate`,
    `Change type: ${changeType}`,
    ``,
    `Evidence:`,
    `  - primary_failure: ${primaryFailure}`,
    `  - concentration_ratio: ${selected.concentrationRatio.toFixed(3)}`,
    `  - open_issues: ${String(selected.openIssueCount)}`,
    `  - drift_anomaly: ${String(driftAnomaly)}`,
    ``,
    `Expected impact:`,
    `  - risk_level: ${riskLevel}`,
    `  - reversibility: high (changes are additive, no existing code modified)`,
    `  - regression_risk: low (existing tests unaffected)`,
    `  </payload>`,
    "</architecture_proposal>",
  ].join("\n");

  return {
    xml,
    selectedStation: selected.station,
    evidence: {
      primaryFailure,
      concentrationRatio: selected.concentrationRatio,
      openIssues: selected.openIssueCount,
      driftAnomaly,
    },
  };
}

/**
 * Full Kaizen Advisor: parse KNOWN_ISSUES.md, analyze stations,
 * and generate a proposal if there are open issues.
 */
export function runKaizenAdvisor(
  knownIssuesMarkdown: string,
  driftState: DriftDetectorState | null,
  config?: Partial<KaizenAdvisorConfig>,
): KaizenProposal | null {
  const issues = parseKnownIssues(knownIssuesMarkdown);
  return generateProposal(issues, driftState, config);
}
