import { NextRequest, NextResponse } from "next/server";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

seedDemoAgents();

/**
 * POST /api/twin/analyze
 * Analyzes user intent and matches to best agent + capability.
 * Uses Claude Haiku to understand what the user wants.
 *
 * Body: { message: string }
 * Returns: { agent, capability, input, explanation, estimatedCost }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const message = body.message as string;
  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Get all available agents and capabilities
  const agents = listCards();
  const capabilityList = agents.flatMap((a) =>
    a.capabilities.map((c) => ({
      agentName: a.name,
      agentEndpoint: a.endpoint,
      agentDid: a.did,
      capabilityId: c.id,
      description: c.description,
      price: c.pricing.amount,
      walletAddress: a.walletAddress,
    }))
  );

  if (capabilityList.length === 0) {
    return NextResponse.json({
      error: "No agents available. Register agents first.",
    }, { status: 404 });
  }

  // Use Claude Haiku to analyze intent
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const availableCapabilities = capabilityList
    .map((c) => `- ${c.agentName} → ${c.capabilityId} (${c.description}) — ${c.price} USDC`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system:
      "You are a Digital Twin assistant for AIP (Agent Internet Protocol). " +
      "The user gives you a natural language instruction. Your job is to find the best agent and capability to handle it. " +
      "Available agents and capabilities:\n" +
      availableCapabilities +
      "\n\nRespond with ONLY valid JSON in this exact format, nothing else:\n" +
      '{"agentName":"...","capabilityId":"...","input":"...","explanation":"..."}' +
      "\n\nagentName: the agent to use\n" +
      "capabilityId: the capability ID\n" +
      "input: refined task input to send to the agent (improve the user's request if needed)\n" +
      "explanation: short explanation of your choice (1 sentence, in the user's language)",
    messages: [{ role: "user", content: message }],
  });

  const text = response.content[0];
  if (text.type !== "text") {
    return NextResponse.json({ error: "No response from model" }, { status: 500 });
  }

  // Parse the JSON response
  try {
    // Extract JSON from response (in case model wraps it in markdown)
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const plan = JSON.parse(jsonMatch[0]) as {
      agentName: string;
      capabilityId: string;
      input: string;
      explanation: string;
    };

    // Find the matching capability
    const match = capabilityList.find(
      (c) => c.capabilityId === plan.capabilityId && c.agentName === plan.agentName
    ) || capabilityList.find(
      (c) => c.capabilityId === plan.capabilityId
    );

    if (!match) {
      return NextResponse.json({
        error: "Could not match to an available capability",
        plan,
      }, { status: 404 });
    }

    return NextResponse.json({
      agent: {
        name: match.agentName,
        endpoint: match.agentEndpoint,
        did: match.agentDid,
        walletAddress: match.walletAddress,
      },
      capability: {
        id: match.capabilityId,
        description: match.description,
      },
      input: plan.input,
      explanation: plan.explanation,
      estimatedCost: match.price,
    });
  } catch {
    return NextResponse.json({
      error: "Failed to parse model response",
      raw: text.text,
    }, { status: 500 });
  }
}
