import { NextResponse } from "next/server";
import { listCards } from "@/lib/protocol/agent-card-store";
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

  return NextResponse.json({ agents: results });
}
