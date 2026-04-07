import { NextRequest, NextResponse } from "next/server";
import { listCards, registerCard } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { loadHostedAgentsFromDb, listHostedAgents } from "@/lib/hosted-agents";
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
  // Ensure hosted agents are loaded from Supabase (may not be ready yet from seed)
  await loadHostedAgentsFromDb();
  // Register hosted agent cards (in case async seed didn't finish yet)
  for (const ha of listHostedAgents()) {
    registerCard({
      did: `did:aip:${ha.ownerAddress.slice(0, 8)}:${ha.agentId}`,
      name: ha.name,
      version: "1.0.0",
      endpoint: `http://localhost:3000/api/hosted-agent?agentId=${ha.agentId}`,
      type: "Task",
      walletAddress: ha.ownerAddress,
      capabilities: ha.capabilities.map((c) => ({
        id: c.id,
        description: c.description,
        pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
      })),
    });
  }

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

  // Identify orchestrator agents (can delegate to other agents autonomously)
  const orchestrators = listHostedAgents().filter((a) => a.canOrchestrate);
  const orchestratorInfo = orchestrators.length > 0
    ? "\n\nORCHESTRATOR AGENTS (these agents can internally call other agents — prefer them for complex multi-step tasks):\n" +
      orchestrators.map((o) => {
        const caps = o.capabilities.map((c) => c.id).join(", ");
        return `- ${o.name} [${caps}] — This agent will autonomously plan and delegate sub-tasks to other agents using its own budget. Use as SINGLE mode.`;
      }).join("\n")
    : "";

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      "You are a Digital Twin planner for AIP (Agent Internet Protocol). " +
      "The user gives you a natural language instruction. Decide if it needs ONE agent or MULTIPLE agents in sequence.\n\n" +
      "Available agents and capabilities:\n" + availableCapabilities + orchestratorInfo + "\n\n" +
      "CAPABILITY USAGE GUIDE:\n" +
      "- text.translate: Use for translation tasks. Pass the FULL user message as input (including target language instruction).\n" +
      "- text.summarize: Use for ANY text processing — summarizing, rewriting, extracting info, creating recipes, formatting, analyzing content, answering questions about text. This is the DEFAULT for text tasks.\n" +
      "- text.classify: ONLY returns a JSON category tag (GENERAL/DEFI/GOVERNANCE/etc). Do NOT use for content analysis, recipes, formatting, or any task that needs readable text output. Only use when user explicitly wants a category label.\n" +
      "- web.search: Search the web for current information, prices, news, etc.\n" +
      "- data.retrieve: Fetch structured data from blockchain/APIs (Solana, DeFi protocols).\n" +
      "- code.audit: Analyze smart contract code for security vulnerabilities.\n" +
      "- defi.analyze: Analyze DeFi protocol risks, TVL, yield strategies.\n\n" +
      "CRITICAL RULES:\n" +
      "- **ORCHESTRATOR FIRST**: Before creating any pipeline, check if an ORCHESTRATOR AGENT is listed above. If YES, you MUST use it as a SINGLE step. Do NOT create a pipeline when an orchestrator can handle the task. The orchestrator will internally call other agents. This is MANDATORY.\n" +
      "- If NO orchestrator exists and the task can be done by a single capability, use mode 'single'\n" +
      "- Only use mode 'pipeline' if NO orchestrator agent is available AND multiple steps are truly needed\n" +
      "- Pipeline steps run sequentially — each step's output feeds into the next step's input\n" +
      "- For pipeline step 2+, set inputFromPrev to true (the previous step's result becomes input)\n" +
      "- Keep pipelines to 2-4 steps maximum\n" +
      "- ALWAYS prefer text.summarize over text.classify for processing/transforming text content\n" +
      "- text.classify should NEVER be the final step if the user expects readable content\n" +
      "- IMPORTANT: The 'input' field must contain the COMPLETE user message including all instructions (target language, format requests, etc). Never strip context from the input.\n\n" +
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

    // If pipeline planned and orchestrator exists, build alternative orchestrator option
    let orchestratorAlternative: {
      agentName: string;
      agentEndpoint: string;
      agentDid: string;
      walletAddress: string;
      capabilityId: string;
      capabilityDescription: string;
      estimatedCost: string;
    } | null = null;

    if (plan.mode === "pipeline" && plan.steps.length >= 2 && orchestrators.length > 0) {
      const orch = orchestrators[0];
      const orchCard = capabilityList.find((c) =>
        c.agentName === orch.name && orch.capabilities.some((oc) => oc.id === c.capabilityId)
      );
      if (orchCard) {
        orchestratorAlternative = {
          agentName: orchCard.agentName,
          agentEndpoint: orchCard.agentEndpoint,
          agentDid: orchCard.agentDid,
          walletAddress: orchCard.walletAddress || "",
          capabilityId: orchCard.capabilityId,
          capabilityDescription: orchCard.description,
          estimatedCost: orchCard.price,
        };
      }
    }

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
      orchestratorAlternative: orchestratorAlternative || undefined,
    });
  } catch {
    return NextResponse.json({ error: "Failed to parse model response", raw: text.text }, { status: 500 });
  }
}
