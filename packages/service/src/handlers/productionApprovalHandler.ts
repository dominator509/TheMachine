import type {
  ProductionApproval,
  ProductionApprovalResponse,
} from "../contracts/productionApproval.js";
import { productionApprovalMissingItems } from "../contracts/productionApproval.js";

export interface ProductionApprovalHandler {
  get(): ProductionApprovalResponse;
  record(approval: ProductionApproval): ProductionApprovalResponse;
  clear(): ProductionApprovalResponse;
}

export function createProductionApprovalHandler(
  initialApproval: ProductionApproval | null = null,
): ProductionApprovalHandler {
  let approval = initialApproval;

  function response(): ProductionApprovalResponse {
    const missing = productionApprovalMissingItems(approval);
    return {
      approval,
      accepted: missing.length === 0,
      missing,
    };
  }

  return {
    get: response,
    record(nextApproval: ProductionApproval): ProductionApprovalResponse {
      approval = nextApproval;
      return response();
    },
    clear(): ProductionApprovalResponse {
      approval = null;
      return response();
    },
  };
}
