import type {
  ValidationRequest,
  ValidationResponse,
  ValidationListResponse,
} from "../contracts/validation.js";
import type { EntityId, Severity } from "@the-machine/core";

export interface ValidationHandler {
  record(
    req: ValidationRequest,
    passed: boolean,
    exitCode: number | null,
    output: string,
    severity: Severity,
  ): ValidationResponse;
  list(runId: EntityId): ValidationListResponse;
}

export function createValidationHandler(): ValidationHandler {
  const validations = new Map<string, ValidationResponse[]>();

  return {
    record(
      req: ValidationRequest,
      passed: boolean,
      exitCode: number | null,
      output: string,
      severity: Severity,
    ): ValidationResponse {
      const result: ValidationResponse = {
        runId: req.runId,
        command: req.command,
        passed,
        exitCode,
        output,
        severity,
      };
      const list = validations.get(req.runId) ?? [];
      list.push(result);
      validations.set(req.runId, list);
      return result;
    },

    list(runId: EntityId): ValidationListResponse {
      return { validations: validations.get(runId) ?? [] };
    },
  };
}
