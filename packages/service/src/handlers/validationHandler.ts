import type {
  ValidationRequest,
  ValidationResponse,
  ValidationListResponse,
} from "../contracts/validation.js";
import type { EntityId, Severity } from "@the-machine/core";
import type { ServiceStore } from "../persistence/store.js";

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

export function createValidationHandler(store?: ServiceStore): ValidationHandler {
  const validations = new Map<string, ValidationResponse[]>();

  return {
    record(
      req: ValidationRequest,
      passed: boolean,
      exitCode: number | null,
      output: string,
      severity: Severity,
    ): ValidationResponse {
      if (store) {
        return store.recordValidation(req.runId, req.command, passed, exitCode, output, severity);
      }
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
      if (store) return { validations: store.listValidations(runId) };
      return { validations: validations.get(runId) ?? [] };
    },
  };
}
