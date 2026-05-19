import { NextRequest, NextResponse } from "next/server";
import {
  dbGetAutomation,
  dbUpdateAutomation,
  dbInsertResult,
} from "@/lib/supabase/automations";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { executeTask } from "@/lib/protocol/a2a-client";
import { reserveBudget, refundBudget, getAgentBudget } from "@/lib/payment/agent-budget";
import { getOrchestratorId } from "@/lib/orchestrator/default-orchestrator";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";

seedDemoAgents();

const ORCHESTRATION_FEE = 0.05;

/**
 * POST /api/automations/run
 * Execute an automation manually. Pays from orchestrator budget.
 *
 * Body: { automationId: string }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const automationId = body.automationId as string;
  if (!automationId) {
    return NextResponse.json({ error: "automationId required" }, { status: 400 });
  }

  const auto = await dbGetAutomation(automationId);
  if (!auto) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  if (!auto.enabled) {
    return NextResponse.json({ error: "Automation is disabled" }, { status: 400 });
  }

  // 1. Check orchestrator budget
  const orchId = getOrchestratorId(auto.wallet_address);
  const orchDid = canonicalAgentDid(auto.wallet_address, orchId);
  const budget = await getAgentBudget(orchDid);

  if (!budget || budget.balance <= 0) {
    return NextResponse.json({
      error: "No orchestrator budget. Deposit USDC to your Orchestrator Agent in My Agents first.",
    }, { status: 402 });
  }

  // 2. Plan which agent to call
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  // Filter: only platform agents (demo/web-search) and the automation owner's own agents.
  // Prevents cross-wallet orchestrator leakage where the planner could pick another user's
  // orchestrator and trigger a budget lookup against a wallet that has no funds.
  const { isPlatformAgent } = await import("@/lib/identity/canonical-did");
  const agents = listCards().filter(
    (a) => isPlatformAgent(a) || a.walletAddress === auto.wallet_address
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

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const availableCaps = capabilityList
    .map((c) => `- ${c.agentName} → ${c.capabilityId} (${c.description}) — ${c.price} USDC`)
    .join("\n");

  const analyzeRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a task planner. Given the user's automation prompt, pick the best agent and capability.\n" +
      "Available:\n" + availableCaps + "\n\n" +
      'Respond with ONLY JSON: {"agentName":"...","capabilityId":"...","input":"..."}',
    messages: [{ role: "user", content: auto.prompt }],
  });

  const text = analyzeRes.content[0];
  if (text.type !== "text") {
    return NextResponse.json({ error: "No response from model" }, { status: 500 });
  }

  let plan: { agentName: string; capabilityId: string; input: string };
  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    plan = JSON.parse(jsonMatch[0]);
  } catch {
    return NextResponse.json({ error: "Failed to parse plan", raw: text.text }, { status: 500 });
  }

  const match = capabilityList.find(
    (c) => c.capabilityId === plan.capabilityId && c.agentName === plan.agentName
  ) || capabilityList.find((c) => c.capabilityId === plan.capabilityId);

  if (!match) {
    return NextResponse.json({ error: "No matching capability" }, { status: 404 });
  }

  // 3. Calculate cost and check budget
  const agentCost = parseFloat(match.price);
  const totalCost = agentCost + ORCHESTRATION_FEE;

  if (budget.balance < totalCost) {
    return NextResponse.json({
      error: `Insufficient orchestrator budget: have ${budget.balance.toFixed(2)} USDC, need ${totalCost.toFixed(2)} USDC`,
    }, { status: 402 });
  }

  // Budget limit check
  if (auto.total_spent + totalCost > auto.budget_limit) {
    return NextResponse.json({
      error: `Automation budget limit reached: spent ${auto.total_spent.toFixed(2)} / limit ${auto.budget_limit.toFixed(2)} USDC`,
    }, { status: 400 });
  }

  // 4. Reserve from orchestrator budget
  const taskId = `auto_run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await reserveBudget(orchDid, totalCost, taskId, `automation:${match.agentName}`);
  } catch (err) {
    return NextResponse.json({
      error: `Budget reserve failed: ${err instanceof Error ? err.message : "Unknown"}`,
    }, { status: 402 });
  }

  // 5. Execute agent
  try {
    const result = await executeTask(
      match.agentEndpoint,
      match.capabilityId,
      plan.input,
      undefined,
      500,
      60
    );

    const resultId = `ares_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await dbInsertResult({
      id: resultId,
      automation_id: automationId,
      agent_name: match.agentName,
      capability: match.description,
      input: plan.input,
      artifact: result.artifact ?? result.error ?? "",
      estimated_cost: totalCost.toFixed(2),
      status: result.status === "COMPLETED" ? "completed" : "failed",
    });

    if (result.status !== "COMPLETED") {
      await refundBudget(orchDid, totalCost, taskId).catch(() => {});
    }

    await dbUpdateAutomation(automationId, {
      last_run: new Date().toISOString(),
      total_spent: auto.total_spent + (result.status === "COMPLETED" ? totalCost : 0),
      run_count: auto.run_count + 1,
    });

    return NextResponse.json({
      ok: true,
      result: {
        id: resultId,
        agentName: match.agentName,
        capability: match.description,
        artifact: result.artifact,
        status: result.status,
        cost: totalCost.toFixed(2),
      },
    });
  } catch (err) {
    await refundBudget(orchDid, totalCost, taskId).catch(() => {});
    return NextResponse.json({
      error: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
