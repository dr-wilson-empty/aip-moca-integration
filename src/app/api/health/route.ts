import { NextResponse } from "next/server";
import { getConnection } from "@/lib/solana/connection";
import { listCards } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";

/**
 * GET /api/health
 * Sistem durumu ve baglanti kontrolu.
 */
export async function GET() {
  seedDemoAgents();

  const checks: Record<string, { status: string; detail?: string }> = {};

  // Solana RPC baglantisi
  try {
    const connection = getConnection();
    const slot = await connection.getSlot();
    checks.solana = { status: "ok", detail: `slot ${slot}` };
  } catch (err) {
    checks.solana = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  // Agent card store
  const agents = listCards();
  checks.agentStore = { status: "ok", detail: `${agents.length} agents registered` };

  // Escrow authority (program-based)
  try {
    const { getAuthorityAddress } = await import("@/lib/payment/escrow");
    const addr = getAuthorityAddress();
    checks.escrowWallet = { status: "ok", detail: `authority: ${addr}` };
  } catch (err) {
    checks.escrowWallet = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      timestamp: new Date().toISOString(),
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
