import type { AgentCard } from "@/types/aip";

/**
 * In-memory Agent Card deposu.
 * Faz 1 icin yeterli — ileri fazlarda veritabanina tasinabilir.
 */
const cardsByDid = new Map<string, AgentCard>();
const cardsByEndpoint = new Map<string, AgentCard>();

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
