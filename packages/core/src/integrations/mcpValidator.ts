// MCP server configuration validator.
// No infrastructure imports.

import type { MCPConfig } from "../domain/index.js";

/** MCP validation result. */
export interface MCPValidation {
  readonly valid: boolean;
  readonly errors: string[];
}

/** Valid transport types. */
const VALID_TRANSPORTS = ["stdio", "sse", "websocket"];

/**
 * Validates an MCP server configuration.
 */
export function validateMCPConfig(config: MCPConfig): MCPValidation {
  const errors: string[] = [];

  if (!config.id || config.id.length === 0) {
    errors.push("MCP server id is required");
  }
  if (!config.name || config.name.length === 0) {
    errors.push("MCP server name is required");
  }
  if (!VALID_TRANSPORTS.includes(config.transport)) {
    errors.push("MCP transport must be 'stdio', 'sse', or 'websocket'");
  }
  if (!config.endpoint || config.endpoint.length === 0) {
    errors.push("MCP server endpoint is required");
  }
  if (!Array.isArray(config.tools) || config.tools.length === 0) {
    errors.push("MCP server must expose at least one tool");
  }
  if (!Array.isArray(config.permissions)) {
    errors.push("MCP permissions must be an array");
  }
  if (!config.healthCheckCommand || config.healthCheckCommand.length === 0) {
    errors.push("MCP health check command is required");
  }

  return { valid: errors.length === 0, errors };
}
