import {
  getGuiServerConfig as getInternalGuiServerConfig,
  getGuiServerAccess,
  getSseClientCount,
  startGuiServer,
  stopGuiServer,
} from "./pipelineServer.js";
import type { GuiServerConfig } from "./pipelineServer.js";

export { startGuiServer, stopGuiServer, getSseClientCount, getGuiServerAccess };
export type { GuiServerConfig, GuiServerAccess } from "./pipelineServer.js";
export { listThemes, loadTheme } from "./themes/index.js";
export type { ThemeManifest } from "./themes/index.js";

export type PublicGuiServerConfig = Omit<GuiServerConfig, "viewerToken" | "eventToken">;

/**
 * Return only non-secret runtime configuration. Viewer and event-producer
 * capabilities are available solely through getGuiServerAccess() to the
 * supervising process and are never reflected through this metadata API.
 */
export function getGuiServerConfig(): PublicGuiServerConfig | null {
  const config = getInternalGuiServerConfig();
  if (!config) return null;
  return {
    port: config.port,
    host: config.host,
    themeAssetsDir: config.themeAssetsDir,
    dashboardPath: config.dashboardPath,
    builderPath: config.builderPath,
    maxBodyBytes: config.maxBodyBytes,
    allowRemote: config.allowRemote,
  };
}
