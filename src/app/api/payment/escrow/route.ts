import { NextRequest, NextResponse } from "next/server";
import {
  getAuthorityAddress,
  createEscrowRecord,
  getEscrowRecord,
} from "@/lib/payment/escrow";
import { ESCROW_PROGRAM_ID } from "@/lib/solana/escrow-program";

/**
 * GET /api/payment/escrow
 * - Parametresiz: escrow wallet adresini dondur
 * - ?taskId=xxx: belirli bir escrow kaydini sorgula
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");

  if (taskId) {
    const record = getEscrowRecord(taskId);
    if (!record) {
      return NextResponse.json(
        { error: "Escrow record not found", taskId },
        { status: 404 }
      );
    }
    return NextResponse.json(record);
  }

  // Escrow program bilgisini dondur
  try {
    const authorityAddress = getAuthorityAddress();
    return NextResponse.json({
      programId: ESCROW_PROGRAM_ID.toBase58(),
      authorityAddress,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/payment/escrow
 * Client USDC transferini yaptiktan sonra escrow kaydini olusturur.
 *
 * Body: { taskId, amount, from, to, txHash }
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

  const { taskId, amount, from, to, txHash } = body as {
    taskId?: string;
    amount?: string;
    from?: string;
    to?: string;
    txHash?: string;
  };

  if (!taskId || !amount || !from || !to || !txHash) {
    return NextResponse.json(
      { error: "Required fields: taskId, amount, from, to, txHash" },
      { status: 400 }
    );
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return NextResponse.json(
      { error: "Invalid amount" },
      { status: 400 }
    );
  }

  // Escrow kaydini olustur
  const record = createEscrowRecord({
    taskId,
    amount,
    from,
    to,
    escrowTxHash: txHash,
  });

  return NextResponse.json(
    { ok: true, record },
    { status: 201 }
  );
}
