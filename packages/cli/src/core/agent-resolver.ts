import bs58 from "bs58";
import { ApiClient } from "./api-client.js";
import { AgentListResponseSchema, type ListedAgent } from "./agent-list.js";
import { NotFoundError, ValidationError } from "./errors.js";

/**
 * Checks whether a DID is in canonical did:aip:<owner-pubkey>:<agent-id>
 * form — that is, the owner segment decodes to a 32-byte base58 pubkey.
 * Returns false for placeholders like 'platform' / 'sdk' / truncated keys.
 */
export function isCanonicalAipDid(did: string): boolean {
  const m = /^did:aip:([^:]+):.+$/i.exec(did);
  if (!m) return false;
  try {
    return bs58.decode(m[1]!).length === 32;
  } catch {
    return false;
  }
}

export async function findMarketplaceAgent(
  did: string,
  api: ApiClient,
): Promise<ListedAgent | undefined> {
  const list = await api.get("/api/agent-card", AgentListResponseSchema, {
    query: { list: true },
  });
  return list.agents.find((a) => a.did === did);
}

export interface ResolvedAgent {
  did: string;
  agent?: ListedAgent;
  source: "explicit-did" | "marketplace-match";
}

const DID_PREFIX = /^did:/i;

/**
 * Resolve a user-provided agent identifier to a full DID.
 *
 * Accepts:
 *   - did:aip:...                              → returned as-is
 *   - did:web:..., did:key:...                 → returned as-is
 *   - "summary-agent" (last segment of a DID)  → marketplace lookup
 *   - "summary" (partial agent_id or name)     → marketplace lookup
 *   - "Summary Agent" (display name)           → marketplace lookup
 *
 * Throws when no marketplace match or multiple ambiguous matches.
 */
export async function resolveAgent(input: string, api: ApiClient): Promise<ResolvedAgent> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new ValidationError(
      "Agent identifier is empty",
      "Use a DID, marketplace agent_id, or pass --help.",
    );
  }

  if (DID_PREFIX.test(trimmed)) {
    return { did: trimmed, source: "explicit-did" };
  }

  let listResp;
  try {
    listResp = await api.get("/api/agent-card", AgentListResponseSchema, {
      query: { list: true },
    });
  } catch (err) {
    throw new NotFoundError(
      `Could not look up '${trimmed}' — marketplace API unreachable`,
      (err as Error).message,
    );
  }

  const matches = matchAgents(listResp.agents, trimmed);

  if (matches.length === 0) {
    throw new NotFoundError(
      `No agent matched '${trimmed}'`,
      "Run 'aip agents ls' to see available DIDs and names.",
    );
  }

  if (matches.length === 1) {
    return { did: matches[0]!.did, agent: matches[0]!, source: "marketplace-match" };
  }

  const list = matches
    .map((a) => `  • ${pad(a.name, 22)} ${a.did}`)
    .join("\n");
  throw new ValidationError(
    `'${trimmed}' matches ${matches.length} agents:\n${list}`,
    "Be more specific — type more of the name, or paste the full DID.",
  );
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function lastSegment(did: string): string {
  const i = did.lastIndexOf(":");
  return i === -1 ? did : did.slice(i + 1);
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Score-based matcher. Lower scores win; ties yield multiple matches.
 *   1 — exact agentId (last DID segment), case-insensitive
 *   2 — exact name, case-insensitive
 *   3 — agentId starts with input
 *   4 — name starts with input
 *   5 — agentId contains input
 *   6 — name contains input
 */
function matchAgents(agents: ListedAgent[], input: string): ListedAgent[] {
  const q = normalize(input);
  type Scored = { agent: ListedAgent; score: number };
  const scored: Scored[] = [];

  for (const agent of agents) {
    const agentId = normalize(lastSegment(agent.did));
    const name = normalize(agent.name);

    let score = Number.POSITIVE_INFINITY;
    if (agentId === q) score = 1;
    else if (name === q) score = 2;
    else if (agentId.startsWith(q)) score = 3;
    else if (name.startsWith(q)) score = 4;
    else if (agentId.includes(q)) score = 5;
    else if (name.includes(q)) score = 6;

    if (score !== Number.POSITIVE_INFINITY) scored.push({ agent, score });
  }

  if (scored.length === 0) return [];

  const best = Math.min(...scored.map((s) => s.score));
  return scored.filter((s) => s.score === best).map((s) => s.agent);
}
