import type { AgentCard } from "@/types/aip";
import {
  fetchAllOnChainAgents,
  isAgentOnChainByDid,
} from "@/lib/solana/registry-program";
import { getAppUrl } from "@/lib/config/app-url";

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
    const onChainCards = await fetchAllOnChainAgents();
    for (const rawCard of onChainCards) {
      const card = { ...rawCard, endpoint: normalizeEndpoint(rawCard.endpoint) };
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
