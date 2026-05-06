/**
 * Server-side automation scheduler using node-cron.
 * Runs inside the Next.js server process.
 * Checks automations every minute and executes those that are due.
 *
 * Payment: Automations are funded by the user's orchestrator budget.
 * Each run reserves cost from budget before executing.
 */
import cron from "node-cron";
import { getSupabase } from "./supabase/client";
import { listCards } from "./protocol/agent-card-store";
import { executeTask } from "./protocol/a2a-client";
import { seedDemoAgents } from "./protocol/seed-agents";
import { processOnchainAutomations } from "./trigger/onchain-listener";
import { getExpiredEscrows, refundEscrow } from "./payment/escrow";
import { reserveBudget, refundBudget, getAgentBudget } from "./payment/agent-budget";
import { getOrchestratorId } from "./orchestrator/default-orchestrator";
import { canonicalAgentDid } from "./identity/canonical-did";

const SCHEDULE_MS: Record<string, number> = {
  "1min": 60_000,
  "2min": 120_000,
  "5min": 300_000,
  "hourly": 3_600_000,
  "daily": 86_400_000,
  "weekly": 604_800_000,
};

const ORCHESTRATION_FEE = 0.05;

const gs = globalThis as typeof globalThis & {
  __aip_cron?: boolean;
  __aip_cron_running_ids?: Set<string>;
};

export function startScheduler() {
  if (gs.__aip_cron) return;
  gs.__aip_cron = true;

  if (!gs.__aip_cron_running_ids) gs.__aip_cron_running_ids = new Set();
  const runningIds = gs.__aip_cron_running_ids;

  // Run every minute — per-automation concurrency guard (not global)
  cron.schedule("* * * * *", async () => {
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
        if (runningIds.has(auto.id)) continue;

        const intervalMs = SCHEDULE_MS[auto.schedule] || SCHEDULE_MS.daily;
        const lastRun = auto.last_run ? new Date(auto.last_run).getTime() : 0;

        if (now - lastRun < intervalMs) continue;

        console.log(`[cron] Running automation: ${auto.name}`);
        runningIds.add(auto.id);

        runAutomation(auto, sb)
          .catch((err) => console.error(`[cron] Failed: ${auto.name}`, err instanceof Error ? err.message : ""))
          .finally(() => runningIds.delete(auto.id));
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

      // Auto-refund expired escrows (locked > 1 hour)
      const expired = getExpiredEscrows(3_600_000);
      for (const esc of expired) {
        try {
          await refundEscrow(esc.taskId);
          console.log(`[cron] Auto-refunded expired escrow: ${esc.taskId} (${esc.amount} USDC)`);
        } catch (err) {
          console.error(`[cron] Auto-refund failed for ${esc.taskId}:`, err instanceof Error ? err.message : "");
        }
      }
    } catch { /* ignore cron errors */ }
  });

  console.log("[cron] Scheduler started — checking automations every minute");
}

/**
 * On-chain automation: respond directly with Claude (no web search needed).
 */
async function runOnchainAutomation(
  auto: { id: string; name: string; prompt: string; total_spent: number; budget_limit: number; run_count: number; wallet_address: string },
  sb: ReturnType<typeof getSupabase>,
  contextData: string
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // Check orchestrator budget
  const orchDid = getOrchestratorDid(auto.wallet_address);
  const budget = await getAgentBudget(orchDid);
  if (!budget || budget.balance < ORCHESTRATION_FEE) {
    console.log(`[onchain] No budget for ${auto.name} (wallet: ${auto.wallet_address.slice(0, 8)}...)`);
    return;
  }

  // Reserve fee from budget
  const taskId = `auto_oc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await reserveBudget(orchDid, ORCHESTRATION_FEE, taskId, "automation-onchain");
  } catch (err) {
    console.log(`[onchain] Budget reserve failed for ${auto.name}: ${err instanceof Error ? err.message : ""}`);
    return;
  }

  try {
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
      estimated_cost: ORCHESTRATION_FEE.toFixed(2),
      status: "completed",
    });

    await sb.from("automations").update({
      last_run: new Date().toISOString(),
      total_spent: auto.total_spent + ORCHESTRATION_FEE,
      run_count: auto.run_count + 1,
    }).eq("id", auto.id);

    console.log(`[onchain] Completed: ${auto.name} (${ORCHESTRATION_FEE} USDC from budget)`);
  } catch (err) {
    // Refund on failure
    await refundBudget(orchDid, ORCHESTRATION_FEE, taskId).catch(() => {});
    console.error(`[onchain] Failed: ${auto.name}`, err instanceof Error ? err.message : "");
  }
}

/**
 * Run a schedule-based automation. Pays from orchestrator budget.
 */
async function runAutomation(
  auto: { id: string; name: string; prompt: string; total_spent: number; budget_limit: number; run_count: number; wallet_address: string },
  sb: ReturnType<typeof getSupabase>
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // 1. Find orchestrator budget for this user
  const orchDid = getOrchestratorDid(auto.wallet_address);
  const budget = await getAgentBudget(orchDid);
  if (!budget || budget.balance <= 0) {
    console.log(`[cron] No orchestrator budget for ${auto.name} (wallet: ${auto.wallet_address.slice(0, 8)}...)`);
    return;
  }

  // 2. Plan which agent to call
  // Filter: only platform agents (demo/web-search) and the automation owner's own agents.
  // Prevents cross-wallet orchestrator leakage during scheduled runs.
  const agents = listCards().filter(
    (a) => a.did.startsWith("did:aip:platform:") || a.walletAddress === auto.wallet_address
  );
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

  // 3. Calculate total cost (agent fee + orchestration fee)
  const agentCost = parseFloat(match.price);
  const totalCost = agentCost + ORCHESTRATION_FEE;

  // 4. Check automation budget limit
  if (auto.total_spent + totalCost > auto.budget_limit) {
    console.log(`[cron] Budget limit for ${auto.name}: spent=${auto.total_spent.toFixed(2)} + cost=${totalCost.toFixed(2)} > limit=${auto.budget_limit}`);
    return;
  }

  // 5. Check orchestrator budget has enough
  if (budget.balance < totalCost) {
    console.log(`[cron] Orchestrator budget low for ${auto.name}: balance=${budget.balance.toFixed(2)} < cost=${totalCost.toFixed(2)}`);
    return;
  }

  // 6. Reserve from orchestrator budget
  const taskId = `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await reserveBudget(orchDid, totalCost, taskId, `automation:${match.agentName}`);
    console.log(`[cron] Budget reserved for ${auto.name}: ${totalCost.toFixed(2)} USDC`);
  } catch (err) {
    console.log(`[cron] Budget reserve failed for ${auto.name}: ${err instanceof Error ? err.message : ""}`);
    return;
  }

  // 7. Execute agent
  try {
    const result = await executeTask(match.agentEndpoint, match.capabilityId, plan.input, undefined, 500, 60);

    const resultId = `ares_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await sb.from("automation_results").insert({
      id: resultId,
      automation_id: auto.id,
      agent_name: match.agentName,
      capability: match.description,
      input: plan.input,
      artifact: result.artifact ?? result.error ?? "",
      estimated_cost: totalCost.toFixed(2),
      status: result.status === "COMPLETED" ? "completed" : "failed",
    });

    if (result.status !== "COMPLETED") {
      // Refund budget on agent failure
      await refundBudget(orchDid, totalCost, taskId).catch(() => {});
      console.log(`[cron] Agent failed, budget refunded for ${auto.name}`);
    }

    await sb.from("automations").update({
      last_run: new Date().toISOString(),
      total_spent: auto.total_spent + (result.status === "COMPLETED" ? totalCost : 0),
      run_count: auto.run_count + 1,
    }).eq("id", auto.id);

    console.log(`[cron] Completed: ${auto.name} → ${match.agentName} (${totalCost.toFixed(2)} USDC from budget)`);
  } catch (err) {
    // Refund on execution error
    await refundBudget(orchDid, totalCost, taskId).catch(() => {});
    throw err;
  }
}

/** Helper: get orchestrator DID for a wallet */
function getOrchestratorDid(walletAddress: string): string {
  const orchId = getOrchestratorId(walletAddress);
  return canonicalAgentDid(walletAddress, orchId);
}
