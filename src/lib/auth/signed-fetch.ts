/**
 * Client-side authenticated fetch wrapper.
 * Attaches wallet auth headers (address, signature, timestamp) to requests.
 */

interface AuthSession {
  address: string;
  signature: string; // base58 encoded
  timestamp: number;
}

let currentAuth: AuthSession | null = null;

export function setAuthSession(auth: AuthSession | null): void {
  currentAuth = auth;
}

export function getAuthSession(): AuthSession | null {
  return currentAuth;
}

export function getAuthHeaders(): Record<string, string> {
  if (!currentAuth) return {};
  return {
    "X-WALLET-ADDRESS": currentAuth.address,
    "X-WALLET-SIGNATURE": currentAuth.signature,
    "X-WALLET-TIMESTAMP": String(currentAuth.timestamp),
  };
}

/**
 * Authenticated fetch — automatically adds wallet auth headers.
 * Falls back to regular fetch if no auth session is active.
 */
export function signedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  const auth = getAuthHeaders();
  for (const [k, v] of Object.entries(auth)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return fetch(input, { ...init, headers });
}
