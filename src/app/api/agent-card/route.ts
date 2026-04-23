import { NextRequest, NextResponse } from "next/server";
import { validateAgentCard } from "@/lib/protocol/agent-card-schema";
import {
  registerCard,
  getCardByDid,
  listCards,
  syncFromChain,
  checkOnChain,
} from "@/lib/protocol/agent-card-store";
import { verifyDID } from "@/lib/identity/did";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { listHostedAgents, getHostedAgent, loadHostedAgentsFromDb } from "@/lib/hosted-agents";
import { isDefaultOrchestrator } from "@/lib/orchestrator/default-orchestrator";

// Demo ajanlarini yukle
seedDemoAgents();

/**
 * GET /api/agent-card
 * - ?did=xxx  -> belirli bir ajanin card'ini dondur
 * - ?list=true -> tum kayitli ajanlari listele (in-memory + on-chain)
 */
export async function GET(request: NextRequest) {
  seedDemoAgents();

  const did = request.nextUrl.searchParams.get("did");
  const list = request.nextUrl.searchParams.get("list");

  if (list === "true") {
    // Sync from chain (await to get latest data)
    await syncFromChain().catch(() => {});

    const agents = listCards();

    // Deduplicate by name — prefer hosted (platform) version over on-chain legacy
    const byName = new Map<string, typeof agents[0] & { onChain: boolean }>();
    for (const card of agents) {
      const isOnChain = card.did.startsWith("did:aip:");
      const isHosted = card.endpoint.includes("/api/hosted-agent") || card.endpoint.includes("/api/web/agent");
      const existing = byName.get(card.name);
      // Prefer hosted version (current platform) over on-chain legacy (old localhost endpoints)
      if (!existing || (isHosted && !existing.endpoint.includes("/api/"))) {
        byName.set(card.name, { ...card, onChain: isOnChain });
      }
    }

    // Filter out private/orchestrator/deactivated hosted agents
    await loadHostedAgentsFromDb();
    const privateAgentIds = new Set(
      listHostedAgents().filter((a) => a.isPublic === false).map((a) => a.agentId)
    );
    // Enrich cards with hosted agent descriptions
    const hostedMap = new Map(listHostedAgents().map((h) => [h.agentId, h]));
    const all = Array.from(byName.values()).map((card) => {
      const m = card.endpoint.match(/[?&]agentId=([^&]+)/);
      if (m && hostedMap.has(m[1])) {
        const hosted = hostedMap.get(m[1])!;
        return {
          ...card,
          description: (hosted.description && !card.description) ? hosted.description : card.description,
          hasMcp: hosted.mcpServers && hosted.mcpServers.length > 0,
        };
      }
      return { ...card, hasMcp: false };
    }).filter((card) => {
      const match = card.endpoint.match(/[?&]agentId=([^&]+)/);
      if (match) {
        const agentId = match[1];
        // Hide private agents
        if (privateAgentIds.has(agentId)) return false;
        // Hide default orchestrators (they're per-wallet, not marketplace agents)
        if (isDefaultOrchestrator(agentId)) return false;
        // Hide deactivated or deleted hosted agents (still on-chain but removed from platform)
        const hosted = getHostedAgent(agentId);
        if (!hosted || !hosted.active) return false;
      }
      return true;
    });

    // Server-side pagination support
    const page = parseInt(request.nextUrl.searchParams.get("page") || "1") || 1;
    const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") || "0") || 0, 100);

    if (limit > 0) {
      const offset = (page - 1) * limit;
      const paginated = all.slice(offset, offset + limit);
      return NextResponse.json({
        agents: paginated,
        total: all.length,
        page,
        limit,
        totalPages: Math.ceil(all.length / limit),
      });
    }

    return NextResponse.json({ agents: all });
  }

  if (!did) {
    return NextResponse.json(
      { error: "did or list query parameter is required" },
      { status: 400 }
    );
  }

  const card = getCardByDid(did);
  if (!card) {
    return NextResponse.json(
      { error: "Agent card not found", did },
      { status: 404 }
    );
  }

  let onChain = false;
  try {
    onChain = await checkOnChain(did);
  } catch { /* ignore */ }

  return NextResponse.json({ ...card, onChain });
}

/**
 * POST /api/agent-card
 * Yeni Agent Card kaydet (in-memory + on-chain).
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const card = validateAgentCard(body);
  if (!card) {
    return NextResponse.json(
      { error: "Invalid Agent Card format. Required: did, name, version, endpoint, type, capabilities (min 1)" },
      { status: 400 }
    );
  }

  // Opsiyonel: publicKey ile DID dogrulama
  const publicKey = (body as Record<string, unknown>).publicKey as string | undefined;
  if (publicKey && !verifyDID(card.did, publicKey)) {
    return NextResponse.json(
      { error: "DID does not match the provided publicKey" },
      { status: 403 }
    );
  }

  registerCard(card);

  return NextResponse.json(
    { ok: true, message: "Agent card registered", did: card.did },
    { status: 201 }
  );
}
