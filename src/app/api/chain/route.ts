import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/solana/connection";
import { createAndExecuteChain, getChain, listChains } from "@/lib/protocol/chain-executor";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { dbGetBudgetsByOwner } from "@/lib/supabase/agent-budgets";
import { getOrchestratorId } from "@/lib/orchestrator/default-orchestrator";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
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

  // Autonomous mode: orchestrator's budget pays for ALL steps.
  // The user's default orchestrator budget is used as the funding source.
  // Authority wallet creates escrows on-chain, budget is the accounting layer.
  let budgetAgentDid: string | undefined;
  if (depositTxHash === "autonomous-mode") {
    // Find the user's default orchestrator budget
    const orchId = getOrchestratorId(callerAddress);
    const orchDid = canonicalAgentDid(callerAddress, orchId);
    const budgets = await dbGetBudgetsByOwner(callerAddress);

    // Prefer default orchestrator budget, fallback to any orchestrator budget with balance
    const orchBudget = budgets.find((b) => b.agent_did === orchDid && b.balance > 0);
    const anyBudget = budgets.find((b) => b.balance > 0);
    const matchingBudget = orchBudget || anyBudget;

    if (!matchingBudget || matchingBudget.balance <= 0) {
      return NextResponse.json(
        { error: "Orchestrator budget is empty. Deposit USDC to your Orchestrator Agent budget in My Agents." },
        { status: 402 }
      );
    }

    // Check if budget covers total cost
    const totalCostNum = parseFloat(totalCost);
    if (matchingBudget.balance < totalCostNum) {
      return NextResponse.json(
        { error: `Insufficient orchestrator budget: have ${matchingBudget.balance.toFixed(2)} USDC, need ${totalCost} USDC` },
        { status: 402 }
      );
    }

    budgetAgentDid = matchingBudget.agent_did;
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
