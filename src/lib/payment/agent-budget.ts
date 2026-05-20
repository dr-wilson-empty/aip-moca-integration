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
import { dbHasDepositTxn } from "@/lib/supabase/agent-budgets";
import {
  dbGetBudget,
  dbDepositBudget,
  dbSpendBudget,
  dbRefundBudget,
  dbWithdrawBudget,
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
 * Verify an on-chain USDC deposit to the platform authority wallet and
 * credit the agent's budget.
 *
 * Hardened against a previous flaw where any confirmed signature was
 * accepted — an attacker could scrape a random successful tx hash from
 * the explorer and credit themselves arbitrary USDC. We now parse the
 * tx and require:
 *
 *   1. Idempotency:   txHash hasn't been credited before
 *   2. Confirmed + no `meta.err`
 *   3. The tx contains an SPL Token transfer (Transfer or TransferChecked)
 *   4. Mint = configured USDC mint
 *   5. Destination = platform authority's USDC ATA
 *   6. Source token-account owner = ownerWallet
 *   7. Amount (raw, micro-USDC) = expectedAmount * 10^6
 */
export async function verifyAndCreditDeposit(
  agentDid: string,
  ownerWallet: string,
  txHash: string,
  expectedAmount: number
): Promise<DbAgentBudget> {
  // 1. Idempotency — refuse to credit the same on-chain tx twice.
  if (await dbHasDepositTxn(txHash)) {
    throw new Error(`Deposit already credited for this transaction: ${txHash}`);
  }

  const connection = getConnection();
  // 2. + structured parsing — getParsedTransaction returns parsed SPL
  //    Token instructions so we don't have to decode raw bytes ourselves.
  const txInfo = await connection.getParsedTransaction(txHash, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  if (!txInfo) {
    throw new Error(`Transaction not found or not confirmed: ${txHash}`);
  }
  if (txInfo.meta?.err) {
    throw new Error(`Transaction failed on-chain: ${JSON.stringify(txInfo.meta.err)}`);
  }

  // 3-7. Find a USDC transfer matching the expected sender/recipient/amount.
  const mint = getUsdcMint();
  const authorityPubkey = new PublicKey(process.env.ESCROW_PRIVATE_KEY ? "" : "");
  // We need the authority's ATA; derive it lazily.
  let authorityAta: PublicKey;
  try {
    const bs58 = (await import("bs58")).default;
    if (!process.env.ESCROW_PRIVATE_KEY) throw new Error("ESCROW_PRIVATE_KEY not set");
    const authorityKp = Keypair.fromSecretKey(bs58.decode(process.env.ESCROW_PRIVATE_KEY));
    authorityAta = await getAssociatedTokenAddress(mint, authorityKp.publicKey);
    void authorityPubkey;
  } catch (err) {
    throw new Error(
      `Could not derive platform authority ATA: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const expectedRawAmount = BigInt(Math.round(expectedAmount * Math.pow(10, USDC_DECIMALS)));

  // Walk every parsed top-level instruction looking for a matching SPL
  // Token transfer. We accept both `transfer` (legacy) and
  // `transferChecked` (modern, mint-verified) variants.
  const instructions = txInfo.transaction.message.instructions as Array<
    | {
        program?: string;
        programId?: PublicKey;
        parsed?: {
          type: string;
          info: Record<string, unknown>;
        };
      }
    | { programId: PublicKey; data: string; accounts: PublicKey[] }
  >;

  let matched = false;
  for (const ix of instructions) {
    if (!("parsed" in ix) || !ix.parsed) continue;
    if (ix.program !== "spl-token" && ix.program !== "spl-token-2022") continue;

    const { type, info } = ix.parsed;
    let txAuthority: string | undefined;
    let txDestination: string | undefined;
    let txMint: string | undefined;
    let txAmountRaw: bigint | undefined;

    if (type === "transferChecked") {
      txAuthority = info.authority as string | undefined;
      txDestination = info.destination as string | undefined;
      txMint = info.mint as string | undefined;
      const tokenAmount = info.tokenAmount as { amount?: string } | undefined;
      if (tokenAmount?.amount) {
        try { txAmountRaw = BigInt(tokenAmount.amount); } catch { /* skip */ }
      }
    } else if (type === "transfer") {
      // Legacy SPL Transfer doesn't carry mint in the ix data — we infer
      // by looking up the destination ATA's mint via the tx's account
      // keys / postTokenBalances.
      txAuthority = info.authority as string | undefined;
      txDestination = info.destination as string | undefined;
      try { txAmountRaw = BigInt((info.amount as string | number).toString()); } catch { /* skip */ }
      // Mint comes from postTokenBalances if destination matches.
      const postBalances = txInfo.meta?.postTokenBalances ?? [];
      const balance = postBalances.find((b) => {
        const acctKeys = txInfo.transaction.message.accountKeys as Array<{ pubkey: PublicKey }>;
        return acctKeys[b.accountIndex]?.pubkey.toBase58() === txDestination;
      });
      txMint = balance?.mint;
    } else {
      continue;
    }

    if (txMint !== mint.toBase58()) continue;
    if (txDestination !== authorityAta.toBase58()) continue;
    if (txAuthority !== ownerWallet) continue;
    if (txAmountRaw !== expectedRawAmount) continue;

    matched = true;
    break;
  }

  if (!matched) {
    throw new Error(
      "On-chain transfer does not match the claimed deposit. " +
        `Expected: ${expectedAmount} USDC from ${ownerWallet} to the platform authority ATA. ` +
        "Make sure you signed an SPL token transfer of the exact USDC amount to the platform wallet, not a SOL transfer or a different token."
    );
  }

  logger.info("budget", "deposit_verified", {
    agentDid,
    ownerWallet,
    amount: expectedAmount,
    txHash,
  });

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
 * Withdraw USDC from an agent's budget back to the owner wallet.
 * Sends an on-chain SPL transfer from authority wallet to owner.
 */
export async function withdrawBudget(
  agentDid: string,
  ownerWallet: string,
  amount: number
): Promise<{ txHash: string; budget: DbAgentBudget }> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error("No budget found for this agent");
  if (budget.owner_wallet !== ownerWallet) throw new Error("Not the budget owner");
  if (budget.balance < amount) throw new Error(`Insufficient balance: ${budget.balance.toFixed(6)} USDC`);
  if (amount <= 0) throw new Error("Amount must be positive");

  // On-chain SPL transfer: authority → owner
  const connection = getConnection();
  const authorityKey = process.env.ESCROW_PRIVATE_KEY;
  if (!authorityKey) throw new Error("ESCROW_PRIVATE_KEY not set");
  const authority = Keypair.fromSecretKey(
    (await import("bs58")).default.decode(authorityKey)
  );
  const mint = getUsdcMint();
  const ownerPubkey = new PublicKey(ownerWallet);

  const authorityAta = await getAssociatedTokenAddress(mint, authority.publicKey);
  const ownerAta = await getAssociatedTokenAddress(mint, ownerPubkey);

  const tx = new Transaction();

  // Ensure owner ATA exists
  try {
    await getAccount(connection, ownerAta);
  } catch {
    tx.add(createAssociatedTokenAccountInstruction(authority.publicKey, ownerAta, ownerPubkey, mint));
  }

  const lamports = BigInt(Math.round(amount * Math.pow(10, USDC_DECIMALS)));
  tx.add(createTransferInstruction(authorityAta, ownerAta, authority.publicKey, lamports));

  const txHash = await sendAndConfirmTransaction(connection, tx, [authority]);

  // Update DB
  const updated = await dbWithdrawBudget(agentDid, amount, txHash);

  logger.info("budget", "withdrawal", { agentDid, ownerWallet, amount, txHash });

  return { txHash, budget: updated };
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
