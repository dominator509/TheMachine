import type { EntityId } from "@the-machine/core";
import type { ReleaseDecision } from "./releaseDecision.js";

export interface ProductionApproval {
  readonly workspaceId: EntityId;
  readonly providerConfiguration: ReleaseDecision;
  readonly mcpConfiguration: ReleaseDecision;
  readonly pluginSandbox: ReleaseDecision;
  readonly sharedUIScope: ReleaseDecision;
  readonly releaseDeployment: ReleaseDecision;
  readonly approvedBy: string;
  readonly approvedAt: string;
  readonly detail: string;
}

export interface ProductionApprovalResponse {
  readonly approval: ProductionApproval | null;
  readonly accepted: boolean;
  readonly missing: readonly string[];
}

export function isProductionApprovalAccepted(approval: ProductionApproval | null): boolean {
  return productionApprovalMissingItems(approval).length === 0;
}

export function productionApprovalMissingItems(
  approval: ProductionApproval | null,
): readonly string[] {
  if (!approval) {
    return [
      "providerConfiguration",
      "mcpConfiguration",
      "pluginSandbox",
      "sharedUIScope",
      "releaseDeployment",
    ];
  }

  const missing: string[] = [];
  if (approval.providerConfiguration.status !== "accepted") missing.push("providerConfiguration");
  if (approval.mcpConfiguration.status !== "accepted") missing.push("mcpConfiguration");
  if (approval.pluginSandbox.status !== "accepted") missing.push("pluginSandbox");
  if (approval.sharedUIScope.status !== "accepted") missing.push("sharedUIScope");
  if (approval.releaseDeployment.status !== "accepted") missing.push("releaseDeployment");
  if (approval.approvedBy.trim().length === 0) missing.push("approvedBy");
  if (approval.approvedAt.trim().length === 0) missing.push("approvedAt");
  return missing;
}
