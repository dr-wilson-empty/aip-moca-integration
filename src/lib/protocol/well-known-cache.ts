/**
 * Well-known cache for external (non-hosted) agents.
 *
 * Hosted agents have a Supabase row that carries their per-capability
 * pricing — `enrichCapabilitiesFromHosted` reads from that. External
 * SDK agents are different: they register on-chain with their own
 * endpoint and serve a /.well-known/agent.json card containing the
 * real per-cap pricing. The on-chain record can only store a single
 * floor `price_per_task`, so without this cache the marketplace would
 * advertise the floor across all their capabilities.
 *
 * Approach: keep an in-memory map keyed by endpoint. Fetches happen in
 * the background — never blocking the listing path — and write into
 * the cache. The first listing after a fresh boot returns floor
 * pricing for external agents; subsequent listings get the real
 * advertised pricing as background fetches complete.
 *
 * Trade-offs:
 *   - 5-minute TTL: long enough that a busy server doesn't hammer
 *     external endpoints, short enough that pricing edits land within
 *     a few minutes.
 *   - 3-second fetch timeout: external well-knowns are best-effort;
 *     if they're down we keep serving the floor price and try again
 *     later. Listing latency must not depend on flaky third-parties.
 *   - In-memory only: a Railway redeploy clears the cache. That's
 *     acceptable — first request post-deploy still works.
 */

import type { Capability } from "@/types/aip";

interface CacheEntry {
  capabilities: Capability[] | null; // null = fetched and confirmed absent / unparseable
  fetchedAt: number;
}

const TTL_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 3000;

const g = globalThis as typeof globalThis & {
  __aip_wellknown_cache?: Map<string, CacheEntry>;
  __aip_wellknown_inflight?: Map<string, Promise<void>>;
};
if (!g.__aip_wellknown_cache) g.__aip_wellknown_cache = new Map();
if (!g.__aip_wellknown_inflight) g.__aip_wellknown_inflight = new Map();

const cache = g.__aip_wellknown_cache;
const inflight = g.__aip_wellknown_inflight;

/**
 * Returns cached capabilities for the endpoint, if present and fresh.
 * Never triggers a fetch on its own — use {@link refreshWellKnown}
 * for that. Callers that need the value synchronously (listing,
 * detail) should check this first.
 */
export function getCachedWellKnownCapabilities(endpoint: string): Capability[] | null {
  const entry = cache.get(endpoint);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > TTL_MS) return null;
  return entry.capabilities;
}

/**
 * Convert the `endpoint` we have on-chain into the well-known URL.
 * Convention: the agent serves its card at the same origin under
 * `/.well-known/agent.json`. If the endpoint already ends in `/a2a`
 * we replace it; otherwise we tack `/.well-known/agent.json` onto the
 * origin.
 */
function wellKnownUrlFor(endpoint: string): string | null {
  try {
    const url = new URL(endpoint);
    return `${url.origin}/.well-known/agent.json`;
  } catch {
    return null;
  }
}

/**
 * Kicks off a background fetch of the agent's well-known card and
 * populates the cache. De-duplicates concurrent requests for the same
 * endpoint. Resolves once the fetch is done (or rejected/cached).
 *
 * Callers should NOT await this on a latency-sensitive path; use
 * {@link getCachedWellKnownCapabilities} for the synchronous lookup
 * and let the background refresh fill in the cache for future calls.
 */
export async function refreshWellKnown(endpoint: string): Promise<void> {
  const existing = inflight.get(endpoint);
  if (existing) return existing;

  const url = wellKnownUrlFor(endpoint);
  if (!url) {
    cache.set(endpoint, { capabilities: null, fetchedAt: Date.now() });
    return;
  }

  const promise = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) {
        cache.set(endpoint, { capabilities: null, fetchedAt: Date.now() });
        return;
      }
      const body = (await res.json()) as { capabilities?: unknown };
      const capabilities = parseCapabilities(body.capabilities);
      cache.set(endpoint, { capabilities, fetchedAt: Date.now() });
    } catch {
      cache.set(endpoint, { capabilities: null, fetchedAt: Date.now() });
    } finally {
      inflight.delete(endpoint);
    }
  })();
  inflight.set(endpoint, promise);
  return promise;
}

/**
 * Best-effort parse: accepts an array of capability-shaped objects and
 * returns the subset that matches the Capability shape we expose to
 * the rest of the app. Anything we can't read confidently is dropped.
 */
function parseCapabilities(raw: unknown): Capability[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Capability[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    const id = typeof c.id === "string" ? c.id : null;
    const description = typeof c.description === "string" ? c.description : "";
    const pricing = c.pricing as Record<string, unknown> | undefined;
    const amount = pricing && typeof pricing.amount === "string" ? pricing.amount : null;
    if (!id || !amount) continue;
    out.push({
      id,
      description,
      pricing: { amount, token: "USDC", network: "solana" },
    });
  }
  return out.length > 0 ? out : null;
}
