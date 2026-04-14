/**
 * Agent Orchestrator — enables hosted agents to autonomously delegate
 * sub-tasks to other agents using their budget.
 *
 * Flow:
 * 1. Agent receives complex task
 * 2. Claude plans which agents to call
 * 3. For each step: reserve budget → create escrow → call agent → settle
 * 4. Claude synthesizes final result from all step outputs
 *
 * This is the "Senaryo 3" — agent-to-agent delegation.
 */
import { Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount, createAssociatedTokenAccountInstruction } from "@solana/spl-token";
import bs58 from "bs58";
import Anthropic from "@anthropic-ai/sdk";
import { getConnection } from "@/lib/solana/connection";
import { buildInitializeEscrowIx } from "@/lib/solana/escrow-program";
import { createEscrowRecord, releaseEscrow, refundEscrow } from "@/lib/payment/escrow";
import { reserveBudget, refundBudget, getAgentBudget } from "@/lib/payment/agent-budget";
import { getCurrentDateString } from "@/lib/web/realtime-enrichment";
import { buildMemoryContext, extractMemoryHints, saveMemories } from "@/lib/memory/agent-memory";
import { listCards } from "./agent-card-store";
import { executeTask } from "./a2a-client";
import { logger } from "@/lib/logger";

const USDC_DECIMALS = 6;

/** Platform fee per orchestrated step — covers Claude API planning/synthesis cost */
const ORCHESTRATION_FEE_PER_STEP = 0.05;

interface OrchestrationStep {
  agentName: string;
  agentDid: string;
  agentEndpoint: string;
  walletAddress: string;
  capabilityId: string;
  input: string;
  inputFromPrev: boolean;
  estimatedCost: number;
}

interface StepResult {
  status: "completed" | "failed";
  artifact?: string;
  error?: string;
  cost: number;
  agentName?: string;
  capabilityId?: string;
}

export interface OrchestrationResult {
  answer: string;
  totalSpent: number;
  stepsCompleted: number;
  subTasks: Array<{
    agentName: string;
    capabilityId: string;
    cost: number;
    status: "completed" | "failed";
  }>;
}

/** Callback fired when orchestrator plans or updates a sub-step */
export type OnOrchestratorStep = (event: {
  type: "planned" | "step_start" | "step_done" | "step_failed";
  steps?: Array<{ agentName: string; capabilityId: string; estimatedCost: number; label: string }>;
  stepIndex?: number;
  artifact?: string;
  error?: string;
}) => void;

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
 * Orchestrate a task: plan sub-tasks, delegate to agents, synthesize result.
 */
export async function orchestrateTask(
  callerAgentDid: string,
  callerAgentName: string,
  systemPrompt: string,
  userInput: string,
  callerAddress?: string,
  onStep?: OnOrchestratorStep,
): Promise<OrchestrationResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  // Check budget
  const budget = await getAgentBudget(callerAgentDid);
  if (!budget || budget.balance <= 0) {
    throw new Error(`No budget available for ${callerAgentName}. Deposit USDC in My Agents first.`);
  }

  // Get available agents (exclude self to prevent recursion)
  const allCards = listCards().filter((c) => c.did !== callerAgentDid);
  const capabilityList = allCards.flatMap((a) =>
    a.capabilities.map((c) => ({
      agentName: a.name,
      agentDid: a.did,
      agentEndpoint: a.endpoint,
      walletAddress: a.walletAddress || "",
      capabilityId: c.id,
      description: c.description,
      price: c.pricing.amount,
    }))
  );

  if (capabilityList.length === 0) {
    throw new Error("No agents available to delegate to.");
  }

  const availableStr = capabilityList
    .map((c) => `- ${c.agentName} → ${c.capabilityId} (${c.description}) — ${c.price} USDC`)
    .join("\n");

  logger.info("orchestrator", "planning", {
    callerAgentDid,
    budget: budget.balance,
    availableAgents: capabilityList.length,
  });

  // Step 1: Plan — ask Claude which agents to call
  const client = new Anthropic({ apiKey });
  const planResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      `${getCurrentDateString()}\n\n` +
      `You are an AI orchestrator for the agent "${callerAgentName}". ` +
      `Your agent's system prompt: "${systemPrompt}"\n\n` +
      `You have a budget of ${budget.balance.toFixed(2)} USDC to spend on other agents.\n\n` +
      `Available agents you can delegate to:\n${availableStr}\n\n` +
      `RULES:\n` +
      `- Analyze the user's request and decide which agents to call\n` +
      `- If the task is simple and can be answered directly, return {"steps":[]}\n` +
      `- **IMPORTANT**: If the user asks about current prices, news, events, or any time-sensitive information, you MUST include a web.search step FIRST to get up-to-date data. Never rely on training data for current facts.\n` +
      `- For each step, specify the agent, capability, and input\n` +
      `- Total cost must not exceed budget (${budget.balance.toFixed(2)} USDC)\n` +
      `- Step 2+ can use previous step's output: set inputFromPrev=true\n` +
      `- Maximum 4 steps\n` +
      `- ALWAYS respond with valid JSON only:\n` +
      `{"steps":[{"agentName":"...","capabilityId":"...","input":"...","inputFromPrev":false}]}\n`,
    messages: [{ role: "user", content: userInput }],
  });

  const planText = planResponse.content[0];
  if (planText.type !== "text") throw new Error("No plan from model");

  let plan: { steps: Array<{ agentName: string; capabilityId: string; input?: string; inputFromPrev?: boolean }> };
  try {
    const match = planText.text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON");
    plan = JSON.parse(match[0]);
  } catch {
    throw new Error("Failed to parse orchestration plan");
  }

  // No delegation needed — answer directly
  if (!plan.steps || plan.steps.length === 0) {
    logger.info("orchestrator", "direct_answer", { callerAgentDid });
    const directResponse = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system: `${getCurrentDateString()}\n\n${systemPrompt}`,
      messages: [{ role: "user", content: userInput }],
    });
    const directText = directResponse.content[0];
    return {
      answer: directText.type === "text" ? directText.text : "No response",
      totalSpent: 0,
      stepsCompleted: 0,
      subTasks: [],
    };
  }

  // Resolve steps to actual agents
  const resolvedSteps: OrchestrationStep[] = [];
  let totalCost = 0;

  for (const step of plan.steps) {
    const match = capabilityList.find(
      (c) => c.capabilityId === step.capabilityId && c.agentName === step.agentName
    ) || capabilityList.find(
      (c) => c.capabilityId === step.capabilityId
    );

    if (!match) continue;

    const cost = parseFloat(match.price);
    totalCost += cost;

    if (totalCost > budget.balance) {
      logger.warn("orchestrator", "budget_exceeded_in_plan", { totalCost, budget: budget.balance });
      break;
    }

    resolvedSteps.push({
      agentName: match.agentName,
      agentDid: match.agentDid,
      agentEndpoint: match.agentEndpoint,
      walletAddress: match.walletAddress,
      capabilityId: match.capabilityId,
      input: step.input || userInput,
      inputFromPrev: step.inputFromPrev || false,
      estimatedCost: cost,
    });
  }

  if (resolvedSteps.length === 0) {
    throw new Error("No valid agents found for the planned steps");
  }

  // Notify UI of planned steps
  if (onStep) {
    onStep({
      type: "planned",
      steps: resolvedSteps.map((s) => ({
        agentName: s.agentName,
        capabilityId: s.capabilityId,
        estimatedCost: s.estimatedCost,
        label: `${s.agentName}: ${s.capabilityId}`,
      })),
    });
  }

  logger.info("orchestrator", "executing", {
    callerAgentDid,
    steps: resolvedSteps.length,
    totalCost: totalCost.toFixed(2),
  });

  // Step 2: Execute each step
  const results: StepResult[] = [];
  const authorityKp = getAuthorityKeypair();
  const mint = getUsdcMint();
  const connection = getConnection();

  for (let i = 0; i < resolvedSteps.length; i++) {
    const step = resolvedSteps[i];
    const taskId = `orch_${Math.random().toString(36).slice(2, 8)}`;

    // Determine input
    let stepInput = step.input;
    if (step.inputFromPrev && i > 0 && results[i - 1]?.artifact) {
      stepInput = results[i - 1].artifact!;
    }

    if (onStep) onStep({ type: "step_start", stepIndex: i });

    logger.info("orchestrator", "step_start", {
      callerAgentDid,
      step: i + 1,
      target: step.agentName,
      capability: step.capabilityId,
    });

    // Reserve budget
    try {
      await reserveBudget(callerAgentDid, step.estimatedCost, taskId, step.agentDid);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ status: "failed", error: `Budget: ${msg}`, cost: 0 });
      break;
    }

    // Create escrow
    let escrowTxHash: string;
    try {
      const isHosted = step.agentEndpoint.includes("/api/hosted-agent");
      const payeeWallet = isHosted
        ? authorityKp.publicKey
        : new PublicKey(step.walletAddress || authorityKp.publicKey.toBase58());
      const payerAta = await getAssociatedTokenAddress(mint, authorityKp.publicKey);

      const tx = new Transaction();
      try { await getAccount(connection, payerAta); } catch {
        tx.add(createAssociatedTokenAccountInstruction(authorityKp.publicKey, payerAta, authorityKp.publicKey, mint));
      }

      const amountLamports = BigInt(Math.round(step.estimatedCost * Math.pow(10, USDC_DECIMALS)));
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

      escrowTxHash = await sendAndConfirmTransaction(connection, tx, [authorityKp]);

      createEscrowRecord({
        taskId,
        amount: step.estimatedCost.toFixed(2),
        from: "platform-authority",
        to: isHosted ? authorityKp.publicKey.toBase58() : (step.walletAddress || authorityKp.publicKey.toBase58()),
        escrowTxHash,
        agentEndpoint: step.agentEndpoint,
      });
    } catch (err) {
      await refundBudget(callerAgentDid, step.estimatedCost, taskId).catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ status: "failed", error: `Escrow: ${msg}`, cost: 0 });
      break;
    }

    // Call target agent
    try {
      // Inject memory context (skip for search/data — memory pollutes queries)
      let enrichedInput = stepInput;
      const skipMem = ["web.search", "data.retrieve"].includes(step.capabilityId);
      if (callerAddress && !skipMem) {
        try {
          const memCtx = await buildMemoryContext(step.agentDid, callerAddress);
          if (memCtx) enrichedInput = stepInput + memCtx;
        } catch { /* best-effort */ }
      }

      const result = await executeTask(step.agentEndpoint, step.capabilityId, enrichedInput, taskId, 500, 60);

      if (result.status === "COMPLETED" && result.artifact) {
        await releaseEscrow(taskId);

        // Charge per-step orchestration fee from budget
        const stepTotalCost = step.estimatedCost + ORCHESTRATION_FEE_PER_STEP;
        try {
          await reserveBudget(callerAgentDid, ORCHESTRATION_FEE_PER_STEP, `${taskId}_fee`, "platform-orchestration-fee");
          logger.info("orchestrator", "fee_charged", { callerAgentDid, fee: ORCHESTRATION_FEE_PER_STEP, taskId });
        } catch {
          logger.warn("orchestrator", "fee_charge_failed", { callerAgentDid, taskId });
          // Don't fail the step if fee charge fails — agent cost was already paid
        }

        results.push({ status: "completed", artifact: result.artifact, cost: stepTotalCost, agentName: step.agentName, capabilityId: step.capabilityId });

        // Extract memory hints (async, non-blocking)
        if (callerAddress && result.artifact) {
          extractMemoryHints(result.artifact, stepInput).then((hints) => {
            if (hints.length > 0) {
              saveMemories(hints.map((h) => ({
                agent_did: step.agentDid,
                user_wallet: callerAddress,
                memory_type: h.type,
                content: h.content,
              }))).catch(() => {});
            }
          }).catch(() => {});
        }

        if (onStep) onStep({ type: "step_done", stepIndex: i, artifact: result.artifact });

        logger.info("orchestrator", "step_completed", {
          callerAgentDid,
          step: i + 1,
          target: step.agentName,
        });
      } else {
        await refundEscrow(taskId).catch(() => {});
        await refundBudget(callerAgentDid, step.estimatedCost, taskId).catch(() => {});
        results.push({ status: "failed", error: result.error || "Agent failed", cost: 0 });
        if (onStep) onStep({ type: "step_failed", stepIndex: i, error: result.error || "Agent failed" });
        break;
      }
    } catch (err) {
      await refundEscrow(taskId).catch(() => {});
      await refundBudget(callerAgentDid, step.estimatedCost, taskId).catch(() => {});
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ status: "failed", error: msg, cost: 0 });
      break;
    }
  }

  // Step 3: Synthesize final result
  const totalSpent = results.reduce((s, r) => s + r.cost, 0);
  const completedResults = results.filter((r) => r.status === "completed" && r.artifact);

  if (completedResults.length === 0) {
    const lastError = results.find((r) => r.status === "failed")?.error || "All steps failed";
    throw new Error(`Orchestration failed: ${lastError}`);
  }

  const stepSummaries = completedResults
    .map((r, i) => `Step ${i + 1} result:\n${r.artifact}`)
    .join("\n\n---\n\n");

  const synthesisResponse = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system:
      systemPrompt +
      "\n\nYou received results from multiple agent calls. Synthesize them into a single, coherent response for the user. " +
      "Do not mention the agents or steps — just provide the final answer as if you did it yourself.",
    messages: [
      { role: "user", content: userInput },
      { role: "assistant", content: `I gathered the following information:\n\n${stepSummaries}` },
      { role: "user", content: "Now provide the final synthesized answer." },
    ],
  });

  const synthesisText = synthesisResponse.content[0];
  const finalAnswer = synthesisText.type === "text" ? synthesisText.text : "No response";

  logger.info("orchestrator", "completed", {
    callerAgentDid,
    steps: resolvedSteps.length,
    completed: completedResults.length,
    totalSpent: totalSpent.toFixed(2),
  });

  return {
    answer: finalAnswer,
    totalSpent,
    stepsCompleted: completedResults.length,
    subTasks: results.map((r) => ({
      agentName: r.agentName || "Unknown",
      capabilityId: r.capabilityId || "",
      cost: r.cost,
      status: r.status,
    })),
  };
}
