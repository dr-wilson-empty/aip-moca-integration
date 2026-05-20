import { getDemoAgentCards, getWebSearchAgent } from "@/lib/mock/agentCards";
import { registerCard, syncFromChain } from "./agent-card-store";
import { loadHostedAgentsFromDb, listHostedAgents, registerHostedAgent, getHostedAgent } from "@/lib/hosted-agents";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { getAppUrl } from "@/lib/config/app-url";
import { getAuthorityAddress, getAuthorityKeypair } from "@/lib/payment/escrow";
import {
  isAgentOnChain,
  registerAgentOnChain,
} from "@/lib/solana/registry-program";
import type { AgentCard } from "@/types/aip";

const gs = globalThis as typeof globalThis & {
  __aip_seeded?: boolean;
  __aip_chain_registered?: boolean;
  __aip_onchain_seed_inflight?: Promise<void>;
};

/**
 * Seed platform agents + hosted agents from Supabase.
 * Demo agents (Summary, Data, Audit) are registered as hosted agents
 * so they run through the same /api/hosted-agent endpoint, and as of
 * Önkoşul 0 / Modül B they are ALSO registered on-chain (idempotent —
 * skips PDAs that already exist).
 *
 * The seen-flag lives on `globalThis` so two API route modules that
 * each import this file see the same value. A previous version cached
 * the flag in a module-local `let seeded` initialized at import time,
 * which meant two concurrent first-requests could both pass the guard
 * before either could write it — re-running the seed (idempotent, but
 * wasteful and racy with the hosted_agents upserts).
 */
export function seedDemoAgents(): void {
  if (gs.__aip_seeded) return;
  gs.__aip_seeded = true;

  // Register Web Search Agent (platform built-in, separate route)
  registerCard(getWebSearchAgent());

  // Register demo agents as hosted agents + card store
  const demoAgents = getDemoAgentCards();
  let authority = "";
  try { authority = getAuthorityAddress(); } catch { /* no key */ }

  for (const [agentId, card] of Object.entries(demoAgents)) {
    registerCard(card);

    // Ensure hosted agent config exists in Supabase (so /api/hosted-agent can serve them)
    if (authority && !getHostedAgent(agentId)) {
      const DEMO_PROMPTS: Record<string, string> = {
        "summary-agent": `You are a precision text processing agent specialized in summarization and classification.

For summarize requests:
- Default length: 3-5 sentences for short input (<500 words), 6-10 sentences for long input.
- Preserve named entities, numbers, dates, and direct quotations verbatim.
- Lead with the most important fact, then context, then implications.
- Never speculate beyond the source. If the user asks for inference, label it as such.

For classify requests:
- Return the label first on its own line, then a single-sentence justification.
- If the user provides a category set, use only those labels; if not, propose a mutually exclusive set of 3-5 labels first.
- For ambiguous inputs, return the most likely label plus a "confidence: low/medium/high" tag.

Output plain text unless the user explicitly asks for markdown or JSON. Stay neutral in tone; no preamble, no apologies, no meta-commentary.`,
        "data-agent": `You are a blockchain and DeFi data retrieval agent. Your audience is technical: developers, analysts, and traders who need precise on-chain data.

Operating rules:
- Return exact values with units and decimals. Use the actual number, never "approximately" or "around X".
- When citing on-chain state (balances, supply, TVL), include the block height or slot when possible.
- For protocol metrics (TVL, fees, APR), name the source dataset (e.g. DeFiLlama, Dune query, native API endpoint).
- Distinguish three claim types and label them: (1) verified on-chain data, (2) reported by a trusted aggregator, (3) inference / commentary.
- Never make price predictions or recommend trades. If asked, decline and offer the underlying mechanics instead.

Default output format: structured fields (Asset · Value · Source · As-of). Use prose only when the user explicitly asks for explanation. Keep responses concise — long answers belong only to genuinely complex questions.`,
        "audit-agent": `You are a senior smart contract security auditor and DeFi risk analyst. Your standard is what a paid auditor at Trail of Bits, OpenZeppelin, or Sec3 would produce.

For code.audit:
- Cite specific functions and line numbers when flagging issues; vague observations are not acceptable.
- Classify findings by severity using these criteria:
  - Critical: direct loss of user funds or protocol insolvency, no preconditions.
  - High: loss of funds under realistic conditions, or unauthorized state mutation.
  - Medium: degraded operation, recoverable loss, or significant DoS.
  - Low: minor issues, code quality, gas inefficiency with material impact.
  - Informational: style, convention, non-issues worth noting.
- For each finding provide: (a) the vulnerability, (b) the attack path with concrete steps, (c) the impact, (d) a specific code-level fix.
- Cover the standard surfaces: reentrancy, access control, integer over/underflow, oracle manipulation, MEV exposure, upgrade patterns, signature replay, denial of service, front-running.

For defi.analyze:
- Score these dimensions independently 1-5 with one-sentence justifications: protocol risk, smart contract risk, oracle risk, governance risk, liquidity risk, counterparty risk.
- Conclude with the dominant risk and the realistic failure scenario for a holder.
- Never give financial advice. Stay technical and adversarial; assume the user can handle direct findings.

Output plain markdown with clear section headers. Skip the "here is my audit" preamble.`,
      };
      registerHostedAgent({
        agentId,
        ownerAddress: authority,
        name: card.name,
        description: card.capabilities.map((c) => c.description).join(", "),
        systemPrompt: DEMO_PROMPTS[agentId] || "You are a helpful AI agent.",
        tier: "platform",
        provider: "anthropic",
        capabilities: card.capabilities.map((c) => ({
          id: c.id,
          description: c.description,
          pricing: { amount: c.pricing.amount, token: "USDC", network: "solana" },
        })),
        canOrchestrate: false,
        isPublic: true,
        mcpServers: [],
        createdAt: new Date().toISOString(),
        active: true,
      }).catch(() => {});
    }
  }

  // Load user-created hosted agents from Supabase
  loadHostedAgentsFromDb().then(() => {
    const base = getAppUrl();
    for (const ha of listHostedAgents().filter((a) => a.isPublic !== false)) {
      registerCard({
        did: canonicalAgentDid(ha.ownerAddress, ha.agentId),
        name: ha.name,
        description: ha.description || undefined,
        version: "1.0.0",
        endpoint: `${base}/api/hosted-agent?agentId=${ha.agentId}`,
        type: "Task",
        walletAddress: ha.ownerAddress,
        capabilities: ha.capabilities.map((c) => ({
          id: c.id,
          description: c.description,
          pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
        })),
      });
    }
  }).catch(() => {});

  // Sync from on-chain registry (background)
  if (!gs.__aip_chain_registered) {
    gs.__aip_chain_registered = true;
    syncFromChain().catch(() => {});
  }

  // Register demo agents on-chain (idempotent, background, single-flight).
  if (!gs.__aip_onchain_seed_inflight) {
    gs.__aip_onchain_seed_inflight = registerDemoAgentsOnChain(demoAgents).catch((err) => {
      console.warn("[seed-agents] on-chain registration failed:", err?.message ?? err);
    });
  }
}

/**
 * Register hosted demo agents on the AIP registry program if they
 * aren't already there. Designed to be safe to call on every server
 * boot: each PDA existence is checked first, and any failure on one
 * agent doesn't abort the others.
 *
 * Requires `ESCROW_PRIVATE_KEY` — the platform authority signs and
 * pays rent (≈0.0009 SOL per PDA on devnet).
 */
async function registerDemoAgentsOnChain(demoAgents: Record<string, AgentCard>): Promise<void> {
  console.log("[seed-agents] starting on-chain registration check…");
  let authorityKp;
  try {
    authorityKp = getAuthorityKeypair();
  } catch (err) {
    console.warn("[seed-agents] no authority keypair available:", err instanceof Error ? err.message : err);
    return;
  }
  const ownerPubkey = authorityKp.publicKey.toBase58();
  console.log(`[seed-agents] authority ${ownerPubkey}, checking ${Object.keys(demoAgents).length} agents…`);

  for (const [agentId, card] of Object.entries(demoAgents)) {
    try {
      if (await isAgentOnChain(ownerPubkey, agentId)) {
        console.log(`[seed-agents] ${agentId} already on-chain — skip`);
        continue;
      }
      console.log(`[seed-agents] registering ${agentId}…`);
      const sig = await registerAgentOnChain(authorityKp, agentId, card);
      console.log(`[seed-agents] on-chain registered ${agentId} → tx ${sig}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[seed-agents] failed to register ${agentId} on-chain: ${msg}`);
    }
  }
  console.log("[seed-agents] on-chain registration pass complete.");
}
