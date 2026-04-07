import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/solana/connection";
import { createAndExecuteChain, getChain, listChains } from "@/lib/protocol/chain-executor";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { dbGetBudgetsByOwner } from "@/lib/supabase/agent-budgets";
import type { ChainStep } from "@/types/aip";

seedDemoAgents();

/**
 * GET /api/chain?id=xxx     — get chain status (poll for progress)
 * GET /api/chain?caller=xxx — list chains for a caller
 */
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const caller = request.nextUrl.searchParams.get("caller");

  if (id) {
    const chain = getChain(id);
    if (!chain) {
      return NextResponse.json({ error: "Chain not found" }, { status: 404 });
    }
    return NextResponse.json({ chain });
  }

  if (caller) {
    const all = listChains().filter((c) => c.callerAddress === caller);
    return NextResponse.json({ chains: all });
  }

  return NextResponse.json({ error: "id or caller required" }, { status: 400 });
}

/**
 * POST /api/chain
 * Create and execute an autonomous chain.
 *
 * The user has already paid the total cost via a single on-chain transfer
 * to the platform authority wallet. The depositTxHash proves this.
 *
 * Body: {
 *   callerAddress: string,
 *   callerDid: string,
 *   steps: ChainStep[],
 *   totalCost: string,
 *   depositTxHash: string,
 * }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callerAddress = body.callerAddress as string | undefined;
  const callerDid = body.callerDid as string | undefined;
  const steps = body.steps as ChainStep[] | undefined;
  const totalCost = body.totalCost as string | undefined;
  const depositTxHash = body.depositTxHash as string | undefined;

  if (!callerAddress || !callerDid || !steps?.length || !totalCost || !depositTxHash) {
    return NextResponse.json(
      { error: "callerAddress, callerDid, steps, totalCost, depositTxHash required" },
      { status: 400 }
    );
  }

  // Autonomous mode: find budget to fund this pipeline
  // Twin pipelines are USER actions — use any budget owned by the user
  let budgetAgentDid: string | undefined;
  if (depositTxHash === "autonomous-mode") {
    const budgets = await dbGetBudgetsByOwner(callerAddress);
    const totalNeeded = parseFloat(totalCost);

    if (budgets.length === 0) {
      return NextResponse.json(
        { error: `No budget found. Deposit USDC into one of your agents in My Agents first.` },
        { status: 402 }
      );
    }

    // Prefer: 1) matching step agent budget, 2) any budget with enough balance
    const stepAgentDids = new Set(steps.map((s) => s.agentDid));
    const matchingBudget = budgets.find((b) => stepAgentDids.has(b.agent_did) && b.balance >= totalNeeded);

    if (matchingBudget) {
      budgetAgentDid = matchingBudget.agent_did;
    } else {
      // Use any budget with enough balance (user's general funds)
      const sufficient = budgets.sort((a, b) => b.balance - a.balance).find((b) => b.balance >= totalNeeded);
      if (!sufficient) {
        const totalAvailable = budgets.reduce((s, b) => s + b.balance, 0);
        return NextResponse.json(
          { error: `Insufficient budget: ${totalAvailable.toFixed(2)} USDC available across your agents, ${totalNeeded.toFixed(2)} USDC needed.` },
          { status: 402 }
        );
      }
      budgetAgentDid = sufficient.agent_did;
    }
  }

  // Verify the deposit transaction exists on-chain (non-autonomous mode)
  if (depositTxHash !== "autonomous-mode") {
    try {
      const connection = getConnection();
      const txInfo = await connection.getTransaction(depositTxHash, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });

      if (!txInfo) {
        return NextResponse.json(
          { error: "Deposit transaction not found or not confirmed" },
          { status: 400 }
        );
      }

      if (txInfo.meta?.err) {
        return NextResponse.json(
          { error: `Deposit transaction failed: ${JSON.stringify(txInfo.meta.err)}` },
          { status: 400 }
        );
      }
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to verify deposit: ${err instanceof Error ? err.message : String(err)}` },
        { status: 400 }
      );
    }
  }

  // Create and start the chain (runs in background)
  const chain = createAndExecuteChain({
    callerAddress,
    callerDid,
    steps,
    totalCost,
    depositTxHash,
    budgetAgentDid,
  });

  return NextResponse.json({ ok: true, chain }, { status: 201 });
}
