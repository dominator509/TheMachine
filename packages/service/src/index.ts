// Local API/IPC boundary service.
export * from "./contracts/index.js";
export * from "./handlers/index.js";
export * from "./client/index.js";
export * from "./persistence/store.js";
export { startGuiServer, stopGuiServer, getSseClientCount, listThemes, loadTheme } from "./gui/index.js";
export type { GuiServerConfig, ThemeManifest } from "./gui/index.js";

export function createService(): void {
  // Placeholder — implementation in future EP
}
