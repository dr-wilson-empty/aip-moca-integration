import { NextRequest, NextResponse } from "next/server";
import { settleBodySchema } from "@/lib/validation";
import { releaseEscrow, refundEscrow, getEscrowRecord } from "@/lib/payment/escrow";
import { verifyWalletAuth, isAuthError } from "@/lib/auth/wallet-auth";

/**
 * POST /api/payment/settle
 * Escrow'u cozer: release (Agent B'ye gonder) veya refund (Agent A'ya iade).
 * Sadece escrow'un payer'i veya payee'si islem yapabilir.
 */
export async function POST(request: NextRequest) {
  const auth = verifyWalletAuth(request);
  if (isAuthError(auth)) return auth;

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

  // Verify task ownership: only payer or payee can settle
  const escrow = getEscrowRecord(taskId);
  if (escrow) {
    const callerIsParty = auth.wallet === escrow.from || auth.wallet === escrow.to;
    if (!callerIsParty) {
      return NextResponse.json(
        { error: "Forbidden: you are not a party to this escrow" },
        { status: 403 },
      );
    }
  }

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
