import type { PluginRequest, PluginResponse, PluginListResponse } from "../contracts/plugin.js";
import type { ReleaseDecision } from "../contracts/releaseDecision.js";
import type { EntityId, SemVer } from "@the-machine/core";

export interface PluginHandler {
  get(req: PluginRequest): PluginResponse | null;
  list(): PluginListResponse;
  register(
    id: EntityId,
    name: string,
    version: SemVer,
    entryPoint: string,
    permissionCount: number,
    releaseDecision?: ReleaseDecision,
  ): PluginResponse;
  acceptRelease(pluginId: EntityId, decision: ReleaseDecision): PluginResponse | null;
}

export function createPluginHandler(): PluginHandler {
  const plugins = new Map<string, PluginResponse>();

  return {
    get(req: PluginRequest): PluginResponse | null {
      if (req.pluginId) return plugins.get(req.pluginId) ?? null;
      const all = Array.from(plugins.values());
      return all[0] ?? null;
    },

    list(): PluginListResponse {
      return { plugins: Array.from(plugins.values()) };
    },

    register(
      id: EntityId,
      name: string,
      version: SemVer,
      entryPoint: string,
      permissionCount: number,
      releaseDecision?: ReleaseDecision,
    ): PluginResponse {
      const plugin: PluginResponse = {
        id,
        name,
        version,
        entryPoint,
        permissionCount,
        enabled: true,
        ...(releaseDecision ? { releaseDecision } : {}),
      };
      plugins.set(id, plugin);
      return plugin;
    },

    acceptRelease(pluginId: EntityId, decision: ReleaseDecision): PluginResponse | null {
      const plugin = plugins.get(pluginId);
      if (!plugin) return null;
      const updated: PluginResponse = { ...plugin, releaseDecision: decision };
      plugins.set(pluginId, updated);
      return updated;
    },
  };
}
