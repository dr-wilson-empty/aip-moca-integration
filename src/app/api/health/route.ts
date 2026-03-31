import { NextResponse } from "next/server";
import { getConnection } from "@/lib/solana/connection";
import { listCards, checkOnChain } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { ESCROW_PROGRAM_ID } from "@/lib/solana/escrow-program";
import { REGISTRY_PROGRAM_ID } from "@/lib/solana/registry-program";

/**
 * GET /api/health
 * Comprehensive E2E health check — verifies all Phase 2 components.
 */
export async function GET() {
  seedDemoAgents();

  const checks: Record<string, { status: string; detail?: string; ms?: number }> = {};

  // 1. Solana RPC
  const t0 = Date.now();
  try {
    const connection = getConnection();
    const slot = await connection.getSlot();
    checks.solanaRpc = { status: "ok", detail: `slot ${slot}`, ms: Date.now() - t0 };
  } catch (err) {
    checks.solanaRpc = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  // 2. Escrow Program deployed
  try {
    const connection = getConnection();
    const info = await connection.getAccountInfo(ESCROW_PROGRAM_ID);
    checks.escrowProgram = {
      status: info?.executable ? "ok" : "error",
      detail: `${ESCROW_PROGRAM_ID.toBase58().slice(0, 12)}... ${info?.executable ? "executable" : "not found"}`,
    };
  } catch (err) {
    checks.escrowProgram = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  // 3. Registry Program deployed
  try {
    const connection = getConnection();
    const info = await connection.getAccountInfo(REGISTRY_PROGRAM_ID);
    checks.registryProgram = {
      status: info?.executable ? "ok" : "error",
      detail: `${REGISTRY_PROGRAM_ID.toBase58().slice(0, 12)}... ${info?.executable ? "executable" : "not found"}`,
    };
  } catch (err) {
    checks.registryProgram = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  // 4. Authority wallet
  try {
    const { getAuthorityAddress } = await import("@/lib/payment/escrow");
    const { PublicKey } = await import("@solana/web3.js");
    const addr = getAuthorityAddress();
    const connection = getConnection();
    const balance = await connection.getBalance(new PublicKey(addr)).catch(() => 0);
    checks.authority = {
      status: "ok",
      detail: `${addr.slice(0, 12)}... (${(balance / 1e9).toFixed(3)} SOL)`,
    };
  } catch (err) {
    checks.authority = { status: "error", detail: err instanceof Error ? err.message : "unknown" };
  }

  // 5. Agent store + on-chain status
  const agents = listCards();
  let onChainCount = 0;
  for (const agent of agents) {
    try {
      if (await checkOnChain(agent.did)) onChainCount++;
    } catch { /* skip */ }
  }
  checks.agentRegistry = {
    status: onChainCount > 0 ? "ok" : "warn",
    detail: `${agents.length} agents (${onChainCount} on-chain)`,
  };

  // 6. Agent services reachable
  const agentPorts = [4001, 4002, 4003];
  const agentNames = ["Summary", "Data", "Audit"];
  let agentsUp = 0;
  for (let i = 0; i < agentPorts.length; i++) {
    try {
      const t = Date.now();
      const res = await fetch(`http://localhost:${agentPorts[i]}/.well-known/agent.json`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) {
        agentsUp++;
        checks[`agent_${agentNames[i]}`] = { status: "ok", detail: `port ${agentPorts[i]}`, ms: Date.now() - t };
      } else {
        checks[`agent_${agentNames[i]}`] = { status: "error", detail: `HTTP ${res.status}` };
      }
    } catch {
      checks[`agent_${agentNames[i]}`] = { status: "error", detail: "unreachable" };
    }
  }

  // 7. Anthropic API key configured
  checks.anthropicApi = {
    status: process.env.ANTHROPIC_API_KEY ? "ok" : "error",
    detail: process.env.ANTHROPIC_API_KEY ? "configured" : "ANTHROPIC_API_KEY not set",
  };

  // 8. USDC Mint configured
  checks.usdcMint = {
    status: process.env.USDC_MINT_DEVNET ? "ok" : "error",
    detail: process.env.USDC_MINT_DEVNET ? `${process.env.USDC_MINT_DEVNET.slice(0, 12)}...` : "not set",
  };

  const allOk = Object.values(checks).every((c) => c.status === "ok");
  const hasErrors = Object.values(checks).some((c) => c.status === "error");

  return NextResponse.json(
    {
      status: allOk ? "healthy" : hasErrors ? "degraded" : "partial",
      timestamp: new Date().toISOString(),
      phase: 2,
      checks,
    },
    { status: allOk ? 200 : 503 }
  );
}
