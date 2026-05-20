/**
 * Agent Budget — Supabase persistence layer.
 *
 * Manages USDC budgets for agent-to-agent payments.
 * Each agent has a server-side balance that the platform uses
 * to create escrows on behalf of the agent (no human wallet signature needed).
 *
 * All mutating operations use Supabase RPC functions for atomicity.
 * This prevents race conditions in concurrent budget operations.
 */
import { getSupabase } from "./client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface DbAgentBudget {
  agent_did: string;
  owner_wallet: string;
  balance: number;
  max_per_task: number;
  total_spent: number;
  total_deposited: number;
  created_at?: string;
  updated_at?: string;
}

export interface DbBudgetTxn {
  id: string;
  agent_did: string;
  type: "deposit" | "spend" | "refund" | "release" | "withdraw";
  amount: number;
  task_id?: string;
  target_agent_did?: string;
  tx_hash?: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function genTxnId(prefix: string): string {
  return `btxn_${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Parse RPC result into DbAgentBudget, handling both array and object returns */
function parseRpcResult(data: unknown): DbAgentBudget {
  if (Array.isArray(data) && data.length > 0) return data[0] as DbAgentBudget;
  if (data && typeof data === "object" && "agent_did" in data) return data as DbAgentBudget;
  throw new Error("Unexpected RPC result format");
}

/* ------------------------------------------------------------------ */
/*  Budget Read Operations                                             */
/* ------------------------------------------------------------------ */

/** Get budget for an agent. Returns null if no budget exists. */
export async function dbGetBudget(agentDid: string): Promise<DbAgentBudget | null> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_budgets")
    .select("*")
    .eq("agent_did", agentDid)
    .single();
  return data;
}

/** Get all budgets for an owner wallet. */
export async function dbGetBudgetsByOwner(ownerWallet: string): Promise<DbAgentBudget[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_budgets")
    .select("*")
    .eq("owner_wallet", ownerWallet)
    .order("created_at", { ascending: false });
  return data ?? [];
}

/** Create or update a budget record (for settings like max_per_task). */
export async function dbUpsertBudget(budget: DbAgentBudget): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("agent_budgets").upsert(
    { ...budget, updated_at: new Date().toISOString() },
    { onConflict: "agent_did" }
  );
  if (error) throw new Error(`Budget upsert failed: ${error.message}`);
}

/* ------------------------------------------------------------------ */
/*  Atomic Budget Operations (via Supabase RPC)                        */
/* ------------------------------------------------------------------ */

/**
 * Deposit USDC into an agent's budget (atomic).
 * Uses budget_deposit RPC: INSERT ON CONFLICT UPDATE in single statement.
 * Falls back to JS read-modify-write if RPC not available.
 */
export async function dbDepositBudget(
  agentDid: string,
  ownerWallet: string,
  amount: number,
  txHash: string
): Promise<DbAgentBudget> {
  const sb = getSupabase();
  const txnId = genTxnId("dep");

  const { data, error } = await sb.rpc("budget_deposit", {
    p_agent_did: agentDid,
    p_owner_wallet: ownerWallet,
    p_amount: amount,
    p_tx_hash: txHash,
    p_txn_id: txnId,
  });

  if (error) {
    // RPC function might not exist yet — fallback to non-atomic
    if (error.message.includes("could not find the function") || error.code === "PGRST202") {
      console.warn("[budget] RPC budget_deposit not found — using non-atomic fallback. Run sql/budget-atomic-functions.sql");
      return dbDepositBudgetFallback(agentDid, ownerWallet, amount, txHash, txnId);
    }
    throw new Error(`Deposit failed: ${error.message}`);
  }

  return parseRpcResult(data);
}

/** Non-atomic fallback for deposit (used if RPC function not yet installed) */
async function dbDepositBudgetFallback(
  agentDid: string,
  ownerWallet: string,
  amount: number,
  txHash: string,
  txnId: string
): Promise<DbAgentBudget> {
  let budget = await dbGetBudget(agentDid);
  if (!budget) {
    budget = {
      agent_did: agentDid,
      owner_wallet: ownerWallet,
      balance: 0,
      max_per_task: 1.0,
      total_spent: 0,
      total_deposited: 0,
    };
  }
  budget.balance += amount;
  budget.total_deposited += amount;
  await dbUpsertBudget(budget);
  await dbInsertBudgetTxn({ id: txnId, agent_did: agentDid, type: "deposit", amount, tx_hash: txHash });
  return budget;
}

/**
 * Reserve (spend) from an agent's budget for a delegated task (atomic).
 * Uses budget_spend RPC: UPDATE WHERE balance >= amount AND amount <= max_per_task.
 */
export async function dbSpendBudget(
  agentDid: string,
  amount: number,
  taskId: string,
  targetAgentDid: string
): Promise<DbAgentBudget> {
  const sb = getSupabase();
  const txnId = genTxnId("spend");

  const { data, error } = await sb.rpc("budget_spend", {
    p_agent_did: agentDid,
    p_amount: amount,
    p_task_id: taskId,
    p_target_agent_did: targetAgentDid,
    p_txn_id: txnId,
  });

  if (error) {
    if (error.message.includes("could not find the function") || error.code === "PGRST202") {
      console.warn("[budget] RPC budget_spend not found — using non-atomic fallback. Run sql/budget-atomic-functions.sql");
      return dbSpendBudgetFallback(agentDid, amount, taskId, targetAgentDid, txnId);
    }
    // RPC raises specific exceptions — pass them through
    throw new Error(error.message);
  }

  return parseRpcResult(data);
}

/** Non-atomic fallback for spend */
async function dbSpendBudgetFallback(
  agentDid: string,
  amount: number,
  taskId: string,
  targetAgentDid: string,
  txnId: string
): Promise<DbAgentBudget> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error(`No budget found for agent: ${agentDid}`);
  if (budget.balance < amount) {
    throw new Error(`Insufficient budget: ${budget.balance.toFixed(6)} USDC available, ${amount.toFixed(6)} USDC required`);
  }
  if (amount > budget.max_per_task) {
    throw new Error(`Amount ${amount.toFixed(6)} exceeds max_per_task limit of ${budget.max_per_task.toFixed(6)} USDC`);
  }
  budget.balance -= amount;
  budget.total_spent += amount;
  await dbUpsertBudget(budget);
  await dbInsertBudgetTxn({ id: txnId, agent_did: agentDid, type: "spend", amount, task_id: taskId, target_agent_did: targetAgentDid });
  return budget;
}

/**
 * Refund budget when a delegated task fails (atomic).
 * Uses budget_refund RPC: UPDATE balance = balance + amount.
 */
export async function dbRefundBudget(
  agentDid: string,
  amount: number,
  taskId: string
): Promise<DbAgentBudget> {
  const sb = getSupabase();
  const txnId = genTxnId("refund");

  const { data, error } = await sb.rpc("budget_refund", {
    p_agent_did: agentDid,
    p_amount: amount,
    p_task_id: taskId,
    p_txn_id: txnId,
  });

  if (error) {
    if (error.message.includes("could not find the function") || error.code === "PGRST202") {
      console.warn("[budget] RPC budget_refund not found — using non-atomic fallback. Run sql/budget-atomic-functions.sql");
      return dbRefundBudgetFallback(agentDid, amount, taskId, txnId);
    }
    throw new Error(error.message);
  }

  return parseRpcResult(data);
}

/** Non-atomic fallback for refund */
async function dbRefundBudgetFallback(
  agentDid: string,
  amount: number,
  taskId: string,
  txnId: string
): Promise<DbAgentBudget> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error(`No budget found for agent: ${agentDid}`);
  budget.balance += amount;
  budget.total_spent -= amount;
  await dbUpsertBudget(budget);
  await dbInsertBudgetTxn({ id: txnId, agent_did: agentDid, type: "refund", amount, task_id: taskId });
  return budget;
}

/**
 * Withdraw from an agent's budget (atomic).
 * Uses budget_withdraw RPC: UPDATE WHERE balance >= amount.
 */
export async function dbWithdrawBudget(
  agentDid: string,
  amount: number,
  txHash: string
): Promise<DbAgentBudget> {
  const sb = getSupabase();
  const txnId = genTxnId("withdraw");

  const { data, error } = await sb.rpc("budget_withdraw", {
    p_agent_did: agentDid,
    p_amount: amount,
    p_tx_hash: txHash,
    p_txn_id: txnId,
  });

  if (error) {
    if (error.message.includes("could not find the function") || error.code === "PGRST202") {
      console.warn("[budget] RPC budget_withdraw not found — using non-atomic fallback. Run sql/budget-atomic-functions.sql");
      return dbWithdrawBudgetFallback(agentDid, amount, txHash, txnId);
    }
    throw new Error(error.message);
  }

  return parseRpcResult(data);
}

/** Non-atomic fallback for withdraw */
async function dbWithdrawBudgetFallback(
  agentDid: string,
  amount: number,
  txHash: string,
  txnId: string
): Promise<DbAgentBudget> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error(`No budget found for agent: ${agentDid}`);
  if (budget.balance < amount) {
    throw new Error(`Insufficient balance: ${budget.balance.toFixed(6)} USDC available, ${amount.toFixed(6)} USDC requested`);
  }
  budget.balance -= amount;
  await dbUpsertBudget(budget);
  await dbInsertBudgetTxn({ id: txnId, agent_did: agentDid, type: "withdraw" as DbBudgetTxn["type"], amount, tx_hash: txHash });
  return budget;
}

/* ------------------------------------------------------------------ */
/*  Transaction Log                                                    */
/* ------------------------------------------------------------------ */

async function dbInsertBudgetTxn(txn: DbBudgetTxn): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb.from("agent_budget_txns").insert(txn);
  if (error) console.error("[budget-txn] insert failed:", error.message);
}

/**
 * Returns true if a deposit transaction with this on-chain tx_hash has
 * already been credited. Used to prevent the same txHash being submitted
 * twice (or worse, the same txHash being submitted by an attacker who
 * scraped it from someone else's confirmed deposit).
 */
export async function dbHasDepositTxn(txHash: string): Promise<boolean> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from("agent_budget_txns")
    .select("id")
    .eq("tx_hash", txHash)
    .eq("type", "deposit")
    .limit(1);
  if (error) {
    console.error("[budget-txn] idempotency lookup failed:", error.message);
    return false; // fail-open lookup is fine — chain verification still gates the credit
  }
  return (data?.length ?? 0) > 0;
}

/** Get transaction history for an agent's budget */
export async function dbGetBudgetTxns(agentDid: string, limit = 50): Promise<DbBudgetTxn[]> {
  const sb = getSupabase();
  const { data } = await sb
    .from("agent_budget_txns")
    .select("*")
    .eq("agent_did", agentDid)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}
