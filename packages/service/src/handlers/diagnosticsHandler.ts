// Diagnostic export handler — creates redacted diagnostic bundles.

import { exportDiagnosticBundle } from "@the-machine/observability";
import type { DiagnosticRequest, DiagnosticResponse } from "../contracts/diagnostics.js";

export interface DiagnosticHandler {
  export(req: DiagnosticRequest): DiagnosticResponse;
}

export function createDiagnosticHandler(
  platform: string,
  version: string,
  startTime: number,
): DiagnosticHandler {
  return {
    export(req: DiagnosticRequest): DiagnosticResponse {
      const bundle = exportDiagnosticBundle(
        {
          platform,
          version,
          startTime,
          nodeVersion: process.versions.node,
          platformArch: `${process.platform}/${process.arch}`,
          osInfo: `${process.platform} ${process.arch} ${process.release.name}`,
          providerCount: 0,
          mcpServerCount: 0,
          pluginCount: 0,
        },
        req.includeExtra ? req.extraData : undefined,
      );

      return {
        generatedAt: bundle.generatedAt,
        platform: bundle.platform,
        version: bundle.version,
        uptimeMs: bundle.uptimeMs,
        nodeVersion: bundle.nodeVersion,
        platformArch: bundle.platformArch,
        osInfo: bundle.osInfo,
        redactionApplied: bundle.redactionApplied,
        sections: bundle.sections,
      };
    },
  };
}
