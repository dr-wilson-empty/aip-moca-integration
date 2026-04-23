/**
 * MCP Client Manager — Lazy connection pool for Streamable HTTP MCP servers.
 *
 * - Connects to MCP servers only when a task needs them (lazy)
 * - Caches discovered tools per server
 * - Disconnects after idle timeout
 * - Only Streamable HTTP transport (production-safe for Railway)
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { McpServerConfig, McpToolInfo, McpToolResult, McpServerConnection } from "./types";

const MCP_TOOL_TIMEOUT = parseInt(process.env.MCP_TOOL_TIMEOUT || "30000", 10);
const MCP_IDLE_TIMEOUT = parseInt(process.env.MCP_IDLE_TIMEOUT || "60000", 10);
const MCP_MAX_RESULT_SIZE = 100 * 1024; // 100KB

interface ManagedConnection {
  client: Client;
  transport: StreamableHTTPClientTransport;
  tools: McpToolInfo[];
  serverName: string;
  idleTimer: ReturnType<typeof setTimeout> | null;
  state: McpServerConnection["state"];
  lastError?: string;
}

/* ------------------------------------------------------------------ */
/*  Connection pool — keyed by server URL                              */
/* ------------------------------------------------------------------ */

const g = globalThis as typeof globalThis & {
  __aip_mcp_pool?: Map<string, ManagedConnection>;
};
if (!g.__aip_mcp_pool) g.__aip_mcp_pool = new Map();

const pool = g.__aip_mcp_pool;

/* ------------------------------------------------------------------ */
/*  Private helpers                                                     */
/* ------------------------------------------------------------------ */

function resetIdleTimer(key: string): void {
  const conn = pool.get(key);
  if (!conn) return;
  if (conn.idleTimer) clearTimeout(conn.idleTimer);
  conn.idleTimer = setTimeout(() => {
    disconnectServer(key).catch(() => {});
  }, MCP_IDLE_TIMEOUT);
}

async function connectServer(config: McpServerConfig): Promise<ManagedConnection> {
  const key = config.url;
  const existing = pool.get(key);
  if (existing && existing.state === "connected") {
    resetIdleTimer(key);
    return existing;
  }

  const transport = new StreamableHTTPClientTransport(
    new URL(config.url),
    { requestInit: config.headers ? { headers: config.headers } : undefined }
  );

  const client = new Client(
    { name: "aip-agent", version: "1.0.0" },
  );

  const conn: ManagedConnection = {
    client,
    transport,
    tools: [],
    serverName: config.name,
    idleTimer: null,
    state: "connecting",
  };
  pool.set(key, conn);

  try {
    await client.connect(transport);
    conn.state = "connected";

    // Discover tools
    const result = await client.listTools();
    conn.tools = (result.tools || []).map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: (t.inputSchema as Record<string, unknown>) || { type: "object" },
      serverName: config.name,
    }));

    resetIdleTimer(key);
    return conn;
  } catch (err) {
    conn.state = "error";
    conn.lastError = err instanceof Error ? err.message : String(err);
    pool.delete(key);
    throw err;
  }
}

async function disconnectServer(key: string): Promise<void> {
  const conn = pool.get(key);
  if (!conn) return;
  if (conn.idleTimer) clearTimeout(conn.idleTimer);
  try {
    await conn.client.close();
  } catch {
    // ignore close errors
  }
  pool.delete(key);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Connect to all MCP servers for an agent, discover tools.
 * Returns combined tool list from all servers.
 * Skips servers that fail to connect (logs error, continues).
 */
export async function connectAndDiscoverTools(
  servers: McpServerConfig[]
): Promise<McpToolInfo[]> {
  if (!servers || servers.length === 0) return [];

  const allTools: McpToolInfo[] = [];

  for (const server of servers) {
    try {
      const conn = await connectServer(server);
      allTools.push(...conn.tools);
    } catch (err) {
      console.error(`[MCP] Failed to connect to ${server.name} (${server.url}):`, err instanceof Error ? err.message : err);
      // Continue with other servers — partial connectivity is OK
    }
  }

  return allTools;
}

/**
 * Call an MCP tool by name. Finds the correct server from the pool.
 */
export async function callMcpTool(
  servers: McpServerConfig[],
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  // Find which server has this tool
  for (const server of servers) {
    const conn = pool.get(server.url);
    if (!conn || conn.state !== "connected") continue;
    const hasTool = conn.tools.some((t) => t.name === toolName);
    if (!hasTool) continue;

    resetIdleTimer(server.url);

    try {
      const resultPromise = conn.client.callTool({ name: toolName, arguments: args });

      // Timeout wrapper
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("MCP_TIMEOUT")), MCP_TOOL_TIMEOUT)
      );

      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Extract text content
      const contentParts: string[] = [];
      if (result.content && Array.isArray(result.content)) {
        for (const block of result.content) {
          if (block.type === "text" && typeof block.text === "string") {
            contentParts.push(block.text);
          }
        }
      }

      const content = contentParts.join("\n");

      // Size limit check
      if (content.length > MCP_MAX_RESULT_SIZE) {
        return {
          success: false,
          content: content.slice(0, MCP_MAX_RESULT_SIZE),
          isError: true,
          errorCode: "SIZE_LIMIT",
          errorMessage: `Tool result exceeded ${MCP_MAX_RESULT_SIZE / 1024}KB limit, truncated`,
          retryable: false,
        };
      }

      if (result.isError) {
        return {
          success: false,
          content,
          isError: true,
          errorCode: "TOOL_ERROR",
          errorMessage: content || "Tool returned an error",
          retryable: true,
        };
      }

      return { success: true, content, isError: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message === "MCP_TIMEOUT";

      return {
        success: false,
        content: "",
        isError: true,
        errorCode: isTimeout ? "TIMEOUT" : "CONNECTION_ERROR",
        errorMessage: isTimeout
          ? `Tool '${toolName}' did not respond within ${MCP_TOOL_TIMEOUT / 1000}s`
          : `Tool '${toolName}' call failed: ${message}`,
        retryable: isTimeout,
      };
    }
  }

  // Tool not found on any connected server
  return {
    success: false,
    content: "",
    isError: true,
    errorCode: "TOOL_ERROR",
    errorMessage: `Tool '${toolName}' not found on any connected MCP server`,
    retryable: false,
  };
}

/**
 * Disconnect all MCP servers for a given config set.
 * Called after task completion if no more tasks are expected soon.
 */
export async function disconnectAll(servers: McpServerConfig[]): Promise<void> {
  for (const server of servers) {
    await disconnectServer(server.url);
  }
}

/**
 * Test connectivity to an MCP server — connect, list tools, disconnect.
 * Used by UI "Test Connection" button.
 */
export async function testMcpConnection(
  config: McpServerConfig
): Promise<{ ok: boolean; tools: McpToolInfo[]; error?: string }> {
  try {
    const conn = await connectServer(config);
    const tools = [...conn.tools];
    await disconnectServer(config.url);
    return { ok: true, tools };
  } catch (err) {
    return {
      ok: false,
      tools: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Get current connection status for all servers of an agent.
 */
export function getConnectionStatus(servers: McpServerConfig[]): McpServerConnection[] {
  return servers.map((config) => {
    const conn = pool.get(config.url);
    return {
      config,
      state: conn?.state || "disconnected",
      tools: conn?.tools || [],
      lastConnected: undefined,
      lastError: conn?.lastError,
    };
  });
}
