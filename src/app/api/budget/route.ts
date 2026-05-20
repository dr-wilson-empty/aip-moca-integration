import { NextRequest, NextResponse } from "next/server";
import {
  getAgentBudget,
  getOwnerBudgets,
  getBudgetHistory,
  verifyAndCreditDeposit,
  updateMaxPerTask,
  withdrawBudget,
} from "@/lib/payment/agent-budget";
import { verifyWalletOwnership, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * GET /api/budget?agentDid=xxx           — get single agent budget
 * GET /api/budget?owner=xxx              — get all budgets for owner
 * GET /api/budget?agentDid=xxx&history=true — get budget + transaction history
 */
export async function GET(request: NextRequest) {
  const agentDid = request.nextUrl.searchParams.get("agentDid");
  const owner = request.nextUrl.searchParams.get("owner");
  const history = request.nextUrl.searchParams.get("history") === "true";

  if (agentDid) {
    const budget = await getAgentBudget(agentDid);
    if (!budget) {
      return NextResponse.json({ budget: null, transactions: [] });
    }

    if (history) {
      const transactions = await getBudgetHistory(agentDid);
      return NextResponse.json({ budget, transactions });
    }

    return NextResponse.json({ budget });
  }

  if (owner) {
    const budgets = await getOwnerBudgets(owner);
    return NextResponse.json({ budgets });
  }

  return NextResponse.json({ error: "agentDid or owner required" }, { status: 400 });
}

/**
 * POST /api/budget
 * Deposit USDC into an agent's budget.
 *
 * Body: {
 *   agentDid: string,     — DID of the agent to fund
 *   ownerWallet: string,  — wallet that made the deposit
 *   amount: number,       — USDC amount deposited
 *   txHash: string,       — on-chain transfer transaction hash
 * }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentDid, ownerWallet, amount, txHash } = body as {
    agentDid?: string;
    ownerWallet?: string;
    amount?: number;
    txHash?: string;
  };

  if (!agentDid || !ownerWallet || !amount || !txHash) {
    return NextResponse.json(
      { error: "agentDid, ownerWallet, amount, txHash required" },
      { status: 400 }
    );
  }

  if (amount <= 0) {
    return NextResponse.json({ error: "Amount must be positive" }, { status: 400 });
  }

  // Only orchestrator agents can receive budget deposits
  if (!agentDid.includes("orch-")) {
    return NextResponse.json({ error: "Budget deposits are only available for Orchestrator Agents" }, { status: 400 });
  }

  // Auth — the on-chain tx parser in verifyAndCreditDeposit only credits
  // a deposit whose token-account authority matches `ownerWallet`, so a
  // forged claim won't pass that gate. We still require an Ed25519
  // signature from the same wallet here as a second factor and to keep
  // rate-limiting / audit logs tied to a real caller, not an anonymous
  // one.
  const authResult = verifyWalletOwnership(request, ownerWallet);
  if (isAuthError(authResult)) return authResult;

  try {
    const budget = await verifyAndCreditDeposit(agentDid, ownerWallet, txHash, amount);
    return NextResponse.json({ ok: true, budget }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Deposit failed" },
      { status: 400 }
    );
  }
}

/**
 * PATCH /api/budget
 * Update budget settings (max_per_task).
 *
 * Body: { agentDid: string, maxPerTask: number }
 */
export async function PATCH(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentDid, maxPerTask } = body as { agentDid?: string; maxPerTask?: number };

  if (!agentDid || maxPerTask === undefined || maxPerTask <= 0) {
    return NextResponse.json(
      { error: "agentDid and positive maxPerTask required" },
      { status: 400 }
    );
  }

  // Auth — only the budget's owner may change max_per_task. We look the
  // owner up server-side so the client can't lie about who they are.
  const existingBudget = await getAgentBudget(agentDid);
  if (!existingBudget) {
    return NextResponse.json({ error: "Budget not found" }, { status: 404 });
  }
  const authResult = verifyWalletOwnership(request, existingBudget.owner_wallet);
  if (isAuthError(authResult)) return authResult;

  try {
    await updateMaxPerTask(agentDid, maxPerTask);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Update failed" },
      { status: 400 }
    );
  }
}

/**
 * DELETE /api/budget
 * Withdraw USDC from an agent's budget back to the owner wallet.
 *
 * Body: { agentDid: string, ownerWallet: string, amount: number }
 */
export async function DELETE(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agentDid, ownerWallet, amount } = body as {
    agentDid?: string;
    ownerWallet?: string;
    amount?: number;
  };

  // Auth must come AFTER body parse so we can pin it to the claimed
  // ownerWallet — the previous `verifyWalletOwnership(request, null)`
  // only checked that *some* valid wallet signed the request, not that
  // it matched the budget owner.
  if (!ownerWallet) {
    return NextResponse.json({ error: "ownerWallet required" }, { status: 400 });
  }
  const auth = verifyWalletOwnership(request, ownerWallet);
  if (isAuthError(auth)) return auth;

  if (!agentDid || !ownerWallet || !amount) {
    return NextResponse.json({ error: "agentDid, ownerWallet, amount required" }, { status: 400 });
  }

  // Ensure the authenticated wallet matches the owner
  if (auth.wallet !== ownerWallet) {
    return NextResponse.json({ error: "Forbidden: wallet mismatch" }, { status: 403 });
  }

  try {
    const { txHash, budget } = await withdrawBudget(agentDid, ownerWallet, amount);
    return NextResponse.json({ ok: true, txHash, budget });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Withdrawal failed" },
      { status: 400 }
    );
  }
}
