import { NextRequest, NextResponse } from "next/server";
import {
  dbGetAutomation,
  dbUpdateAutomation,
  dbInsertResult,
} from "@/lib/supabase/automations";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { executeTask } from "@/lib/protocol/a2a-client";

seedDemoAgents();

/**
 * POST /api/automations/run
 * Execute an automation — analyze intent, call agent directly (no escrow).
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

  // Analyze intent with Haiku
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

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

  // Reset budget if period has elapsed
  const periodMs = auto.budget_period === "weekly" ? 604_800_000 : 86_400_000;
  const lastRun = auto.last_run ? new Date(auto.last_run).getTime() : 0;
  if (Date.now() - lastRun > periodMs && auto.total_spent > 0) {
    auto.total_spent = 0;
    const sb = (await import("@/lib/supabase/client")).getSupabase();
    await sb.from("automations").update({ total_spent: 0 }).eq("id", auto.id);
  }

  // Budget check
  const estimatedCost = parseFloat(match.price);
  if (auto.total_spent + estimatedCost > auto.budget_limit) {
    return NextResponse.json({
      error: `Budget exceeded: spent ${auto.total_spent.toFixed(2)} / limit ${auto.budget_limit.toFixed(2)} USDC`,
    }, { status: 400 });
  }

  // Execute directly via A2A (no escrow — autonomous mode)
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
      estimated_cost: match.price,
      status: result.status === "COMPLETED" ? "completed" : "failed",
    });

    // Update automation stats
    await dbUpdateAutomation(automationId, {
      last_run: new Date().toISOString(),
      total_spent: auto.total_spent + (result.status === "COMPLETED" ? estimatedCost : 0),
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
        estimatedCost: match.price,
      },
    });
  } catch (err) {
    return NextResponse.json({
      error: `Agent execution failed: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
