import type { AgentCard } from "@/types/aip";
import {
  fetchAllOnChainAgents,
  isAgentOnChainByDid,
} from "@/lib/solana/registry-program";
import { getAppUrl } from "@/lib/config/app-url";
import { loadHostedAgentsFromDb, listHostedAgents } from "@/lib/hosted-agents";
import { getCachedWellKnownCapabilities, refreshWellKnown } from "./well-known-cache";

/**
 * Restore per-capability pricing for hosted-agent cards.
 *
 * The on-chain AgentRecord can only store one `price_per_task: u64` for
 * the whole agent (it's the cheapest of the agent's capabilities at
 * registration time). When decoded, every capability gets that floor
 * price spread across it, which flattens multi-tier pricing (e.g. the
 * "premium" capability priced at 0.20 USDC reads back as 0.10).
 *
 * This helper looks up the agent's Supabase `hosted_agents` row — which
 * keeps the original per-cap pricing the owner configured in the UI —
 * and swaps those amounts back in. Used at every layer that exposes
 * capability pricing (in-memory sync, list endpoint, detail endpoint,
 * orchestrator's available-agents prompt, delegation budget reserve)
 * so the single source of truth becomes Supabase per-cap pricing for
 * hosted agents.
 *
 * External (non-hosted) agents are returned untouched — we don't have
 * per-cap pricing for them and on-chain is the best we have.
 */
export function enrichCapabilitiesFromHosted(card: AgentCard): AgentCard {
  const m = card.endpoint.match(/[?&]agentId=([^&]+)/);
  if (m) {
    const agentId = m[1];
    const hosted = listHostedAgents().find((h) => h.agentId === agentId);
    if (hosted) {
      const enriched = card.capabilities.map((cardCap) => {
        const match = hosted.capabilities.find((c) => c.id === cardCap.id);
        if (!match) return cardCap;
        return {
          ...cardCap,
          pricing: {
            amount: match.pricing.amount,
            token: "USDC" as const,
            network: "solana" as const,
          },
        };
      });
      return { ...card, capabilities: enriched };
    }
  }

  // Fallback for external (SDK) agents: their per-capability pricing
  // is published in their own /.well-known/agent.json. We don't block
  // on the network here — if the cache is warm we use it, otherwise we
  // kick off a background refresh and return the floor pricing for
  // now; the next sync picks up the real values.
  const wellKnown = getCachedWellKnownCapabilities(card.endpoint);
  if (wellKnown && wellKnown.length > 0) {
    const enriched = card.capabilities.map((cardCap) => {
      const match = wellKnown.find((c) => c.id === cardCap.id);
      return match ? { ...cardCap, pricing: { ...match.pricing } } : cardCap;
    });
    return { ...card, capabilities: enriched };
  }
  // Prime the cache for next time. Errors are swallowed inside.
  void refreshWellKnown(card.endpoint);
  return card;
}

/**
 * Hosted-agent endpoints get baked into the on-chain PDA at registration
 * time. Demo agents seeded during local dev were committed with a
 * `http://localhost:3000` host; that value lives on Solana forever. When
 * the live server later syncs from chain, the stale host would otherwise
 * overwrite the correct in-memory endpoint, leaving the marketplace
 * showing localhost URLs and the status route marking them offline.
 *
 * For any endpoint that is unambiguously a hosted-agent dispatch URL
 * (carries `?agentId=` or matches the platform web-agent path) we
 * rewrite the host to the current `getAppUrl()` value. External agents
 * (no `?agentId=`, custom domains) are left untouched.
 */
export function normalizeEndpoint(endpoint: string): string {
  const isHostedDispatch =
    endpoint.includes("/api/hosted-agent") || endpoint.includes("/api/web/agent");
  if (!isHostedDispatch) return endpoint;
  try {
    const url = new URL(endpoint);
    const appUrl = new URL(getAppUrl());
    if (url.protocol === appUrl.protocol && url.hostname === appUrl.hostname && url.port === appUrl.port) {
      return endpoint;
    }
    // `URL.host` setter preserves the existing port when the assigned
    // value omits one, so we update protocol / hostname / port
    // individually to make sure stale `:3000` from a localhost URL is
    // fully wiped (otherwise we end up with `app.aipagents.xyz:3000`).
    url.protocol = appUrl.protocol;
    url.hostname = appUrl.hostname;
    url.port = appUrl.port;
    return url.toString();
  } catch {
    return endpoint;
  }
}

/**
 * Hybrid Agent Card store — in-memory cache + on-chain registry.
 * In-memory for fast lookups; on-chain as source of truth.
 */
const g = globalThis as typeof globalThis & {
  __aip_cards_did?: Map<string, AgentCard>;
  __aip_cards_ep?: Map<string, AgentCard>;
  __aip_chain_synced?: boolean;
};
if (!g.__aip_cards_did) g.__aip_cards_did = new Map();
if (!g.__aip_cards_ep) g.__aip_cards_ep = new Map();

const cardsByDid = g.__aip_cards_did;
const cardsByEndpoint = g.__aip_cards_ep;

export function registerCard(card: AgentCard): void {
  cardsByDid.set(card.did, card);
  cardsByEndpoint.set(card.endpoint, card);
}

export function getCardByDid(did: string): AgentCard | null {
  return cardsByDid.get(did) ?? null;
}

export function getCardByEndpoint(endpoint: string): AgentCard | null {
  return cardsByEndpoint.get(endpoint) ?? null;
}

export function listCards(): AgentCard[] {
  return Array.from(cardsByDid.values());
}

export function removeCard(did: string): boolean {
  const card = cardsByDid.get(did);
  if (!card) return false;
  cardsByDid.delete(did);
  cardsByEndpoint.delete(card.endpoint);
  return true;
}

/**
 * Sync on-chain agents into in-memory cache.
 * Merges with existing in-memory cards (on-chain takes precedence).
 */
export async function syncFromChain(): Promise<number> {
  try {
    // Pull the hosted_agents cache fresh before iterating so capability
    // enrichment sees the latest per-cap pricing (e.g. a UI edit landed
    // seconds before this sync runs).
    await loadHostedAgentsFromDb({ force: true }).catch(() => {});
    const onChainCards = await fetchAllOnChainAgents();
    for (const rawCard of onChainCards) {
      const withEndpoint = { ...rawCard, endpoint: normalizeEndpoint(rawCard.endpoint) };
      const card = enrichCapabilitiesFromHosted(withEndpoint);
      // Remove any in-memory card with the same endpoint (avoid duplicates)
      const toRemove: string[] = [];
      cardsByDid.forEach((existing, existingDid) => {
        if (existing.endpoint === card.endpoint && existingDid !== card.did) {
          toRemove.push(existingDid);
        }
      });
      toRemove.forEach((d) => cardsByDid.delete(d));
      registerCard(card);
    }
    g.__aip_chain_synced = true;
    return onChainCards.length;
  } catch {
    return 0;
  }
}

/** Check if a specific agent is registered on-chain */
export async function checkOnChain(did: string): Promise<boolean> {
  try {
    return await isAgentOnChainByDid(did);
  } catch {
    return false;
  }
}

export function isChainSynced(): boolean {
  return g.__aip_chain_synced ?? false;
}
