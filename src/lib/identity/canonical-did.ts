/**
 * Canonical DID helper — ensures consistent DID format across the platform.
 *
 * Hosted agents previously had inconsistent DIDs:
 *   - `did:aip:hosted:AGENT_ID` (route responses, card registration)
 *   - `did:aip:WALLET_PREFIX:AGENT_ID` (seed-agents, budget, task creation)
 *
 * This module normalizes all hosted agent DIDs to:
 *   `did:aip:WALLET_PREFIX:AGENT_ID`
 *
 * SDK agents keep their `did:key:z6Mk...` format (different identity system).
 * Platform agents keep `did:aip:platform:*` format.
 */

/**
 * Generate the canonical DID for a hosted/on-chain agent.
 * Format: did:aip:WALLET_PREFIX_8CHARS:AGENT_ID
 */
export function canonicalAgentDid(ownerAddress: string, agentId: string): string {
  return `did:aip:${ownerAddress.slice(0, 8)}:${agentId}`;
}

/**
 * Check if an endpoint belongs to a platform-hosted agent.
 * More reliable than DID prefix checking.
 */
export function isHostedEndpoint(endpoint: string): boolean {
  return endpoint.includes("/api/hosted-agent");
}
