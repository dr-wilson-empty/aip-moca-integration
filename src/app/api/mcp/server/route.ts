import { NextRequest, NextResponse } from "next/server";
import { getHostedAgent, loadHostedAgentsFromDb } from "@/lib/hosted-agents";
import { handleMcpRequest } from "@/lib/mcp/mcp-server";
import { executeHostedAgentDirect } from "@/lib/hosted-agent-executor";

/**
 * POST /api/mcp/server?agentId=xxx
 *
 * MCP-compatible endpoint for AIP agents.
 * Accepts JSON-RPC 2.0 MCP protocol messages (initialize, tools/list, tools/call).
 *
 * External MCP clients (Claude Desktop, Cursor, etc.) can connect to this
 * endpoint to use AIP agents as MCP tools.
 *
 * Usage:
 *   MCP client connects to: https://your-domain.com/api/mcp/server?agentId=my-agent
 */
export async function POST(request: NextRequest) {
  await loadHostedAgentsFromDb();

  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: 0, error: { code: -32600, message: "agentId query param required" } }
    );
  }

  const config = getHostedAgent(agentId);
  if (!config || !config.active) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: 0, error: { code: -32600, message: "Agent not found or inactive" } }
    );
  }

  let body: { jsonrpc: string; id: string | number; method: string; params?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: 0, error: { code: -32700, message: "Parse error" } }
    );
  }

  if (body.jsonrpc !== "2.0" || !body.method) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: body.id ?? 0, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } }
    );
  }

  const response = await handleMcpRequest(
    config,
    { jsonrpc: "2.0", id: body.id, method: body.method, params: body.params },
    executeHostedAgentDirect,
  );

  return NextResponse.json(response);
}

/**
 * GET /api/mcp/server?agentId=xxx
 *
 * Returns agent info for MCP client discovery.
 */
export async function GET(request: NextRequest) {
  await loadHostedAgentsFromDb();

  const agentId = request.nextUrl.searchParams.get("agentId");
  if (!agentId) {
    return NextResponse.json({ error: "agentId required" }, { status: 400 });
  }

  const config = getHostedAgent(agentId);
  if (!config || !config.active) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  return NextResponse.json({
    name: config.name,
    version: "1.0.0",
    description: config.description,
    protocol: "mcp",
    transport: "streamable-http",
    tools: config.capabilities.map((c) => ({
      name: c.id,
      description: c.description,
      price: `${c.pricing.amount} USDC`,
    })),
  });
}
