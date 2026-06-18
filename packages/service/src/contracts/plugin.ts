// Plugin manifest schemas.

import type { EntityId, SemVer } from "@the-machine/core";

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
}

export interface PluginListResponse {
  readonly plugins: PluginResponse[];
}
