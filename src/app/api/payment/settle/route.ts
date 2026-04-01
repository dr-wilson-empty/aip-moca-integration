import { NextRequest, NextResponse } from "next/server";
import { settleBodySchema } from "@/lib/validation";
import { releaseEscrow, refundEscrow } from "@/lib/payment/escrow";

/**
 * POST /api/payment/settle
 * Escrow'u cozer: release (Agent B'ye gonder) veya refund (Agent A'ya iade).
 */
export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = settleBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    );
  }

  const { taskId, action } = parsed.data;

  try {
    if (action === "release") {
      const { txHash, record } = await releaseEscrow(taskId);
      return NextResponse.json({ ok: true, action: "released", txHash, record });
    } else {
      const { txHash, record } = await refundEscrow(taskId);
      return NextResponse.json({ ok: true, action: "refunded", txHash, record });
    }
  } catch (err: unknown) {
    return NextResponse.json(
      { error: "Settlement failed" },
      { status: 400 }
    );
  }
}
