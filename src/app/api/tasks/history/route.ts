import { NextRequest, NextResponse } from "next/server";
import { dbListTasks } from "@/lib/supabase/db";
import { verifyWalletOwnership, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * GET /api/tasks/history?address=xxx
 * Returns task history from Supabase (persistent across restarts).
 */
export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");

  const auth = verifyWalletOwnership(request, address);
  if (isAuthError(auth)) return auth;

  const dbTasks = await dbListTasks(address ?? undefined);

  // Convert DB format to frontend Task format
  const tasks = dbTasks.map((t) => ({
    id: t.id,
    counterpartAgent: t.agent_name,
    capability: t.capability,
    input: t.input,
    startedAt: t.created_at ?? "",
    duration: t.updated_at && t.created_at
      ? `${((new Date(t.updated_at).getTime() - new Date(t.created_at).getTime()) / 1000).toFixed(1)}s`
      : "—",
    state: t.state,
    usdcSpent: t.state === "COMPLETED" ? t.amount : "0.00",
    artifact: t.artifact ?? undefined,
    escrowTxHash: t.escrow_tx_hash ?? undefined,
    settlementTxHash: t.settlement_tx_hash ?? undefined,
    log: (t.log as Array<{ id: string; timestamp: string; eventType: string; message: string }>) ?? [],
    delegatedBy: t.delegated_by ?? undefined,
    isAgentTask: t.is_agent_task ?? false,
    chainId: t.chain_id ?? undefined,
  }));

  return NextResponse.json({ tasks });
}
