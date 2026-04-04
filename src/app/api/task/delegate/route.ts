import { NextRequest, NextResponse } from "next/server";
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import bs58 from "bs58";
import { getConnection } from "@/lib/solana/connection";
import { buildInitializeEscrowIx } from "@/lib/solana/escrow-program";
import { createEscrowRecord, releaseEscrow, refundEscrow } from "@/lib/payment/escrow";
import { createTask } from "@/lib/protocol/task-machine";
import { getCardByDid, getCardByEndpoint } from "@/lib/protocol/agent-card-store";
import { seedDemoAgents } from "@/lib/protocol/seed-agents";
import { dispatchToAgent } from "@/lib/protocol/a2a-dispatcher";
import { reserveBudget, refundBudget } from "@/lib/payment/agent-budget";
import { logger } from "@/lib/logger";

seedDemoAgents();

const USDC_DECIMALS = 6;

function getAuthorityKeypair(): Keypair {
  const key = process.env.ESCROW_PRIVATE_KEY;
  if (!key) throw new Error("ESCROW_PRIVATE_KEY not set");
  return Keypair.fromSecretKey(bs58.decode(key));
}

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) throw new Error("USDC_MINT_DEVNET not set");
  return new PublicKey(mint);
}

/**
 * POST /api/task/delegate
 *
 * Agent-to-Agent task delegation.
 * A caller agent uses its server-side budget to pay a target agent.
 * No human wallet signature needed — the platform authority creates the escrow.
 *
 * Body: {
 *   callerAgentDid: string,   — DID of the agent creating the task
 *   targetAgentDid: string,   — DID of the agent to execute the task
 *   capability: string,       — capability ID to invoke
 *   input: string,            — task input
 * }
 */
export async function POST(request: NextRequest) {
  seedDemoAgents();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callerAgentDid = body.callerAgentDid as string | undefined;
  const targetAgentDid = body.targetAgentDid as string | undefined;
  const capability = body.capability as string | undefined;
  const input = body.input as string | undefined;

  if (!callerAgentDid || !targetAgentDid || !capability || !input) {
    return NextResponse.json(
      { error: "callerAgentDid, targetAgentDid, capability, input required" },
      { status: 400 }
    );
  }

  // 1. Find target agent card
  const targetCard = getCardByDid(targetAgentDid);
  if (!targetCard) {
    return NextResponse.json(
      { error: `Target agent not found: ${targetAgentDid}` },
      { status: 404 }
    );
  }

  // 2. Verify capability exists on target
  const cap = targetCard.capabilities.find((c) => c.id === capability);
  if (!cap) {
    return NextResponse.json(
      { error: `Target agent does not have capability: ${capability}` },
      { status: 400 }
    );
  }

  const amount = parseFloat(cap.pricing.amount);
  const amountStr = cap.pricing.amount;
  const taskId = `delegate_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  logger.info("delegate", "starting", {
    taskId,
    callerAgentDid,
    targetAgentDid,
    capability,
    amount: amountStr,
  });

  // 3. Reserve budget from caller agent
  try {
    await reserveBudget(callerAgentDid, amount, taskId, targetAgentDid);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("delegate", "budget_insufficient", { callerAgentDid, amount: amountStr, error: msg });
    return NextResponse.json({ error: msg }, { status: 402 });
  }

  // 4. Create on-chain escrow using platform authority
  let escrowTxHash: string;
  try {
    const authorityKp = getAuthorityKeypair();
    const mint = getUsdcMint();
    const connection = getConnection();

    const payeeWallet = new PublicKey(targetCard.walletAddress || authorityKp.publicKey.toBase58());
    const payerAta = await getAssociatedTokenAddress(mint, authorityKp.publicKey);

    // Ensure authority ATA exists
    const tx = new Transaction();
    try {
      await getAccount(connection, payerAta);
    } catch {
      tx.add(createAssociatedTokenAccountInstruction(
        authorityKp.publicKey, payerAta, authorityKp.publicKey, mint
      ));
    }

    const amountLamports = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour deadline

    tx.add(buildInitializeEscrowIx({
      payer: authorityKp.publicKey,
      payee: payeeWallet,
      authority: authorityKp.publicKey,
      payerTokenAccount: payerAta,
      mint,
      taskId,
      amount: amountLamports,
      deadline,
    }));

    escrowTxHash = await sendAndConfirmTransaction(connection, tx, [authorityKp]);

    logger.info("delegate", "escrow_created", { taskId, escrowTxHash, amount: amountStr });
  } catch (err) {
    // Escrow creation failed — refund budget
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("delegate", "escrow_failed", { taskId, error: msg });
    await refundBudget(callerAgentDid, amount, taskId).catch(() => {});
    return NextResponse.json({ error: `Escrow creation failed: ${msg}` }, { status: 500 });
  }

  // 5. Create task record (marked as agent-delegated)
  const task = createTask({
    id: taskId,
    callerDid: callerAgentDid,
    callerAddress: "platform-authority",
    agentDid: targetAgentDid,
    agentName: targetCard.name,
    agentAddress: targetCard.endpoint,
    capability,
    input,
    amount: amountStr,
    escrowTxHash,
    delegatedBy: callerAgentDid,
    isAgentTask: true,
  });

  createEscrowRecord({
    taskId,
    amount: amountStr,
    from: "platform-authority",
    to: targetCard.walletAddress || "",
    escrowTxHash,
    agentEndpoint: targetCard.endpoint,
  });

  // 6. Dispatch to target agent
  dispatchToAgent(
    taskId,
    targetCard.endpoint,
    targetCard.name,
    capability,
    input,
    escrowTxHash,
    async (action) => {
      try {
        if (action === "release") {
          const result = await releaseEscrow(taskId);
          logger.info("delegate", "escrow_released", { taskId, txHash: result.txHash });
          return result.txHash;
        } else {
          // Task failed — refund escrow AND budget
          const result = await refundEscrow(taskId);
          await refundBudget(callerAgentDid, amount, taskId).catch(() => {});
          logger.info("delegate", "escrow_refunded", { taskId, txHash: result.txHash });
          return null;
        }
      } catch (err) {
        logger.error("delegate", "settle_error", {
          taskId,
          action,
          error: err instanceof Error ? err.message : String(err),
        });
        // Attempt budget refund on error
        if (action === "refund") {
          await refundBudget(callerAgentDid, amount, taskId).catch(() => {});
        }
        return null;
      }
    }
  );

  return NextResponse.json({
    ok: true,
    taskId,
    escrowTxHash,
    callerAgentDid,
    targetAgentDid,
    capability,
    amount: amountStr,
  }, { status: 201 });
}
