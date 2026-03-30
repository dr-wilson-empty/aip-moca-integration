import type { AgentCard } from "@/types/aip";

/**
 * In-memory Agent Card deposu (globalThis ile HMR-safe).
 */
const g = globalThis as typeof globalThis & {
  __aip_cards_did?: Map<string, AgentCard>;
  __aip_cards_ep?: Map<string, AgentCard>;
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
