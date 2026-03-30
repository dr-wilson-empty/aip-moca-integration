import { generateDIDFromPublicKey } from "@/lib/identity/did";

/**
 * Solana public key'den gercek W3C DID uretir.
 * Eski sahte implementasyon yerine gercek kriptografik DID.
 */
export function generateDID(pubkey: string): string {
  return generateDIDFromPublicKey(pubkey);
}

export function shortenAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}
