import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { fetchAgentsByOwner, deriveAgentRecordPDA } from "@/lib/solana/registry-program";
import { getHostedAgentsByOwner } from "@/lib/hosted-agents";
import { dbGetUIRegisteredDids, dbMarkAgentUIRegistered } from "@/lib/supabase/db";
import type { MyAgentEntry, RegistrationSource, Capability } from "@/types/aip";

const AGENT_TYPE_REVERSE: Record<number, string> = { 0: "LLM", 1: "Task", 2: "Execution" };

/**
 * GET /api/agent-card/my-agents?owner=<pubkey>
 * Returns merged set of all agents owned by a wallet:
 *   - On-chain agents (UI-registered + externally registered via SDK)
 *   - Hosted agents (no-code builder)
 * Deduplicates by DID. On-chain data is source of truth.
 */
export async function GET(request: NextRequest) {
  const owner = request.nextUrl.searchParams.get("owner");
  if (!owner) {
    return NextResponse.json({ error: "owner query parameter required" }, { status: 400 });
  }

  try {
    // Fetch on-chain agents and UI-registered DIDs in parallel
    const [onChainRecords, hostedConfigs, uiRegisteredDids] = await Promise.all([
      fetchAgentsByOwner(owner),
      Promise.resolve(getHostedAgentsByOwner(owner)),
      dbGetUIRegisteredDids(owner),
    ]);

    const agents: MyAgentEntry[] = [];
    const seenDids = new Set<string>();

    // 1. On-chain agents (source of truth for identity)
    for (const record of onChainRecords) {
      let capabilities: Capability[] = [];
      try { capabilities = JSON.parse(record.capabilitiesJson); } catch { /* skip */ }

      // Determine registration source: if DID is in our UI tracking → 'ui', else → 'external'
      const source: RegistrationSource = uiRegisteredDids.has(record.did) ? "ui" : "external";

      agents.push({
        did: record.did,
        name: record.name,
        version: record.version,
        endpoint: record.endpoint,
        type: (AGENT_TYPE_REVERSE[record.agentType] ?? "Task") as MyAgentEntry["type"],
        capabilities,
        walletAddress: record.walletAddress,
        agentId: record.agentId,
        registrationSource: source,
        onChainPDA: record.pda,
        owner: record.owner,
        registeredAt: record.registeredAt,
      });
      seenDids.add(record.did);
    }

    // 2. Hosted agents (no-code builder, may or may not be on-chain)
    for (const config of hostedConfigs) {
      const hostedDid = `did:aip:hosted:${config.agentId}`;
      if (seenDids.has(hostedDid)) continue; // already covered by on-chain

      agents.push({
        did: hostedDid,
        name: config.name,
        version: "1.0.0",
        endpoint: `/api/hosted-agent?agentId=${config.agentId}`,
        type: "Task",
        capabilities: config.capabilities as Capability[],
        walletAddress: config.ownerAddress,
        agentId: config.agentId,
        registrationSource: "hosted",
        onChainPDA: null,
        owner: config.ownerAddress,
      });
    }

    return NextResponse.json({ agents });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch agents" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/agent-card/my-agents
 * Track an agent as registered via UI (for source detection).
 * Called by the frontend after successful on-chain registration.
 */
export async function POST(request: NextRequest) {
  try {
    const { did, owner, agentId } = await request.json();
    if (!did || !owner || !agentId) {
      return NextResponse.json({ error: "did, owner, agentId required" }, { status: 400 });
    }
    await dbMarkAgentUIRegistered(did, owner, agentId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to track registration" }, { status: 500 });
  }
}
