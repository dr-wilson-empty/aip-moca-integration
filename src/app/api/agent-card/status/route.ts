import { NextResponse } from "next/server";
import { listCards, syncFromChain } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

seedDemoAgents();

interface AgentStatus {
  did: string;
  name: string;
  endpoint: string;
  online: boolean;
  latencyMs: number;
}

/**
 * GET /api/agent-card/status
 * Ping all registered agents and return their online/offline status.
 */
export async function GET() {
  seedDemoAgents();

  // Pull on-chain registry into the in-memory cache before listing —
  // without this, the route only sees the locally-seeded demo agents
  // and any user-registered agent (e.g. Project Scout) is silently
  // dropped from the status map, which the marketplace renders as a
  // gray "..." dot indistinguishable from "OFFLINE".
  await syncFromChain().catch(() => {});

  const agents = listCards();
  const results: AgentStatus[] = await Promise.all(
    agents.map(async (card) => {
      const t0 = Date.now();
      let online = false;

      try {
        // For hosted agents (same server), just check the card exists
        if (card.endpoint.includes("/api/hosted-agent") || card.endpoint.includes("/api/web/agent")) {
          online = true;
        } else {
          // External agents: ping their well-known endpoint
          const wellKnown = card.endpoint.replace(/\/a2a$/, "/.well-known/agent.json");
          const res = await fetch(wellKnown, {
            signal: AbortSignal.timeout(3000),
          });
          online = res.ok;
        }
      } catch {
        online = false;
      }

      return {
        did: card.did,
        name: card.name,
        endpoint: card.endpoint,
        online,
        latencyMs: Date.now() - t0,
      };
    }),
  );

  // Deduplicate by DID. An agent can appear multiple times in listCards() when it has both
  // an on-chain registry entry (legacy/stale endpoint) and a hosted entry sharing the same
  // canonical DID. Prefer online=true so a working endpoint is not masked by a failing one.
  const dedup = new Map<string, AgentStatus>();
  for (const r of results) {
    const existing = dedup.get(r.did);
    if (!existing || (r.online && !existing.online)) {
      dedup.set(r.did, r);
    }
  }

  return NextResponse.json({ agents: Array.from(dedup.values()) });
}
