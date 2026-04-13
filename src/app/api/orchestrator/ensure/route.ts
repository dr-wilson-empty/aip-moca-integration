import { NextRequest, NextResponse } from "next/server";
import { ensureDefaultOrchestrator } from "@/lib/orchestrator/default-orchestrator";

/**
 * POST /api/orchestrator/ensure
 * Called on wallet connect — creates default orchestrator if none exists.
 *
 * Body: { walletAddress: string }
 * Returns: { ok: true, agentId, name, isNew }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const walletAddress = body.walletAddress as string;
  if (!walletAddress) {
    return NextResponse.json({ error: "walletAddress required" }, { status: 400 });
  }

  try {
    const proto = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "localhost:3000";
    const baseUrl = `${proto}://${host}`;

    const config = await ensureDefaultOrchestrator(walletAddress, baseUrl);

    return NextResponse.json({
      ok: true,
      agentId: config.agentId,
      name: config.name,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to ensure orchestrator" },
      { status: 500 },
    );
  }
}
