import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import bs58 from "bs58";

/**
 * Wallet authentication via Ed25519 signature verification.
 *
 * Headers:
 *   X-WALLET-ADDRESS   — base58 Solana public key
 *   X-WALLET-SIGNATURE — base58 Ed25519 signature
 *   X-WALLET-TIMESTAMP — Unix timestamp (ms) when the auth message was signed
 *
 * Signed message format: "AIP-AUTH:<address>:<timestamp>"
 * Session window: 24 hours (user signs once on wallet connect).
 */

const AUTH_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface WalletAuthResult {
  wallet: string;
}

export function verifyWalletAuth(request: NextRequest): WalletAuthResult | NextResponse {
  const address = request.headers.get("x-wallet-address");
  const signature = request.headers.get("x-wallet-signature");
  const timestamp = request.headers.get("x-wallet-timestamp");

  if (!address || !signature || !timestamp) {
    return NextResponse.json(
      { error: "Authentication required: missing wallet signature headers" },
      { status: 401 },
    );
  }

  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > AUTH_WINDOW_MS) {
    return NextResponse.json(
      { error: "Authentication expired: please reconnect your wallet" },
      { status: 401 },
    );
  }

  try {
    const publicKey = bs58.decode(address);
    const sig = bs58.decode(signature);

    if (publicKey.length !== 32 || sig.length !== 64) {
      return NextResponse.json({ error: "Invalid signature format" }, { status: 401 });
    }

    const message = new TextEncoder().encode(`AIP-AUTH:${address}:${timestamp}`);
    const valid = nacl.sign.detached.verify(message, sig, publicKey);

    if (!valid) {
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  return { wallet: address };
}

/**
 * Type guard: check if verifyWalletAuth returned an error response.
 */
export function isAuthError(result: WalletAuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * Convenience: verify wallet auth AND ensure the authenticated wallet
 * matches a wallet address from the request (query param or body).
 */
export function verifyWalletOwnership(
  request: NextRequest,
  requestedWallet: string | null,
): WalletAuthResult | NextResponse {
  const auth = verifyWalletAuth(request);
  if (isAuthError(auth)) return auth;

  if (requestedWallet && auth.wallet !== requestedWallet) {
    return NextResponse.json(
      { error: "Forbidden: wallet address mismatch" },
      { status: 403 },
    );
  }

  return auth;
}
