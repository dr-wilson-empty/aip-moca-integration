/**
 * MCP-to-AIP Bridge — Import an MCP server as an AIP agent.
 *
 * Connects to an MCP server, discovers tools, and creates
 * a hosted agent where each MCP tool becomes an AIP capability.
 *
 * The bridge agent uses AI to convert text-based AIP task input
 * into structured MCP tool arguments, then calls the tool and
 * returns the result as an AIP artifact.
 */

import { testMcpConnection } from "./client-manager";
import type { McpServerConfig, McpToolInfo } from "./types";

export interface BridgeImportRequest {
  /** MCP server URL */
  url: string;
  /** Display name for the server */
  serverName: string;
  /** Owner's Solana wallet address */
  ownerAddress: string;
  /** Agent ID (auto-generated if not provided) */
  agentId?: string;
  /** USDC pricing per tool (toolName → price). If not provided, defaults to 0.10 */
  pricing?: Record<string, string>;
  /** Optional auth headers for the MCP server */
  headers?: Record<string, string>;
}

export interface BridgeImportResult {
  ok: boolean;
  agentId: string;
  discoveredTools: McpToolInfo[];
  capabilities: Array<{ id: string; description: string; amount: string }>;
  systemPrompt: string;
  mcpServerConfig: McpServerConfig;
  error?: string;
}

const DEFAULT_PRICE = "0.10";

/**
 * Discover tools from an MCP server and prepare the bridge agent config.
 * Does NOT register the agent — returns the config for the caller to register.
 */
export async function prepareBridgeImport(
  request: BridgeImportRequest
): Promise<BridgeImportResult> {
  const mcpConfig: McpServerConfig = {
    name: request.serverName,
    url: request.url,
    headers: request.headers,
  };

  // Test connection and discover tools
  const testResult = await testMcpConnection(mcpConfig);

  if (!testResult.ok || testResult.tools.length === 0) {
    return {
      ok: false,
      agentId: "",
      discoveredTools: [],
      capabilities: [],
      systemPrompt: "",
      mcpServerConfig: mcpConfig,
      error: testResult.error || "No tools discovered from MCP server",
    };
  }

  // Generate agent ID from server name
  const agentId = request.agentId || `mcp-${request.serverName.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 24)}`;

  // Map each MCP tool to an AIP capability
  const capabilities = testResult.tools.map((tool) => ({
    id: `mcp.${tool.name}`,
    description: sanitizeForCapability(tool.description || tool.name),
    amount: request.pricing?.[tool.name] || DEFAULT_PRICE,
  }));

  // Generate system prompt that instructs the AI to use the MCP tools
  const toolList = testResult.tools
    .map((t) => `- ${t.name}: ${t.description || "No description"}`)
    .join("\n");

  const systemPrompt =
    `You are a bridge agent that provides access to external tools via MCP.\n\n` +
    `Available tools:\n${toolList}\n\n` +
    `When you receive a task:\n` +
    `1. Identify which tool best matches the request\n` +
    `2. Extract the required parameters from the user's input\n` +
    `3. Call the tool with the correct arguments\n` +
    `4. Return the tool's result clearly formatted\n\n` +
    `Always use the tools — do not answer from your own knowledge.\n` +
    `If no tool matches the request, say so clearly.`;

  return {
    ok: true,
    agentId,
    discoveredTools: testResult.tools,
    capabilities,
    systemPrompt,
    mcpServerConfig: mcpConfig,
  };
}

function sanitizeForCapability(desc: string): string {
  return desc
    .replace(/[<>]/g, "")
    .slice(0, 200)
    .trim() || "MCP Tool";
}
