/**
 * MCP Integration Types
 *
 * Defines the configuration and runtime types for MCP server connections.
 * MCP is entirely optional — agents without mcpServers work unchanged.
 */

/** MCP server configuration stored per hosted agent */
export interface McpServerConfig {
  /** Display name (user-assigned) */
  name: string;
  /** Streamable HTTP endpoint URL (only transport supported in production) */
  url: string;
  /** Optional auth headers (e.g. Bearer token) — encrypted at rest */
  headers?: Record<string, string>;
}

/** Cached tool definition from an MCP server */
export interface McpToolInfo {
  /** Tool name as declared by the MCP server */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for tool input parameters */
  inputSchema: Record<string, unknown>;
  /** Which MCP server this tool came from */
  serverName: string;
}

/** Result of calling an MCP tool */
export interface McpToolResult {
  success: boolean;
  content: string;
  isError: boolean;
  errorCode?: "TIMEOUT" | "CONNECTION_ERROR" | "TOOL_ERROR" | "SIZE_LIMIT";
  errorMessage?: string;
  retryable?: boolean;
}

/** Connection state for a single MCP server */
export type McpConnectionState = "disconnected" | "connecting" | "connected" | "error";

/** Runtime info for a connected MCP server */
export interface McpServerConnection {
  config: McpServerConfig;
  state: McpConnectionState;
  tools: McpToolInfo[];
  lastConnected?: number;
  lastError?: string;
}
