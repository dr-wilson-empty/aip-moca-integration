import { NextRequest, NextResponse } from "next/server";
import { getCardByEndpoint, registerCard } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { loadHostedAgentsFromDb, listHostedAgents } from "@/lib/hosted-agents";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { getAppUrl } from "@/lib/config/app-url";
import { buildPaymentRequirements } from "@/lib/payment/x402";

seedDemoAgents();

/**
 * POST /api/task/quote
 * x402 payment requirements'i dondurur — 402 yerine 200 ile.
 * Artik escrow program bilgisi ve pre-generated taskId de dondurur.
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();
  // Ensure all hosted agents (including user-created) are in card store
  await loadHostedAgentsFromDb();
  const base = getAppUrl();
  for (const ha of listHostedAgents()) {
    registerCard({
      did: canonicalAgentDid(ha.ownerAddress, ha.agentId),
      name: ha.name,
      description: ha.description || undefined,
      version: "1.0.0",
      endpoint: `${base}/api/hosted-agent?agentId=${ha.agentId}`,
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

  const { agentEndpoint, capability, amount } = body as {
    agentEndpoint?: string;
    capability?: string;
    amount?: string;
  };

  if (!agentEndpoint || !capability || !amount) {
    return NextResponse.json(
      { error: "Required: agentEndpoint, capability, amount" },
      { status: 400 }
    );
  }

  const agentCard = getCardByEndpoint(agentEndpoint);
  if (!agentCard) {
    return NextResponse.json(
      { error: "Agent not found", agentEndpoint },
      { status: 404 }
    );
  }

  // Validate the capability exists on the agent and the requested
  // amount matches the agent's advertised price for it. Without this
  // check a caller could quote a 0.75 USDC capability at 0.01 USDC,
  // sign an escrow for 0.01, and still receive the work — server
  // would pay agent commission out of the missing 0.74.
  const cap = agentCard.capabilities.find((c) => c.id === capability);
  if (!cap) {
    return NextResponse.json(
      { error: `Capability '${capability}' not advertised by agent`, available: agentCard.capabilities.map((c) => c.id) },
      { status: 400 },
    );
  }
  const advertised = parseFloat(cap.pricing.amount);
  const requested = parseFloat(amount);
  if (!Number.isFinite(requested) || requested <= 0) {
    return NextResponse.json({ error: "amount must be a positive USDC number" }, { status: 400 });
  }
  if (requested + 1e-9 < advertised) {
    return NextResponse.json(
      {
        error: `Amount ${requested} USDC is below the advertised price ${advertised} USDC for '${capability}'`,
      },
      { status: 400 },
    );
  }

  // Pre-generate taskId — client needs this for PDA derivation
  const taskId = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const requirements = buildPaymentRequirements(
    amount,
    "/api/task",
    `Task: ${capability} via ${agentCard.name}`,
    taskId,
    agentCard.walletAddress ?? ""
  );

  return NextResponse.json({ requirements, taskId });
}
