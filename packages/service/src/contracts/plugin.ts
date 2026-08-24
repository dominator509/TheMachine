// Plugin manifest schemas.

import type { EntityId, SemVer } from "@the-machine/core";
import type { ReleaseDecision } from "./releaseDecision.js";

export interface PluginRequest {
  readonly workspaceId: EntityId;
  readonly pluginId?: EntityId;
}

export interface PluginResponse {
  readonly id: EntityId;
  readonly name: string;
  readonly version: SemVer;
  readonly entryPoint: string;
  readonly permissionCount: number;
  readonly enabled: boolean;
  readonly activationCheckedAt?: string;
  readonly activationEvidence?: string;
  readonly releaseDecision?: ReleaseDecision;
}

export interface PluginListResponse {
  readonly plugins: PluginResponse[];
}
