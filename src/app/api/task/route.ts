import { NextRequest, NextResponse } from "next/server";
import { taskBodySchema } from "@/lib/validation";
import { createTask, listTasks, getTask } from "@/lib/protocol/task-machine";
import { createEscrowRecord, releaseEscrow, refundEscrow, getAuthorityAddress } from "@/lib/payment/escrow";
import { getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { loadHostedAgentsFromDb, listHostedAgents } from "@/lib/hosted-agents";
import { registerCard } from "@/lib/protocol/agent-card-store";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { getAppUrl } from "@/lib/config/app-url";
import { dispatchToAgent } from "@/lib/protocol/a2a-dispatcher";
import { dbTrackTask } from "@/lib/supabase/preferences";
import {
  buildPaymentRequirements,
  verifyPaymentPayload,
  settlePayment,
  encodeX402Header,
  decodeX402Header,
  type X402PaymentPayload,
} from "@/lib/payment/x402";
import { getCommissionTarget } from "@/lib/payment/commission";
import { logger } from "@/lib/logger";

seedDemoAgents();

/**
 * GET /api/task
 * - ?taskId=xxx -> belirli bir gorev
 * - ?list=true  -> tum gorevleri listele
 */
export async function GET(request: NextRequest) {
  const taskId = request.nextUrl.searchParams.get("taskId");
  const list = request.nextUrl.searchParams.get("list");

  if (taskId) {
    const task = getTask(taskId);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }
    return NextResponse.json(task);
  }

  if (list === "true") {
    return NextResponse.json({ tasks: listTasks() });
  }

  return NextResponse.json(
    { error: "taskId or list=true required" },
    { status: 400 }
  );
}

/**
 * POST /api/task
 *
 * x402 Protocol Flow (Phase 2 — PDA Escrow):
 *
 * 1. Istek X-PAYMENT header'i OLMADAN gelirse → 402 Payment Required dondur
 * 2. Istek X-PAYMENT header'i ILE gelirse:
 *    - Transaction'i dogrula (initialize_escrow instruction icermeli)
 *    - Blockchain'e gonder (settle)
 *    - Gorevi baslat
 *
 * Body: { agentEndpoint, capability, input, amount, callerDid, callerAddress, taskId? }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();
  await loadHostedAgentsFromDb();
  const base = getAppUrl();
  for (const ha of listHostedAgents()) {
    registerCard({
      did: canonicalAgentDid(ha.ownerAddress, ha.agentId),
      name: ha.name, description: ha.description || undefined, version: "1.0.0",
      endpoint: `${base}/api/hosted-agent?agentId=${ha.agentId}`,
      type: "Task", walletAddress: ha.ownerAddress,
      capabilities: ha.capabilities.map((c) => ({
        id: c.id, description: c.description,
        pricing: { amount: c.pricing.amount, token: "USDC" as const, network: "solana" as const },
      })),
    });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = taskBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 }
    );
  }

  const { agentEndpoint, capability, input, amount, callerDid, callerAddress, taskId: bodyTaskId } = parsed.data;

  // Karsi ajan card'ini bul
  const agentCard = getCardByEndpoint(agentEndpoint);
  if (!agentCard) {
    return NextResponse.json(
      { error: "Agent not found for endpoint", agentEndpoint },
      { status: 404 }
    );
  }

  // Capability dogrulama
  const hasCap = agentCard.capabilities.some((c) => c.id === capability);
  if (!hasCap) {
    return NextResponse.json(
      { error: `Agent ${agentCard.name} does not have capability: ${capability}` },
      { status: 400 }
    );
  }

  // ---------------------------------------------------------------
  // x402 STEP 1: X-PAYMENT header var mi kontrol et
  // ---------------------------------------------------------------
  const paymentHeader = request.headers.get("x-payment");

  if (!paymentHeader) {
    // taskId generate et — client bunu PDA derivation icin kullanacak
    const taskId = bodyTaskId || `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    logger.info("x402", "payment_required", { callerAddress, amount, agent: agentCard.name });

    // Hosted agent (tier=platform) → payee = platform authority (commission split later)
    // SDK/custom agents → payee = agent's wallet (no commission)
    const commissionTarget = getCommissionTarget(agentEndpoint);
    const payee = commissionTarget ? getAuthorityAddress() : (agentCard.walletAddress ?? callerAddress);

    const requirements = buildPaymentRequirements(
      amount,
      "/api/task",
      `Task: ${capability} via ${agentCard.name}`,
      taskId,
      payee
    );

    return new NextResponse(
      JSON.stringify({
        error: "Payment Required",
        message: `This task requires ${amount} USDC payment. Build initialize_escrow transaction and resend with X-PAYMENT header.`,
        requirements,
        taskId,
      }),
      {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT-REQUIRED": encodeX402Header(requirements),
        },
      }
    );
  }

  // ---------------------------------------------------------------
  // x402 STEP 2: Odemeyi dogrula
  // ---------------------------------------------------------------
  let paymentPayload: X402PaymentPayload;
  try {
    paymentPayload = decodeX402Header<X402PaymentPayload>(paymentHeader);
  } catch {
    return NextResponse.json(
      { error: "Invalid X-PAYMENT header: not valid base64 JSON" },
      { status: 400 }
    );
  }

  // taskId from payment payload
  const taskId = paymentPayload.accepted?.taskId || bodyTaskId;
  if (!taskId) {
    return NextResponse.json(
      { error: "Missing taskId in payment payload" },
      { status: 400 }
    );
  }

  const commissionTargetVerify = getCommissionTarget(agentEndpoint);
  const payeeVerify = commissionTargetVerify ? getAuthorityAddress() : (agentCard.walletAddress ?? callerAddress);

  const requirements = buildPaymentRequirements(
    amount,
    "/api/task",
    `Task: ${capability}`,
    taskId,
    payeeVerify
  );
  const verifyResult = verifyPaymentPayload(paymentPayload, requirements);

  if (!verifyResult.isValid) {
    logger.error("x402", "verify_failed", { error: verifyResult.error, callerAddress });
    return NextResponse.json(
      { error: `Payment verification failed: ${verifyResult.error}` },
      { status: 402 }
    );
  }

  // Payer cross-check: transaction'i imzalayan wallet, body'deki callerAddress ile uyusmali
  const verifiedPayer = verifyResult.payerAddress;
  if (!verifiedPayer) {
    return NextResponse.json(
      { error: "Could not extract payer address from transaction" },
      { status: 400 }
    );
  }
  if (verifiedPayer !== callerAddress) {
    logger.error("x402", "payer_mismatch", {
      bodyCallerAddress: callerAddress,
      txPayerAddress: verifiedPayer,
      taskId,
    });
    return NextResponse.json(
      { error: "Payment payer does not match caller address" },
      { status: 403 }
    );
  }

  logger.info("x402", "verify_passed", { callerAddress, amount: verifyResult.amount, taskId });

  // ---------------------------------------------------------------
  // x402 STEP 3: Transaction'i blockchain'e gonder (settle)
  // ---------------------------------------------------------------
  const settleResult = await settlePayment(paymentPayload);

  if (settleResult.status === "failed") {
    logger.error("x402", "settle_failed", { error: settleResult.error, callerAddress });
    return NextResponse.json(
      { error: `Payment settlement failed: ${settleResult.error}` },
      { status: 402 }
    );
  }

  const escrowTxHash = settleResult.transaction;
  logger.info("x402", "settled", { txHash: escrowTxHash, callerAddress, amount, taskId });

  // ---------------------------------------------------------------
  // STEP 4: Gorev olustur ve baslat
  // ---------------------------------------------------------------
  logger.info("task", "created", { taskId, agent: agentCard.name, capability, amount, escrowTxHash });

  const task = createTask({
    id: taskId,
    callerDid,
    callerAddress,
    agentDid: agentCard.did,
    agentName: agentCard.name,
    agentAddress: agentCard.endpoint,
    capability,
    input,
    amount,
    escrowTxHash,
  });

  // For hosted agents with platform AI, payee is platform authority (commission split on release)
  const commissionTargetEscrow = getCommissionTarget(agentEndpoint);
  const escrowPayee = commissionTargetEscrow ? getAuthorityAddress() : (agentCard.walletAddress ?? callerAddress);

  createEscrowRecord({
    taskId,
    amount,
    from: callerAddress,
    to: escrowPayee,
    escrowTxHash,
    agentEndpoint,
  });

  // Dispatch to real agent service via HTTP JSON-RPC
  dispatchToAgent(
    taskId,
    agentCard.endpoint,
    agentCard.name,
    capability,
    input,
    escrowTxHash,
    async (action) => {
      try {
        if (action === "release") {
          const result = await releaseEscrow(taskId);
          logger.info("escrow", "released", { taskId, txHash: result.txHash });
          dbTrackTask(callerAddress, capability, agentCard.did).catch(() => {});
          return result.txHash;
        } else {
          const result = await refundEscrow(taskId);
          logger.info("escrow", "refunded", { taskId, txHash: result.txHash });
          return null;
        }
      } catch (err) {
        logger.error("escrow", "settle_error", {
          taskId,
          action,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    // Memory context: inject past memories, extract new ones after completion
    { agentDid: agentCard.did, callerAddress }
  );

  // x402 payment response header
  const paymentResponse = {
    transaction: escrowTxHash,
    status: "settled",
    network: requirements.accepts[0].network,
  };

  return new NextResponse(
    JSON.stringify({ ok: true, taskId, task }),
    {
      status: 201,
      headers: {
        "Content-Type": "application/json",
        "X-PAYMENT-RESPONSE": encodeX402Header(paymentResponse),
      },
    }
  );
}
