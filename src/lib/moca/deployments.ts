/**
 * Deployed AipRegistry contract addresses per Moca network.
 * Update when redeploying. Source of truth: moca-contracts/ignition/deployments/.
 */
export const MOCA_REGISTRY_ADDRESS = {
  // Deployed 2026-05-29 via Ignition (AipRegistryModule#AipRegistry).
  testnet: "0x6caea13e7d5fbC4bDa28414C9aa97799fac68c36",
} as const;

export const MOCA_ESCROW_ADDRESS = {
  // Deployed 2026-05-30 via Ignition (AipEscrowModule#AipEscrow). Native MOCA escrow.
  testnet: "0xFe362801345513fC7f46050199DdE08bf7B998F1",
} as const;

export const MOCA_TESTNET_EXPLORER = "https://testnet-scan.mocachain.org";
