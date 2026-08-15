// Local API/IPC boundary service.
import { createDefaultClient } from "./client/index.js";
import type { ClientFactoryOptions, ServiceClient } from "./client/index.js";

export * from "./contracts/index.js";
export * from "./handlers/index.js";
export * from "./client/index.js";
export * from "./persistence/store.js";
export {
  startGuiServer,
  stopGuiServer,
  getSseClientCount,
  listThemes,
  loadTheme,
} from "./gui/index.js";
export type { GuiServerConfig, ThemeManifest } from "./gui/index.js";

export function createService(opts: ClientFactoryOptions = {}): ServiceClient {
  return createDefaultClient(opts);
}
