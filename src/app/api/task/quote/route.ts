import { NextRequest, NextResponse } from "next/server";
import { getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { buildPaymentRequirements } from "@/lib/payment/x402";

seedDemoAgents();

/**
 * POST /api/task/quote
 * x402 payment requirements'i dondurur — 402 yerine 200 ile.
 * Artik escrow program bilgisi ve pre-generated taskId de dondurur.
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

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
