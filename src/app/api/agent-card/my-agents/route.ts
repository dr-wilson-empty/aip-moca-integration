import { NextRequest, NextResponse } from "next/server";
import { fetchAgentsByOwner } from "@/lib/solana/registry-program";

/**
 * GET /api/agent-card/my-agents?owner=<pubkey>
 * Returns all on-chain agents owned by a specific wallet.
 */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner query parameter required" }, { status: 400 });
  }

  try {
    const agents = await fetchAgentsByOwner(owner);
    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch agents" },
      { status: 500 }
    );
  }
}
