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
    const seenAgentIds = new Set<string>();

    // 1. Hosted agents first (no-code builder — they are the runtime source of truth)
    for (const config of hostedConfigs) {
      // Find matching on-chain record for PDA info
      const onChainMatch = onChainRecords.find((r) => r.agentId === config.agentId);

      agents.push({
        did: onChainMatch?.did ?? `did:aip:${config.ownerAddress.slice(0, 8)}:${config.agentId}`,
        name: config.name,
        version: "1.0.0",
        endpoint: `/api/hosted-agent?agentId=${config.agentId}`,
        type: "Task",
        capabilities: config.capabilities as Capability[],
        walletAddress: config.ownerAddress,
        agentId: config.agentId,
        registrationSource: "hosted",
        onChainPDA: onChainMatch?.pda ?? null,
        owner: config.ownerAddress,
        isPublic: config.isPublic ?? true,
      });
      seenAgentIds.add(config.agentId);
    }

    // 2. On-chain agents (only those NOT already covered by hosted)
    for (const record of onChainRecords) {
      if (seenAgentIds.has(record.agentId)) continue;

      let capabilities: Capability[] = [];
      try { capabilities = JSON.parse(record.capabilitiesJson); } catch { /* skip */ }

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
      seenAgentIds.add(record.agentId);
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
