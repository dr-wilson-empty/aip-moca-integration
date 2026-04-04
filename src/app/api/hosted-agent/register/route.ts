import { NextRequest, NextResponse } from "next/server";
import {
  registerHostedAgent,
  getHostedAgentsByOwner,
  getHostedAgent,
  updateHostedAgent,
  deleteHostedAgent,
  type HostedAgentConfig,
  type AIProvider,
  type AITier,
} from "@/lib/hosted-agents";
import { registerCard } from "@/lib/protocol/agent-card-store";
import type { AgentCard } from "@/types/aip";

/**
 * POST /api/hosted-agent/register
 * Register a new hosted agent config from the no-code builder.
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    agentId,
    ownerAddress,
    name,
    description,
    systemPrompt,
    tier,
    provider,
    customApiKey,
    capabilities,
  } = body as {
    agentId?: string;
    ownerAddress?: string;
    name?: string;
    description?: string;
    systemPrompt?: string;
    tier?: AITier;
    provider?: AIProvider;
    customApiKey?: string;
    capabilities?: HostedAgentConfig["capabilities"];
  };

  // Validation
  if (!agentId || !ownerAddress || !name || !systemPrompt || !capabilities?.length) {
    return NextResponse.json(
      { error: "Missing required fields: agentId, ownerAddress, name, systemPrompt, capabilities" },
      { status: 400 }
    );
  }

  if (agentId.length > 32 || !/^[a-z0-9-]+$/.test(agentId)) {
    return NextResponse.json(
      { error: "agentId must be lowercase alphanumeric with hyphens, max 32 chars" },
      { status: 400 }
    );
  }

  // Check if already exists
  if (getHostedAgent(agentId)) {
    return NextResponse.json(
      { error: "Agent ID already taken" },
      { status: 409 }
    );
  }

  // Tier validation
  const resolvedTier: AITier = tier || "platform";
  const resolvedProvider: AIProvider = provider || "anthropic";

  if (resolvedTier === "custom" && !customApiKey) {
    return NextResponse.json(
      { error: "Custom tier requires an API key" },
      { status: 400 }
    );
  }

  if (resolvedProvider === "openai" && resolvedTier !== "custom") {
    return NextResponse.json(
      { error: "OpenAI requires your own API key (custom tier)" },
      { status: 400 }
    );
  }

  // Build hosted agent config
  const config: HostedAgentConfig = {
    agentId,
    ownerAddress,
    name,
    description: description || "",
    systemPrompt,
    tier: resolvedTier,
    provider: resolvedProvider,
    customApiKey: resolvedTier === "custom" ? customApiKey : undefined,
    capabilities,
    createdAt: new Date().toISOString(),
    active: true,
  };

  registerHostedAgent(config);

  // Also register in agent-card-store for marketplace visibility
  const hostedEndpoint = `${getBaseUrl(request)}/api/hosted-agent?agentId=${agentId}`;
  const agentCard: AgentCard = {
    did: `did:aip:hosted:${agentId}`,
    name,
    version: "1.0.0",
    endpoint: hostedEndpoint,
    type: "Task",
    capabilities: capabilities.map((c) => ({
      id: c.id,
      description: c.description,
      pricing: {
        amount: c.pricing.amount,
        token: "USDC" as const,
        network: "solana" as const,
      },
    })),
    walletAddress: ownerAddress,
  };

  registerCard(agentCard);

  return NextResponse.json(
    {
      ok: true,
      agentId,
      endpoint: hostedEndpoint,
      did: agentCard.did,
    },
    { status: 201 }
  );
}

/**
 * GET /api/hosted-agent/register?owner=xxx
 * List hosted agents for an owner.
 */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner query param required" }, { status: 400 });
  }

  const agents = getHostedAgentsByOwner(owner);
  return NextResponse.json({ agents });
}

/**
 * PATCH /api/hosted-agent/register
 * Update a hosted agent.
 */
export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentId, ownerAddress, ...updates } = body as {
    agentId?: string;
    ownerAddress?: string;
    [key: string]: unknown;
  };

  if (!agentId || !ownerAddress) {
    return NextResponse.json({ error: "agentId and ownerAddress required" }, { status: 400 });
  }

  const existing = getHostedAgent(agentId);
  if (!existing || existing.ownerAddress !== ownerAddress) {
    return NextResponse.json({ error: "Agent not found or not owned by you" }, { status: 404 });
  }

  updateHostedAgent(agentId, updates as Partial<HostedAgentConfig>);
  return NextResponse.json({ ok: true, agentId });
}

/**
 * DELETE /api/hosted-agent/register
 * Deactivate a hosted agent.
 */
export async function DELETE(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("agentId");
  const owner = request.nextUrl.searchParams.get("owner");

  if (!agentId || !owner) {
    return NextResponse.json({ error: "agentId and owner required" }, { status: 400 });
  }

  const existing = getHostedAgent(agentId);
  if (!existing || existing.ownerAddress !== owner) {
    return NextResponse.json({ error: "Agent not found or not owned by you" }, { status: 404 });
  }

  deleteHostedAgent(agentId);
  return NextResponse.json({ ok: true, agentId });
}

function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || "http";
  const host = request.headers.get("host") || "localhost:3000";
  return `${proto}://${host}`;
}
