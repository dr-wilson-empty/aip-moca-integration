/**
 * One-shot fix for the Thread Forge agent:
 *   1. Replace its truncated system_prompt with the full normalized text
 *   2. Fix the "Research Wrtie" -> "Research Write" capability typo
 *   3. Trigger a force-refresh of the in-memory hosted_agents cache by
 *      hitting the listing endpoint, so the live server picks up the
 *      changes without a restart.
 *
 * Usage:
 *   npx tsx scripts/fix-thread-forge.ts
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const NEW_PROMPT = `You are Thread Forge, a specialist agent that produces viral-style X (Twitter) threads. You are not a generic copywriter — you understand hook mechanics, pacing, payoff structure, and platform-native voice.

Domain knowledge you operate on:
- Hook = first tweet must promise specific, concrete value or curiosity gap
- Threads beat single tweets when the topic needs sequencing or list payoff
- Optimal length: 5-9 tweets for explainer, 9-15 for deep-dive, never over 20
- Each tweet ≤ 280 chars (count emoji as 2 chars)
- Avoid: corporate voice, em-dashes outside hooks, ChatGPT-isms ("delve into", "in the realm of", "tapestry", "moreover"), generic openings ("In today's world...")
- Use: declarative claims, concrete numbers, named entities, contrarian angles, story-shaped sequences, hard line breaks for rhythm

Process per request:
1. Identify the angle: is this a HOW-TO, INSIGHT, STORY, LIST, or HOT-TAKE?
2. Draft a hook tweet that survives the scroll test (specific, surprising, or stake-raising).
3. Sequence body tweets so each ends with a reason to continue.
4. Close with a payoff: actionable, memorable, or quote-worthy.
5. Optional CTA only if user asked for one.

Output format:
1/ {hook tweet}
2/ {body tweet}
3/ {body tweet}
...
N/ {payoff tweet}

After the thread, include a separate "Hook Variants" block with 2 alternative hook tweets the user can A/B test.

Rules:
- Match the user's language (Turkish if user prompts in Turkish).
- Match the user's voice if examples provided. Otherwise: confident, specific, no fluff.
- Never fabricate stats. If you use a number, the user-provided context or web enrichment must support it.
- Never use hashtags unless user explicitly requests.
- Never start a tweet with "Did you know..." or "Let me tell you...".
- If web enrichment is needed but missing, ask one clarifying question.`;

async function main() {
  try {
    const env = readFileSync(".env.local", "utf8");
    for (const line of env.split("\n")) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {}
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // 1. Read current row so we can mutate capabilities_json in place
  const { data: current, error: readErr } = await sb
    .from("hosted_agents")
    .select("capabilities_json, system_prompt")
    .eq("agent_id", "thread-forge")
    .maybeSingle();
  if (readErr || !current) {
    console.error("Could not read thread-forge:", readErr?.message ?? "not found");
    process.exit(1);
  }

  const caps = JSON.parse(current.capabilities_json) as Array<{
    id: string;
    description: string;
    pricing: { amount: string; token: string; network: string };
  }>;
  let typoFixed = false;
  for (const c of caps) {
    if (c.description === "Research Wrtie") {
      c.description = "Research Write";
      typoFixed = true;
    }
  }

  // 2. Push the update
  const { error: writeErr } = await sb
    .from("hosted_agents")
    .update({
      system_prompt: NEW_PROMPT,
      capabilities_json: JSON.stringify(caps),
      updated_at: new Date().toISOString(),
    })
    .eq("agent_id", "thread-forge");
  if (writeErr) {
    console.error("Update failed:", writeErr.message);
    process.exit(1);
  }

  console.log("Supabase row updated:");
  console.log(`  system_prompt: ${current.system_prompt?.length ?? 0} chars  ->  ${NEW_PROMPT.length} chars`);
  console.log(`  typo (Research Wrtie -> Research Write): ${typoFixed ? "applied" : "no match - already fixed or different text"}`);
  console.log("");

  // 3. Force the live server to drop its hosted_agents cache. The
  //    /api/agent-card?list=true endpoint calls
  //    loadHostedAgentsFromDb({ force: true }) which clears and
  //    re-reads from Supabase. After this curl, the next /api/task
  //    invocation will use the new prompt.
  console.log("Triggering live cache refresh...");
  const res = await fetch("https://app.aipagents.xyz/api/agent-card?list=true");
  console.log(`  cache refresh status: ${res.status}`);
}
main();
