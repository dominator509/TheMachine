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
  recordActivation(
    pluginId: EntityId,
    enabled: boolean,
    evidence: string,
    checkedAt?: string,
  ): PluginResponse | null;
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
        enabled: false,
        ...(releaseDecision ? { releaseDecision } : {}),
      };
      plugins.set(id, plugin);
      return plugin;
    },

    recordActivation(pluginId, enabled, evidence, checkedAt): PluginResponse | null {
      const plugin = plugins.get(pluginId);
      if (!plugin) return null;
      if (evidence.trim().length === 0) {
        throw new Error("Plugin activation evidence must not be empty.");
      }
      const updated: PluginResponse = {
        ...plugin,
        enabled,
        activationCheckedAt: checkedAt ?? new Date().toISOString(),
        activationEvidence: evidence,
      };
      plugins.set(pluginId, updated);
      return updated;
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
