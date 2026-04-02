import { NextRequest, NextResponse } from "next/server";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { dbGetPreferences } from "@/lib/supabase/preferences";

seedDemoAgents();

/**
 * POST /api/twin/analyze
 * Analyzes user intent — returns single task or multi-step pipeline.
 *
 * Body: { message: string }
 * Returns: { mode: "single"|"pipeline", steps: [...], explanation, totalCost }
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
  const walletAddress = body.walletAddress as string | undefined;
  if (!message?.trim()) {
    return NextResponse.json({ error: "message required" }, { status: 400 });
  }

  // Load user preferences for personalization
  let prefsContext = "";
  if (walletAddress) {
    try {
      const prefs = await dbGetPreferences(walletAddress);
      const parts: string[] = [];
      if (prefs.language && prefs.language !== "auto") {
        parts.push(`User prefers responses in ${prefs.language === "tr" ? "Turkish" : "English"}.`);
      }
      if (prefs.detail_level === "short") parts.push("User prefers short, concise responses.");
      if (prefs.detail_level === "detailed") parts.push("User prefers detailed, comprehensive responses.");
      if (prefs.favorite_agents.length > 0) {
        parts.push(`User's favorite agents (prefer these): ${prefs.favorite_agents.join(", ")}.`);
      }
      if (prefs.custom_instructions) {
        parts.push(`User's custom instructions: ${prefs.custom_instructions}`);
      }
      if (parts.length > 0) prefsContext = "\n\nUSER PREFERENCES:\n" + parts.join("\n");
    } catch { /* ignore */ }
  }

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
    return NextResponse.json({ error: "No agents available." }, { status: 404 });
  }

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
    max_tokens: 1024,
    system:
      "You are a Digital Twin planner for AIP (Agent Internet Protocol). " +
      "The user gives you a natural language instruction. Decide if it needs ONE agent or MULTIPLE agents in sequence.\n\n" +
      "Available agents and capabilities:\n" + availableCapabilities + "\n\n" +
      "RULES:\n" +
      "- If the task can be done by a single capability, use mode 'single'\n" +
      "- If the task needs multiple steps (e.g. 'fetch data then summarize', 'analyze and compare', 'get info about X and audit it'), use mode 'pipeline'\n" +
      "- Pipeline steps run sequentially — each step's output feeds into the next step's input\n" +
      "- For pipeline step 2+, set inputFromPrev to true (the previous step's result becomes input)\n" +
      "- Keep pipelines to 2-4 steps maximum\n\n" +
      "Respond with ONLY valid JSON:\n\n" +
      "Single mode:\n" +
      '{"mode":"single","steps":[{"agentName":"...","capabilityId":"...","input":"...","label":"..."}],"explanation":"..."}\n\n' +
      "Pipeline mode:\n" +
      '{"mode":"pipeline","steps":[{"agentName":"...","capabilityId":"...","input":"...","label":"Step 1: ..."},{"agentName":"...","capabilityId":"...","inputFromPrev":true,"label":"Step 2: ..."}],"explanation":"..."}\n\n' +
      "explanation: short description in the user's language" +
      prefsContext,
    messages: [{ role: "user", content: message }],
  });

  const text = response.content[0];
  if (text.type !== "text") {
    return NextResponse.json({ error: "No response from model" }, { status: 500 });
  }

  try {
    const jsonMatch = text.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");

    const plan = JSON.parse(jsonMatch[0]) as {
      mode: "single" | "pipeline";
      steps: Array<{
        agentName: string;
        capabilityId: string;
        input?: string;
        inputFromPrev?: boolean;
        label: string;
      }>;
      explanation: string;
    };

    // Resolve each step to actual agents
    const resolvedSteps = plan.steps.map((step) => {
      const match = capabilityList.find(
        (c) => c.capabilityId === step.capabilityId && c.agentName === step.agentName
      ) || capabilityList.find(
        (c) => c.capabilityId === step.capabilityId
      );

      if (!match) return null;

      return {
        agentName: match.agentName,
        agentEndpoint: match.agentEndpoint,
        agentDid: match.agentDid,
        walletAddress: match.walletAddress,
        capabilityId: match.capabilityId,
        capabilityDescription: match.description,
        input: step.input || "",
        inputFromPrev: step.inputFromPrev || false,
        estimatedCost: match.price,
        label: step.label,
      };
    }).filter(Boolean);

    if (resolvedSteps.length === 0) {
      return NextResponse.json({ error: "Could not match to available capabilities" }, { status: 404 });
    }

    const totalCost = resolvedSteps
      .reduce((sum, s) => sum + parseFloat(s!.estimatedCost), 0)
      .toFixed(2);

    return NextResponse.json({
      mode: plan.mode,
      steps: resolvedSteps,
      explanation: plan.explanation,
      totalCost,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse model response", raw: text.text }, { status: 500 });
  }
}
