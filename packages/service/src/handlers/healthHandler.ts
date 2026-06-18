import type { HealthRequest, HealthResponse } from "../contracts/health.js";
import { performHealthChecks } from "@the-machine/observability";

export interface HealthHandler {
  check(req: HealthRequest): HealthResponse;
}

export function createHealthHandler(
  platform: string,
  version: string,
  startTime: number,
): HealthHandler {
  return {
    check(req: HealthRequest): HealthResponse {
      const summary = performHealthChecks({
        platform,
        version,
        startTime,
        ...(req.detail ? { logDir: "/tmp/the-machine/logs" } : {}),
        providerCount: 0,
        mcpServerCount: 0,
        pluginCount: 0,
      });
      return {
        status: summary.status,
        platform: summary.platform,
        version: summary.version,
        uptimeMs: summary.uptimeMs,
        checks: summary.checks,
      };
    },
  };
}
