import { NextRequest, NextResponse } from "next/server";
import { releaseEscrow, refundEscrow } from "@/lib/payment/escrow";

/**
 * POST /api/payment/settle
 * Escrow'u cozer: release (Agent B'ye gonder) veya refund (Agent A'ya iade).
 *
 * Body: { taskId, action: "release" | "refund" }
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const { taskId, action } = body as {
    taskId?: string;
    action?: string;
  };

  if (!taskId || !action) {
    return NextResponse.json(
      { error: "Required fields: taskId, action" },
      { status: 400 }
    );
  }

  if (action !== "release" && action !== "refund") {
    return NextResponse.json(
      { error: "action must be 'release' or 'refund'" },
      { status: 400 }
    );
  }

  try {
    if (action === "release") {
      const { txHash, record } = await releaseEscrow(taskId);
      return NextResponse.json({
        ok: true,
        action: "released",
        txHash,
        record,
      });
    } else {
      const { txHash, record } = await refundEscrow(taskId);
      return NextResponse.json({
        ok: true,
        action: "refunded",
        txHash,
        record,
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}
