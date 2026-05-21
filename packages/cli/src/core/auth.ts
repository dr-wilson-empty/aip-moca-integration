/**
 * AIP-AUTH header builder.
 *
 * Mutation routes on the backend (POST /api/hosted-agent/register,
 * POST /api/budget, etc.) authenticate the caller via three headers:
 *
 *   X-WALLET-ADDRESS    base58 Solana public key
 *   X-WALLET-SIGNATURE  base58 Ed25519 signature over the auth message
 *   X-WALLET-TIMESTAMP  unix milliseconds when the message was signed
 *
 * The server constructs the auth message itself from
 * `AIP-AUTH:<address>:<timestamp>` and verifies the signature against
 * the supplied address. Session window is 24 hours (see
 * src/lib/auth/wallet-auth.ts on the server).
 *
 * The web UI signs this message via the wallet adapter when the user
 * connects; on the CLI we do it ourselves using the local keystore.
 */
import nacl from "tweetnacl";
import bs58 from "bs58";
import { Keypair } from "@solana/web3.js";

// Index signature on top of the named fields so consumers can spread
// the result into `Record<string, string>` slots (ApiClient.opts.headers).
export type AipAuthHeaders = {
  "X-WALLET-ADDRESS": string;
  "X-WALLET-SIGNATURE": string;
  "X-WALLET-TIMESTAMP": string;
} & Record<string, string>;

/**
 * Produce the three X-WALLET-* headers for the given keypair.
 * Uses the current wall clock for the timestamp.
 */
export function buildAipAuthHeaders(keypair: Keypair): AipAuthHeaders {
  const address = keypair.publicKey.toBase58();
  const timestamp = Date.now();
  const message = new TextEncoder().encode(`AIP-AUTH:${address}:${timestamp}`);
  // Keypair.secretKey is the 64-byte expanded Ed25519 secret that
  // tweetnacl's sign.detached accepts directly.
  const signature = nacl.sign.detached(message, keypair.secretKey);
  return {
    "X-WALLET-ADDRESS": address,
    "X-WALLET-SIGNATURE": bs58.encode(signature),
    "X-WALLET-TIMESTAMP": String(timestamp),
  };
}
