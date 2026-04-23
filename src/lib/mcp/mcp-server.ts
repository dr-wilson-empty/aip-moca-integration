/**
 * AIP-to-MCP Bridge — Expose AIP agents as MCP-compatible servers.
 *
 * Handles JSON-RPC 2.0 MCP protocol messages:
 * - initialize: Capability negotiation
 * - tools/list: Returns agent capabilities as MCP tools
 * - tools/call: Executes AIP task and returns result
 *
 * This allows external MCP clients (Claude Desktop, Cursor, etc.)
 * to use AIP agents as MCP tools.
 */

import type { HostedAgentConfig } from "@/lib/hosted-agents";

interface McpJsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpJsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Handle an MCP protocol request for a hosted agent.
 * Returns the JSON-RPC response object.
 */
export async function handleMcpRequest(
  config: HostedAgentConfig,
  request: McpJsonRpcRequest,
  executeTask: (config: HostedAgentConfig, input: string) => Promise<{ status: string; artifact?: string; error?: string }>,
): Promise<McpJsonRpcResponse> {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: {
            tools: { listChanged: false },
          },
          serverInfo: {
            name: config.name,
            version: "1.0.0",
          },
          instructions: config.systemPrompt.slice(0, 500),
        },
      };

    case "notifications/initialized":
      // Client acknowledged initialization — no response needed for notifications
      // But since we're in HTTP request/response, return empty result
      return { jsonrpc: "2.0", id: request.id, result: {} };

    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id,
        result: {
          tools: config.capabilities.map((cap) => ({
            name: cap.id,
            description: `${cap.description} (${cap.pricing.amount} USDC)`,
            inputSchema: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "Task input text",
                },
              },
              required: ["input"],
            },
          })),
        },
      };

    case "tools/call": {
      const toolName = request.params?.name as string;
      const args = request.params?.arguments as Record<string, unknown> | undefined;

      if (!toolName) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: "Missing tool name" },
        };
      }

      // Verify tool exists
      const cap = config.capabilities.find((c) => c.id === toolName);
      if (!cap) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          error: { code: -32602, message: `Unknown tool: ${toolName}` },
        };
      }

      // Extract input from arguments
      const input = (args?.input as string) || JSON.stringify(args || {});

      try {
        const result = await executeTask(config, input);

        if (result.status === "COMPLETED" && result.artifact) {
          return {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              content: [{ type: "text", text: result.artifact }],
              isError: false,
            },
          };
        }

        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: result.error || "Task failed" }],
            isError: true,
          },
        };
      } catch (err) {
        return {
          jsonrpc: "2.0",
          id: request.id,
          result: {
            content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
            isError: true,
          },
        };
      }
    }

    case "ping":
      return { jsonrpc: "2.0", id: request.id, result: {} };

    default:
      return {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32601, message: `Method not found: ${request.method}` },
      };
  }
}
