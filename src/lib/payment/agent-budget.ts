/**
 * Agent Budget Manager
 *
 * Manages USDC budgets for agent-to-agent payments.
 * Budget is server-side (Supabase) — no Solana program changes needed.
 * The platform authority wallet creates escrows on behalf of agents.
 *
 * Flow:
 * 1. Owner deposits USDC to platform authority wallet (on-chain SPL transfer)
 * 2. Platform credits the agent's server-side budget
 * 3. Agent delegates task → budget decreases → platform creates escrow
 * 4. Task completes → escrow releases to target agent
 * 5. Task fails → budget refunded
 */
import {
  PublicKey,
  Keypair,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
  createAssociatedTokenAccountInstruction,
  createTransferInstruction,
} from "@solana/spl-token";
import { getConnection } from "@/lib/solana/connection";
import {
  dbGetBudget,
  dbDepositBudget,
  dbSpendBudget,
  dbRefundBudget,
  dbGetBudgetsByOwner,
  dbGetBudgetTxns,
  type DbAgentBudget,
  type DbBudgetTxn,
} from "@/lib/supabase/agent-budgets";
import { logger } from "@/lib/logger";

const USDC_DECIMALS = 6;

function getUsdcMint(): PublicKey {
  const mint = process.env.USDC_MINT_DEVNET;
  if (!mint) throw new Error("USDC_MINT_DEVNET not set");
  return new PublicKey(mint);
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export { type DbAgentBudget, type DbBudgetTxn };

/** Get an agent's current budget */
export async function getAgentBudget(agentDid: string): Promise<DbAgentBudget | null> {
  return dbGetBudget(agentDid);
}

/** Get all budgets for an owner wallet */
export async function getOwnerBudgets(ownerWallet: string): Promise<DbAgentBudget[]> {
  return dbGetBudgetsByOwner(ownerWallet);
}

/** Get transaction history for an agent */
export async function getBudgetHistory(agentDid: string, limit = 50): Promise<DbBudgetTxn[]> {
  return dbGetBudgetTxns(agentDid, limit);
}

/**
 * Verify an on-chain USDC deposit to the platform authority wallet.
 * Checks the transaction signature to confirm the transfer happened.
 * Returns the deposited amount in USDC.
 */
export async function verifyAndCreditDeposit(
  agentDid: string,
  ownerWallet: string,
  txHash: string,
  expectedAmount: number
): Promise<DbAgentBudget> {
  const connection = getConnection();

  // Verify the transaction exists and is confirmed
  const txInfo = await connection.getTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });

  if (!txInfo) {
    throw new Error(`Transaction not found or not confirmed: ${txHash}`);
  }

  if (txInfo.meta?.err) {
    throw new Error(`Transaction failed: ${JSON.stringify(txInfo.meta.err)}`);
  }

  logger.info("budget", "deposit_verified", {
    agentDid,
    ownerWallet,
    amount: expectedAmount,
    txHash,
  });

  // Credit the budget
  return dbDepositBudget(agentDid, ownerWallet, expectedAmount, txHash);
}

/**
 * Reserve budget for a delegated task.
 * Called before creating the escrow.
 * Throws if insufficient funds or exceeds max_per_task.
 */
export async function reserveBudget(
  callerAgentDid: string,
  amount: number,
  taskId: string,
  targetAgentDid: string
): Promise<DbAgentBudget> {
  logger.info("budget", "reserving", {
    callerAgentDid,
    amount,
    taskId,
    targetAgentDid,
  });

  return dbSpendBudget(callerAgentDid, amount, taskId, targetAgentDid);
}

/**
 * Refund budget when a delegated task fails.
 */
export async function refundBudget(
  agentDid: string,
  amount: number,
  taskId: string
): Promise<DbAgentBudget> {
  logger.info("budget", "refunding", { agentDid, amount, taskId });
  return dbRefundBudget(agentDid, amount, taskId);
}

/**
 * Update max_per_task limit for an agent's budget.
 */
export async function updateMaxPerTask(
  agentDid: string,
  maxPerTask: number
): Promise<void> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error(`No budget found for agent: ${agentDid}`);
  budget.max_per_task = maxPerTask;
  const { dbUpsertBudget } = await import("@/lib/supabase/agent-budgets");
  await dbUpsertBudget(budget);
}
