// Desktop shell — Active plan UI, settings UI, readiness/diagnostics, and service client wiring.
// Modules are exported for testing and future React/Tauri integration.

export const DESKTOP_PLATFORM = "Tauri 2";

export type {
  PlanStatusDisplay,
  MilestoneDisplay,
  RunDisplay,
  ValidationDisplay,
  StopConditionDisplay,
} from "./planUI.js";

export {
  buildMilestoneDisplay,
  buildPlanStatusDisplay,
  buildRunDisplay,
  buildValidationPanelDisplay,
  buildStopConditionDisplay,
  formatMilestoneList,
  formatProgressBar,
  formatValidationPanel,
  formatPlanStatus,
} from "./planUI.js";

export type {
  SettingsFormField,
  ProviderSettingsDisplay,
  MCPSettingsDisplay,
  PluginSettingsDisplay,
  PermissionDenialDisplay,
  SettingsValidationError,
} from "./settingsUI.js";

export {
  validateEndpoint,
  validateTransportType,
  validateModelNames,
  validateTimeout,
  validateEntryPoint,
  redactSecret,
  buildFormField,
  buildProviderSettingsDisplay,
  buildMCPSettingsDisplay,
  buildPluginSettingsDisplay,
  buildPermissionDenialDisplay,
  deriveProviderPermission,
  deriveMCPPermission,
  derivePluginPermission,
  formatFormField,
  formatProviderSettings,
  formatMCPSettings,
  formatPluginSettings,
  formatPermissionDenial,
} from "./settingsUI.js";

export type {
  ReadinessReportDisplay,
  ReadinessGateDisplay,
  DiagnosticsReportDisplay,
  RedactedExportResult,
} from "./readinessUI.js";

export {
  buildReadinessReport,
  buildDiagnosticsReport,
  redactExport,
  formatReadinessReport,
  formatDiagnosticsReport,
  formatRedactedExport,
  formatAsJSON,
} from "./readinessUI.js";
