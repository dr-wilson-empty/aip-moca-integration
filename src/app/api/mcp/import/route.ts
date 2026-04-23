import { NextRequest, NextResponse } from "next/server";
import { prepareBridgeImport } from "@/lib/mcp/bridge-agent";
import {
  registerHostedAgent,
  getHostedAgent,
  type HostedAgentConfig,
} from "@/lib/hosted-agents";
import { registerCard } from "@/lib/protocol/agent-card-store";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";

/**
 * POST /api/mcp/import
 * Import an MCP server as an AIP bridge agent.
 *
 * Body: {
 *   url: string,             // MCP server URL
 *   serverName: string,      // Display name
 *   ownerAddress: string,    // Solana wallet
 *   agentId?: string,        // Custom agent ID (auto-generated if omitted)
 *   pricing?: Record<string, string>,  // toolName → USDC price
 *   headers?: Record<string, string>,  // Auth headers
 *   isPublic?: boolean,
 * }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, serverName, ownerAddress, agentId, pricing, headers, isPublic } = body as {
    url?: string;
    serverName?: string;
    ownerAddress?: string;
    agentId?: string;
    pricing?: Record<string, string>;
    headers?: Record<string, string>;
    isPublic?: boolean;
  };

  if (!url || !serverName || !ownerAddress) {
    return NextResponse.json(
      { error: "url, serverName, and ownerAddress are required" },
      { status: 400 }
    );
  }

  // URL validation
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "URL must use http or https" }, { status: 400 });
    }
    if (process.env.NODE_ENV === "production") {
      const h = parsed.hostname;
      if (h === "localhost" || h === "127.0.0.1" || h.startsWith("10.") || h.startsWith("172.16.") || h.startsWith("192.168.") || h === "0.0.0.0") {
        return NextResponse.json({ error: "Private network addresses not allowed in production" }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  // Discover tools and prepare bridge config
  const result = await prepareBridgeImport({
    url,
    serverName,
    ownerAddress,
    agentId,
    pricing,
    headers,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Failed to import MCP server" },
      { status: 400 }
    );
  }

  // Check if agent ID already exists
  if (getHostedAgent(result.agentId)) {
    return NextResponse.json(
      { error: `Agent ID '${result.agentId}' already exists` },
      { status: 409 }
    );
  }

  // Create hosted agent config
  const config: HostedAgentConfig = {
    agentId: result.agentId,
    ownerAddress,
    name: `${serverName} (MCP Bridge)`,
    description: `Bridge agent for MCP server: ${serverName}. Provides ${result.discoveredTools.length} tool(s).`,
    systemPrompt: result.systemPrompt,
    tier: "platform",
    provider: "anthropic",
    capabilities: result.capabilities.map((c) => ({
      id: c.id,
      description: c.description,
      pricing: { amount: c.amount, token: "USDC", network: "solana" },
    })),
    canOrchestrate: false,
    isPublic: isPublic ?? true,
    mcpServers: [result.mcpServerConfig],
    createdAt: new Date().toISOString(),
    active: true,
  };

  await registerHostedAgent(config);

  // Register agent card for marketplace
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  const baseUrl = `${proto}://${host}`;
  const hostedEndpoint = `${baseUrl}/api/hosted-agent?agentId=${result.agentId}`;
  const did = canonicalAgentDid(ownerAddress, result.agentId);

  if (config.isPublic !== false) {
    registerCard({
      did,
      name: config.name,
      description: config.description,
      version: "1.0.0",
      endpoint: hostedEndpoint,
      type: "Task",
      walletAddress: ownerAddress,
      capabilities: config.capabilities.map((c) => ({
        id: c.id,
        description: c.description,
        pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    agentId: result.agentId,
    did,
    endpoint: hostedEndpoint,
    discoveredTools: result.discoveredTools.length,
    capabilities: result.capabilities,
  }, { status: 201 });
}
