import { NextRequest, NextResponse } from "next/server";
import { fetchAllOnChainAgents } from "@/lib/solana/registry-program";
import { getCardByDid } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

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
      return NextResponse.json({ ...onChain, source: "on-chain" });
    }
  } catch { /* fallback to in-memory */ }

  // Fallback to in-memory
  const card = getCardByDid(did);
  if (card) {
    return NextResponse.json({ ...card, onChain: false, source: "memory" });
  }

  return NextResponse.json({ error: "Agent not found" }, { status: 404 });
}
