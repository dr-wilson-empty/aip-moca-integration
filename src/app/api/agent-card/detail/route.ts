import { NextRequest, NextResponse } from "next/server";
import { fetchAllOnChainAgents } from "@/lib/solana/registry-program";
import { getCardByDid, normalizeEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { getHostedAgent, loadHostedAgentsFromDb } from "@/lib/hosted-agents";

seedDemoAgents();

/**
 * GET /api/agent-card/detail?did=xxx
 * Returns full agent detail with on-chain metadata.
 */
export async function GET(request: NextRequest) {
  seedDemoAgents();
  const did = request.nextUrl.searchParams.get("did");
  if (!did) {
    return NextResponse.json({ error: "did required" }, { status: 400 });
  }

  // Try on-chain first
  try {
    const onChainAgents = await fetchAllOnChainAgents();
    const onChain = onChainAgents.find((a) => a.did === did);
    if (onChain) {
      // Enrich with hosted agent description
      await loadHostedAgentsFromDb();
      const normalizedEndpoint = normalizeEndpoint(onChain.endpoint);
      const onChainMatch = normalizedEndpoint.match(/[?&]agentId=([^&]+)/)
        || did.match(/:([^:]+)$/);
      const agentId = onChainMatch?.[1];
      const hostedInfo = agentId ? getHostedAgent(agentId) : null;
      return NextResponse.json({ ...onChain, endpoint: normalizedEndpoint, description: hostedInfo?.description || undefined, source: "on-chain" });
    }
  } catch { /* fallback to in-memory */ }

  // Fallback to in-memory
  const card = getCardByDid(did);
  if (card) {
    // Enrich with hosted agent description if available
    await loadHostedAgentsFromDb();
    const match = card.endpoint.match(/[?&]agentId=([^&]+)/);
    const hosted = match ? getHostedAgent(match[1]) : null;
    const description = card.description || hosted?.description || undefined;
    return NextResponse.json({ ...card, description, onChain: false, source: "memory" });
  }

  return NextResponse.json({ error: "Agent not found" }, { status: 404 });
}
