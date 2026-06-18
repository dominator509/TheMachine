// Validation result schemas.

import type { EntityId, Severity } from "@the-machine/core";

export interface ValidationRequest {
  readonly runId: EntityId;
  readonly command: string;
}

export interface ValidationResponse {
  readonly runId: EntityId;
  readonly command: string;
  readonly passed: boolean;
  readonly exitCode: number | null;
  readonly output: string;
  readonly severity: Severity;
}

export interface ValidationListResponse {
  readonly validations: ValidationResponse[];
}
