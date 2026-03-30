import { NextRequest, NextResponse } from "next/server";
import { getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { buildPaymentRequirements } from "@/lib/payment/x402";

seedDemoAgents();

/**
 * POST /api/task/quote
 * x402 payment requirements'i dondurur — 402 yerine 200 ile.
 * Client bunu kullanarak odeme hazirlayabilir, sonra /api/task'a X-PAYMENT ile gonderir.
 * Bu sayede browser konsolunda gereksiz 402 hatasi gorunmez.
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

  const requirements = buildPaymentRequirements(
    amount,
    "/api/task",
    `Task: ${capability} via ${agentCard.name}`
  );

  return NextResponse.json({ requirements });
}
