/**
 * Canonical DID helper — ensures consistent DID format across the platform.
 *
 * Conforms to did:aip Method Specification §3.2:
 *   did-aip = "did:aip:" owner-pubkey ":" agent-id
 *   owner-pubkey = 32*44 base58char   ; full Ed25519 public key
 *   agent-id     = 1*32 agent-id-char
 *
 * Previously this helper produced truncated DIDs (`slice(0, 8)`),
 * which violated the spec and made resolution impossible: the
 * resolver requires the full 32-byte pubkey to derive the PDA.
 *
 * SDK / external agents using `did:key:z6Mk...` keep that format
 * (different identity system). For did:aip identifiers, the
 * format MUST be the full canonical form below.
 */

export function canonicalAgentDid(ownerAddress: string, agentId: string): string {
  return `did:aip:${ownerAddress}:${agentId}`;
}

/**
 * Check if an endpoint belongs to a platform-hosted agent.
 * More reliable than DID prefix checking.
 */
export function isHostedEndpoint(endpoint: string): boolean {
  return endpoint.includes("/api/hosted-agent");
}

/**
 * Check if an Agent Card represents a platform-built-in agent (hosted
 * demo agents or the Web Search Agent). Endpoint-based check survives
 * the move away from the legacy `did:aip:platform:*` namespace.
 */
export function isPlatformAgent(card: { endpoint: string }): boolean {
  return card.endpoint.includes("/api/hosted-agent")
    || card.endpoint.includes("/api/web/agent");
}
