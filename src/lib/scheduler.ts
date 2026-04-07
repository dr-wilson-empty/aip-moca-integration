/**
 * Server-side automation scheduler using node-cron.
 * Runs inside the Next.js server process.
 * Checks automations every minute and executes those that are due.
 */
import cron from "node-cron";
import { getSupabase } from "./supabase/client";
import { listCards } from "./protocol/agent-card-store";
import { executeTask } from "./protocol/a2a-client";
import { seedDemoAgents } from "./protocol/seed-agents";
import { processOnchainAutomations } from "./trigger/onchain-listener";

const SCHEDULE_MS: Record<string, number> = {
  "1min": 60_000,
  "5min": 300_000,
  "hourly": 3_600_000,
  "daily": 86_400_000,
  "weekly": 604_800_000,
};

const gs = globalThis as typeof globalThis & {
  __aip_cron?: boolean;
  __aip_cron_running?: boolean;
};

export function startScheduler() {
  if (gs.__aip_cron) return;
  gs.__aip_cron = true;

  // Run every minute (with concurrency guard to prevent overlapping runs)
  cron.schedule("* * * * *", async () => {
    if (gs.__aip_cron_running) {
      console.log("[cron] Previous run still active — skipping this tick");
      return;
    }
    gs.__aip_cron_running = true;
    try {
      seedDemoAgents();
      const sb = getSupabase();
      const { data: automations } = await sb
        .from("automations")
        .select("*")
        .eq("enabled", true);

      if (!automations?.length) return;

      const now = Date.now();

      // Process schedule-based automations
      for (const auto of automations.filter((a: { trigger_type: string }) => a.trigger_type === "schedule")) {
        const intervalMs = SCHEDULE_MS[auto.schedule] || SCHEDULE_MS.daily;
        const lastRun = auto.last_run ? new Date(auto.last_run).getTime() : 0;

        if (now - lastRun < intervalMs) continue;

        console.log(`[cron] Running automation: ${auto.name}`);

        try {
          await runAutomation(auto, sb);
        } catch (err) {
          console.error(`[cron] Failed: ${auto.name}`, err instanceof Error ? err.message : "");
        }
      }

      // Process on-chain automations (balance monitoring)
      await processOnchainAutomations(
        automations as import("./supabase/automations").DbAutomation[],
        async (auto, triggerSource, contextData) => {
          console.log(`[onchain] Triggered: ${auto.name}`);
          await runOnchainAutomation(auto, sb, contextData || "");
        }
      ).catch((err) => {
        console.error("[onchain] Processing failed:", err instanceof Error ? err.message : "");
      });
    } catch { /* ignore cron errors */ } finally {
      gs.__aip_cron_running = false;
    }
  });

  console.log("[cron] Scheduler started — checking automations every minute");
}

/**
 * On-chain automation: respond directly with Claude (no web search needed).
 * The context data already contains the blockchain event info.
 */
async function runOnchainAutomation(
  auto: { id: string; name: string; prompt: string; total_spent: number; budget_limit: number; run_count: number },
  sb: ReturnType<typeof getSupabase>,
  contextData: string
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a blockchain notification assistant. " +
      "The user set up an automation to be notified about on-chain events. " +
      "Provide a clear, concise notification based on the event data. " +
      "Respond in the same language as the user's prompt.",
    messages: [{
      role: "user",
      content: `Automation: "${auto.prompt}"\n\nEvent: ${contextData}`,
    }],
  });

  const text = response.content[0];
  const artifact = text.type === "text" ? text.text : "No response";

  const resultId = `ares_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  await sb.from("automation_results").insert({
    id: resultId,
    automation_id: auto.id,
    agent_name: "On-chain Listener",
    capability: "blockchain.monitor",
    input: contextData,
    artifact,
    estimated_cost: "0.00",
    status: "completed",
    trigger_source: "onchain",
  });

  await sb.from("automations").update({
    last_run: new Date().toISOString(),
    run_count: auto.run_count + 1,
  }).eq("id", auto.id);

  console.log(`[onchain] Completed: ${auto.name}`);
}

async function runAutomation(
  auto: { id: string; name: string; prompt: string; total_spent: number; budget_limit: number; run_count: number },
  sb: ReturnType<typeof getSupabase>
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  const agents = listCards();
  const capabilityList = agents.flatMap((a) =>
    a.capabilities.map((c) => ({
      agentName: a.name,
      agentEndpoint: a.endpoint,
      capabilityId: c.id,
      description: c.description,
      price: c.pricing.amount,
    }))
  );

  if (capabilityList.length === 0) return;

  // Analyze with Haiku
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const caps = capabilityList
    .map((c) => `- ${c.agentName} → ${c.capabilityId} (${c.description}) — ${c.price} USDC`)
    .join("\n");

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a task planner. Pick the best agent and capability.\nAvailable:\n" + caps +
      '\n\nRespond with ONLY JSON: {"agentName":"...","capabilityId":"...","input":"..."}',
    messages: [{ role: "user", content: auto.prompt }],
  });

  const text = res.content[0];
  if (text.type !== "text") return;

  const jsonMatch = text.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return;

  const plan = JSON.parse(jsonMatch[0]) as { agentName: string; capabilityId: string; input: string };
  const match = capabilityList.find((c) => c.capabilityId === plan.capabilityId) || capabilityList[0];

  const estimatedCost = parseFloat(match.price);
  if (auto.total_spent + estimatedCost > auto.budget_limit) {
    console.log(`[cron] Budget exceeded for ${auto.name}: ${auto.total_spent}/${auto.budget_limit}`);
    return;
  }

  const result = await executeTask(match.agentEndpoint, match.capabilityId, plan.input, undefined, 500, 60);

  const resultId = `ares_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  await sb.from("automation_results").insert({
    id: resultId,
    automation_id: auto.id,
    agent_name: match.agentName,
    capability: match.description,
    input: plan.input,
    artifact: result.artifact ?? result.error ?? "",
    estimated_cost: match.price,
    status: result.status === "COMPLETED" ? "completed" : "failed",
  });

  await sb.from("automations").update({
    last_run: new Date().toISOString(),
    total_spent: auto.total_spent + (result.status === "COMPLETED" ? estimatedCost : 0),
    run_count: auto.run_count + 1,
  }).eq("id", auto.id);

  console.log(`[cron] Completed: ${auto.name} → ${match.agentName}`);
}
