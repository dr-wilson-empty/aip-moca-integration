/**
 * One-shot — write the new professional system prompts into the
 * Supabase `hosted_agents` table for the three platform demo agents
 * (summary-agent, data-agent, audit-agent). The seedDemoAgents() loop
 * only registers a hosted agent if the row is missing, so existing
 * rows keep their old prompts forever unless we update them here.
 *
 * Usage:
 *   npx tsx scripts/update-demo-prompts.ts             # dry-run
 *   npx tsx scripts/update-demo-prompts.ts --apply
 *
 * Reads .env.local for SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
try {
  const envText = readFileSync(".env.local", "utf8");
  for (const line of envText.split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local */ }

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const apply = process.argv.includes("--apply");

const PROMPTS: Record<string, string> = {
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

async function main(): Promise<void> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_KEY!, { auth: { persistSession: false } });
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);
  console.log(`Supabase: ${SUPABASE_URL!.replace(/\/$/, "")}`);
  console.log("");

  for (const [agentId, newPrompt] of Object.entries(PROMPTS)) {
    const { data: current, error: readErr } = await sb
      .from("hosted_agents")
      .select("agent_id, system_prompt, active")
      .eq("agent_id", agentId)
      .maybeSingle();
    if (readErr) {
      console.error(`# ${agentId}\n  FAILED to read: ${readErr.message}\n`);
      continue;
    }
    if (!current) {
      console.log(`# ${agentId}\n  not found in hosted_agents (skipping)\n`);
      continue;
    }
    const oldLen = (current.system_prompt || "").length;
    const newLen = newPrompt.length;
    console.log(`# ${agentId}`);
    console.log(`  active:        ${current.active}`);
    console.log(`  current size:  ${oldLen} chars`);
    console.log(`  new size:      ${newLen} chars`);
    console.log(`  preview:       ${newPrompt.slice(0, 70).replace(/\n/g, " ")}...`);

    if (!apply) {
      console.log("");
      continue;
    }

    const { error: writeErr } = await sb
      .from("hosted_agents")
      .update({ system_prompt: newPrompt, updated_at: new Date().toISOString() })
      .eq("agent_id", agentId);
    if (writeErr) {
      console.error(`  WRITE FAILED: ${writeErr.message}`);
    } else {
      console.log(`  ✓ updated`);
    }
    console.log("");
  }
}

main().catch((err) => {
  console.error("[update-demo-prompts] FATAL:", err);
  process.exitCode = 1;
});
