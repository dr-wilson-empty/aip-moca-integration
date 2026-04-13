/**
 * Chain Executor — sequential multi-agent pipeline runner.
 *
 * Runs a TaskChain server-side: each step creates an escrow,
 * dispatches to the target agent, waits for completion, and
 * feeds the output to the next step.
 *
 * Payment: The user deposits the total cost upfront (single tx).
 * The server creates per-step escrows from the authority wallet.
 *
 * Failure: If a step fails, remaining budget is not spent.
 * Completed steps keep their payments (partial execution is valid).
 */
import {
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import bs58 from "bs58";
import { getConnection } from "@/lib/solana/connection";
import { buildInitializeEscrowIx } from "@/lib/solana/escrow-program";
import { createEscrowRecord, releaseEscrow, refundEscrow } from "@/lib/payment/escrow";
import { reserveBudget, refundBudget } from "@/lib/payment/agent-budget";
import { getHostedAgent } from "@/lib/hosted-agents";
import { orchestrateTask } from "./agent-orchestrator";
import { buildMemoryContext, extractMemoryHints, saveMemories } from "@/lib/memory/agent-memory";
import { createTask, completeTask, failTask, acceptTask } from "./task-machine";
import { executeTask } from "./a2a-client";
import { canonicalAgentDid } from "@/lib/identity/canonical-did";
import { logger } from "@/lib/logger";
import type { TaskChain, ChainStep } from "@/types/aip";

const USDC_DECIMALS = 6;

/* ------------------------------------------------------------------ */
/*  In-memory chain store                                              */
/* ------------------------------------------------------------------ */

const CHAIN_TTL_MS = 60 * 60 * 1000; // 1 hour after completion

const g = globalThis as typeof globalThis & {
  __aip_chains?: Map<string, TaskChain>;
};
if (!g.__aip_chains) g.__aip_chains = new Map();
const chains = g.__aip_chains;

/** Schedule chain removal after TTL (for completed/failed chains) */
function scheduleChainCleanup(chainId: string): void {
  setTimeout(() => { chains.delete(chainId); }, CHAIN_TTL_MS);
}

export function getChain(chainId: string): TaskChain | null {
  return chains.get(chainId) ?? null;
}

export function listChains(): TaskChain[] {
  return Array.from(chains.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Chain Execution                                                    */
/* ------------------------------------------------------------------ */

/**
 * Create and execute a chain.
 * Runs asynchronously — returns immediately with the chain ID.
 * Poll GET /api/chain?id=xxx for status updates.
 */
export function createAndExecuteChain(params: {
  callerAddress: string;
  callerDid: string;
  steps: ChainStep[];
  totalCost: string;
  depositTxHash: string;
  /** Agent DID whose budget funds this chain (autonomous mode) */
  budgetAgentDid?: string;
}): TaskChain {
  const chain: TaskChain = {
    id: `ch_${Math.random().toString(36).slice(2, 10)}`,
    callerAddress: params.callerAddress,
    callerDid: params.callerDid,
    steps: params.steps.map((s) => ({ ...s, status: "pending" })),
    totalCost: params.totalCost,
    totalSpent: "0.00",
    status: "executing",
    depositTxHash: params.depositTxHash,
    currentStep: 0,
    createdAt: new Date().toISOString(),
  };

  chains.set(chain.id, chain);

  logger.info("chain", "created", {
    chainId: chain.id,
    steps: chain.steps.length,
    totalCost: chain.totalCost,
  });

  // Execute in background (non-blocking)
  runChain(chain, params.budgetAgentDid)
    .catch((err) => {
      logger.error("chain", "fatal", {
        chainId: chain.id,
        error: err instanceof Error ? err.message : String(err),
      });
      chain.status = "failed";
    })
    .finally(() => {
      if (chain.status === "failed" || chain.status === "completed") {
        scheduleChainCleanup(chain.id);
      }
    });

  return chain;
}

/**
 * Run chain steps sequentially.
 * Each step: reserve budget → create escrow → dispatch to agent → wait → release/refund → next
 */
async function runChain(chain: TaskChain, budgetAgentDid?: string): Promise<void> {
  const authorityKp = getAuthorityKeypair();
  const mint = getUsdcMint();
  const connection = getConnection();
  let totalSpent = 0;

  for (let i = 0; i < chain.steps.length; i++) {
    const step = chain.steps[i];
    chain.currentStep = i;
    step.status = "executing";

    logger.info("chain", "step_start", {
      chainId: chain.id,
      step: i + 1,
      agent: step.agentName,
      capability: step.capabilityId,
    });

    // Determine input: use previous step's output if inputFromPrev
    let stepInput = step.input;
    if (step.inputFromPrev && i > 0) {
      const prevArtifact = chain.steps[i - 1].artifact;
      if (prevArtifact) {
        stepInput = prevArtifact;
        step.input = prevArtifact;
      }
    }

    // Check if this step's agent is an orchestrator — bypass escrow, let it self-manage
    const hostedMatch = step.agentEndpoint.match(/[?&]agentId=([^&]+)/);
    const hostedConfig = hostedMatch ? getHostedAgent(hostedMatch[1]) : null;
    if (hostedConfig?.canOrchestrate) {
      const agentDid = step.agentDid || canonicalAgentDid(hostedConfig.ownerAddress, hostedConfig.agentId);
      logger.info("chain", "orchestrator_step", { chainId: chain.id, step: i + 1, agent: step.agentName });

      // Replace orchestrator placeholder step with "planning..." status
      step.status = "executing";

      try {
        const orchResult = await orchestrateTask(agentDid, hostedConfig.name, hostedConfig.systemPrompt, stepInput, chain.callerAddress, (event) => {
          // Live update chain steps from orchestrator callbacks
          if (event.type === "planned" && event.steps) {
            // Replace orchestrator placeholder with real sub-steps
            const subSteps: ChainStep[] = event.steps.map((s) => ({
              agentName: s.agentName,
              agentDid: "",
              agentEndpoint: "",
              walletAddress: "",
              capabilityId: s.capabilityId,
              capabilityDescription: s.label,
              estimatedCost: s.estimatedCost.toFixed(2),
              input: "",
              inputFromPrev: false,
              label: s.label,
              status: "pending",
            }));
            // Remove the orchestrator placeholder, insert sub-steps
            chain.steps.splice(i, 1, ...subSteps);
          } else if (event.type === "step_start" && event.stepIndex !== undefined) {
            const realIdx = i + event.stepIndex;
            if (chain.steps[realIdx]) {
              chain.steps[realIdx].status = "executing";
              chain.currentStep = realIdx;
            }
          } else if (event.type === "step_done" && event.stepIndex !== undefined) {
            const realIdx = i + event.stepIndex;
            if (chain.steps[realIdx]) {
              chain.steps[realIdx].status = "completed";
              chain.steps[realIdx].artifact = event.artifact;
            }
          } else if (event.type === "step_failed" && event.stepIndex !== undefined) {
            const realIdx = i + event.stepIndex;
            if (chain.steps[realIdx]) {
              chain.steps[realIdx].status = "failed";
              chain.steps[realIdx].error = event.error;
            }
          }
        });

        totalSpent += orchResult.totalSpent;
        logger.info("chain", "orchestrator_completed", { chainId: chain.id, step: i + 1, subSpent: orchResult.totalSpent });

        // Orchestrator handled all sub-steps — mark chain as completed and exit loop
        // (sub-steps were already updated via onStep callbacks above)
        chain.status = "completed";
        chain.totalSpent = totalSpent.toFixed(2);
        chain.completedAt = new Date().toISOString();

        // Set final artifact from orchestrator synthesis
        const subTaskInfo = orchResult.subTasks
          .filter((s) => s.status === "completed")
          .map((s) => `${s.agentName} (${s.capabilityId}) — ${s.cost.toFixed(2)} USDC`)
          .join("\n");
        chain.finalArtifact = orchResult.answer +
          `\n\n---\n**${hostedConfig.name}** orchestrated ${orchResult.stepsCompleted} agent(s), spent ${orchResult.totalSpent.toFixed(2)} USDC from budget` +
          (subTaskInfo ? `\n${subTaskInfo}` : "");

        return; // Exit loop — orchestrator handled everything
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        step.status = "failed";
        step.error = msg;
        chain.status = "failed";
        chain.totalSpent = totalSpent.toFixed(2);
        logger.error("chain", "orchestrator_failed", { chainId: chain.id, step: i + 1, error: msg });
        return;
      }
    }

    // Task ID must be ≤64 bytes (Solana PDA seed limit for escrow)
    const shortId = Math.random().toString(36).slice(2, 8);
    const taskId = `cs${i}_${shortId}`;
    step.taskId = taskId;
    const amount = parseFloat(step.estimatedCost);

    // If budgetAgentDid is set (autonomous mode), reserve from orchestrator budget
    let budgetReserved = false;
    if (budgetAgentDid) {
      try {
        await reserveBudget(budgetAgentDid, amount, taskId, step.agentDid || "unknown");
        budgetReserved = true;
        logger.info("chain", "budget_reserved", { chainId: chain.id, step: i + 1, amount, budgetAgent: budgetAgentDid });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error("chain", "budget_reserve_failed", { chainId: chain.id, step: i + 1, error: msg });
        step.status = "failed";
        step.error = `Budget reserve failed: ${msg}`;
        chain.status = "failed";
        chain.totalSpent = totalSpent.toFixed(2);
        return;
      }
    }

    // 1. Create on-chain escrow for this step
    try {
      // For hosted agents: escrow releases to platform authority (commission split happens after)
      // For SDK agents: escrow releases directly to agent wallet
      const isHosted = step.agentEndpoint.includes("/api/hosted-agent");
      const payeeWallet = isHosted
        ? authorityKp.publicKey
        : new PublicKey(step.walletAddress || authorityKp.publicKey.toBase58());
      const payerAta = await getAssociatedTokenAddress(mint, authorityKp.publicKey);

      const tx = new Transaction();
      try {
        await getAccount(connection, payerAta);
      } catch {
        tx.add(createAssociatedTokenAccountInstruction(
          authorityKp.publicKey, payerAta, authorityKp.publicKey, mint
        ));
      }

      const amountLamports = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);

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

      const escrowTxHash = await sendAndConfirmTransaction(connection, tx, [authorityKp]);
      step.escrowTxHash = escrowTxHash;

      createEscrowRecord({
        taskId,
        amount: step.estimatedCost,
        from: chain.callerAddress,
        to: isHosted ? authorityKp.publicKey.toBase58() : (step.walletAddress || authorityKp.publicKey.toBase58()),
        escrowTxHash,
        agentEndpoint: step.agentEndpoint,
      });

      // Create task record (marked as chain step)
      createTask({
        id: taskId,
        callerDid: chain.callerDid,
        callerAddress: chain.callerAddress,
        agentDid: step.agentDid,
        agentName: step.agentName,
        agentAddress: step.agentEndpoint,
        capability: step.capabilityId,
        input: stepInput,
        amount: step.estimatedCost,
        escrowTxHash,
        delegatedBy: chain.callerDid,
        isAgentTask: true,
        chainId: chain.id,
      });

      logger.info("chain", "step_escrow", { chainId: chain.id, step: i + 1, escrowTxHash });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error("chain", "step_escrow_failed", { chainId: chain.id, step: i + 1, error: msg });
      // Refund budget if reserved
      if (budgetReserved && budgetAgentDid) {
        await refundBudget(budgetAgentDid, amount, taskId).catch(() => {});
      }
      step.status = "failed";
      step.error = `Escrow failed: ${msg}`;
      chain.status = "failed";
      chain.totalSpent = totalSpent.toFixed(2);
      return;
    }

    // 2. Execute task via agent HTTP JSON-RPC (with memory injection)
    try {
      // Inject memory context (skip for search/data capabilities — memory pollutes queries)
      let enrichedInput = stepInput;
      const skipMemory = ["web.search", "data.retrieve"].includes(step.capabilityId);
      if (!skipMemory) {
        try {
          const memCtx = await buildMemoryContext(step.agentDid, chain.callerAddress);
          if (memCtx) enrichedInput = stepInput + memCtx;
        } catch { /* memory is best-effort */ }
      }

      const result = await executeTask(
        step.agentEndpoint,
        step.capabilityId,
        enrichedInput,
        taskId,
        500,
        60
      );

      if (result.status === "COMPLETED" && result.artifact) {
        // Extract and save memory hints (async, non-blocking)
        extractMemoryHints(result.artifact, stepInput).then((hints) => {
          if (hints.length > 0) {
            saveMemories(hints.map((h) => ({
              agent_did: step.agentDid,
              user_wallet: chain.callerAddress,
              memory_type: h.type,
              content: h.content,
            }))).catch(() => {});
          }
        }).catch(() => {});

        // Release escrow
        try { acceptTask(taskId); } catch { /* may already be accepted */ }
        const releaseResult = await releaseEscrow(taskId);
        step.settlementTxHash = releaseResult.txHash;
        completeTask(taskId, result.artifact, releaseResult.txHash);

        step.artifact = result.artifact;
        step.status = "completed";
        totalSpent += amount;

        logger.info("chain", "step_completed", {
          chainId: chain.id,
          step: i + 1,
          settlementTxHash: releaseResult.txHash,
        });
      } else {
        // Agent failed — refund this step
        try { acceptTask(taskId); } catch { /* state edge case */ }
        await refundEscrow(taskId).catch(() => {});
        if (budgetReserved && budgetAgentDid) {
          await refundBudget(budgetAgentDid, amount, taskId).catch(() => {});
        }
        try { failTask(taskId, result.error || "Agent returned FAILED"); } catch { /* state edge case */ }

        step.status = "failed";
        step.error = result.error || "Agent returned FAILED status";
        chain.status = "failed";
        chain.totalSpent = totalSpent.toFixed(2);

        logger.error("chain", "step_agent_failed", {
          chainId: chain.id,
          step: i + 1,
          error: step.error,
        });
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);

      // Refund escrow + budget on error
      await refundEscrow(taskId).catch(() => {});
      if (budgetReserved && budgetAgentDid) {
        await refundBudget(budgetAgentDid, amount, taskId).catch(() => {});
      }
      try { acceptTask(taskId); } catch { /* state edge case */ }
      try { failTask(taskId, msg); } catch { /* state edge case */ }

      step.status = "failed";
      step.error = msg;
      chain.status = "failed";
      chain.totalSpent = totalSpent.toFixed(2);

      logger.error("chain", "step_error", { chainId: chain.id, step: i + 1, error: msg });
      return;
    }
  }

  // All steps completed
  chain.status = "completed";
  chain.totalSpent = totalSpent.toFixed(2);
  chain.completedAt = new Date().toISOString();
  chain.finalArtifact = chain.steps[chain.steps.length - 1]?.artifact;

  logger.info("chain", "completed", {
    chainId: chain.id,
    totalSpent: chain.totalSpent,
    steps: chain.steps.length,
  });
}
