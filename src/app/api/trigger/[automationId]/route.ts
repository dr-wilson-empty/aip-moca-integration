import { NextRequest, NextResponse } from "next/server";
import {
  dbGetAutomation,
  dbUpdateAutomation,
  dbInsertResult,
} from "@/lib/supabase/automations";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { executeTask } from "@/lib/protocol/a2a-client";
import {
  verifyWebhookSignature,
  checkRateLimit,
} from "@/lib/trigger/webhook";
import { logger } from "@/lib/logger";
import { reserveBudget, refundBudget, getAgentBudget } from "@/lib/payment/agent-budget";
import { getOrchestratorId } from "@/lib/orchestrator/default-orchestrator";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";

seedDemoAgents();

/**
 * POST /api/trigger/[automationId]
 *
 * Webhook trigger endpoint. External systems POST here to trigger an automation.
 * Requires HMAC signature in X-Webhook-Signature header.
 *
 * Optional body: { data: ... } — passed as context to the agent prompt.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ automationId: string }> }
) {
  seedDemoAgents();

  const { automationId } = await params;

  // 1. Get automation
  const auto = await dbGetAutomation(automationId);
  if (!auto) {
    return NextResponse.json({ error: "Automation not found" }, { status: 404 });
  }

  if (!auto.enabled) {
    return NextResponse.json({ error: "Automation is disabled" }, { status: 400 });
  }

  if (auto.trigger_type !== "webhook") {
    return NextResponse.json({ error: "Automation is not webhook-triggered" }, { status: 400 });
  }

  // 2. Read raw body with size limit (100KB max to prevent OOM)
  const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
  if (contentLength > 102_400) {
    return NextResponse.json({ error: "Payload too large (max 100KB)" }, { status: 413 });
  }
  const rawBody = await request.text();
  if (rawBody.length > 102_400) {
    return NextResponse.json({ error: "Payload too large (max 100KB)" }, { status: 413 });
  }

  // 3. Verify HMAC signature
  if (auto.webhook_secret) {
    const sigHeader =
      request.headers.get("x-webhook-signature") ||
      request.headers.get("x-hub-signature-256") ||
      request.headers.get("x-signature");

    const verification = verifyWebhookSignature(rawBody, sigHeader, auto.webhook_secret);
    if (!verification.valid) {
      logger.error("webhook", "signature_failed", {
        automationId,
        error: verification.error,
      });
      return NextResponse.json({ error: verification.error }, { status: 401 });
    }
  }

  // 4. Rate limit check
  const rateCheck = checkRateLimit(auto);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Rate limited", retryAfterMs: rateCheck.retryAfterMs },
      { status: 429 }
    );
  }

  logger.info("webhook", "triggered", { automationId, name: auto.name });

  // 5. Budget check BEFORE Claude call — don't waste API credits on broke accounts
  const orchId = getOrchestratorId(auto.wallet_address);
  const orchDid = canonicalAgentDid(auto.wallet_address, orchId);
  const budget = await getAgentBudget(orchDid);
  if (!budget || budget.balance <= 0) {
    await dbUpdateAutomation(automationId, { enabled: false });
    logger.info("webhook", "no_budget_disabled", { automationId });
    return NextResponse.json({ error: "No orchestrator budget. Automation disabled." }, { status: 402 });
  }

  // 6. Parse webhook payload for context
  let webhookData = "";
  try {
    const parsed = JSON.parse(rawBody);
    webhookData = typeof parsed.data === "string"
      ? parsed.data
      : JSON.stringify(parsed.data || parsed);
  } catch {
    webhookData = rawBody.slice(0, 1000); // Use raw body as context if not JSON
  }

  const ORCHESTRATION_FEE = 0.05;

  // 7. Analyze intent with Haiku
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  // Filter: only platform agents (demo/web-search) and the automation owner's own agents.
  // Prevents cross-wallet orchestrator leakage from webhook-triggered runs.
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

  // Include webhook data as context in the prompt
  const enrichedPrompt = webhookData
    ? `${auto.prompt}\n\nWebhook context data:\n${webhookData}`
    : auto.prompt;

  const analyzeRes = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a task planner. Given the user's automation prompt (which may include webhook context data), pick the best agent and capability.\n" +
      "Available:\n" + availableCaps + "\n\n" +
      'Respond with ONLY JSON: {"agentName":"...","capabilityId":"...","input":"..."}',
    messages: [{ role: "user", content: enrichedPrompt }],
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

  // 8. Reserve from orchestrator budget
  const agentCost = parseFloat(match.price);
  const totalCost = agentCost + ORCHESTRATION_FEE;

  if (budget!.balance < totalCost) {
    await dbUpdateAutomation(automationId, { enabled: false });
    logger.info("webhook", "budget_insufficient_disabled", { automationId, balance: budget!.balance, needed: totalCost });
    return NextResponse.json({ error: `Insufficient orchestrator budget: have ${budget!.balance.toFixed(2)}, need ${totalCost.toFixed(2)} USDC` }, { status: 402 });
  }

  if (auto.total_spent + totalCost > auto.budget_limit) {
    await dbUpdateAutomation(automationId, { enabled: false });
    logger.info("webhook", "automation_limit_disabled", { automationId });
    return NextResponse.json({ error: `Automation budget limit reached: ${auto.total_spent.toFixed(2)} / ${auto.budget_limit.toFixed(2)} USDC` }, { status: 402 });
  }

  const taskId = `whk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  try {
    await reserveBudget(orchDid, totalCost, taskId, `webhook:${match.agentName}`);
  } catch (err) {
    return NextResponse.json({ error: `Budget reserve failed: ${err instanceof Error ? err.message : "Unknown"}` }, { status: 402 });
  }

  // 9. Execute agent
  try {
    const result = await executeTask(
      match.agentEndpoint,
      match.capabilityId,
      plan.input,
      undefined,
      500,
      60
    );

    const resultId = `wres_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    await dbInsertResult({
      id: resultId,
      automation_id: automationId,
      agent_name: match.agentName,
      capability: match.description,
      input: plan.input,
      artifact: result.artifact ?? result.error ?? "",
      estimated_cost: totalCost.toFixed(2),
      status: result.status === "COMPLETED" ? "completed" : "failed",
      trigger_source: "webhook",
    });

    if (result.status !== "COMPLETED") {
      await refundBudget(orchDid, totalCost, taskId).catch(() => {});
    }

    // Update automation stats + last_trigger_at for rate limiting
    await dbUpdateAutomation(automationId, {
      last_run: new Date().toISOString(),
      last_trigger_at: new Date().toISOString(),
      total_spent: auto.total_spent + (result.status === "COMPLETED" ? totalCost : 0),
      run_count: auto.run_count + 1,
    });

    logger.info("webhook", "completed", {
      automationId,
      agentName: match.agentName,
      status: result.status,
    });

    return NextResponse.json({
      ok: true,
      result: {
        id: resultId,
        agentName: match.agentName,
        capability: match.description,
        artifact: result.artifact,
        status: result.status,
      },
    });
  } catch (err) {
    await refundBudget(orchDid, totalCost, taskId).catch(() => {});
    logger.error("webhook", "execution_failed", {
      automationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({
      error: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
