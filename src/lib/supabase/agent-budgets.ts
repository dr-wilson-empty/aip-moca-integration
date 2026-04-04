/**
 * Agent Budget — Supabase persistence layer.
 *
 * Manages USDC budgets for agent-to-agent payments.
 * Each agent has a server-side balance that the platform uses
 * to create escrows on behalf of the agent (no human wallet signature needed).
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
  type: "deposit" | "spend" | "refund" | "release";
  amount: number;
  task_id?: string;
  target_agent_did?: string;
  tx_hash?: string;
  created_at?: string;
}

/* ------------------------------------------------------------------ */
/*  Budget CRUD                                                        */
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

/** Create or update a budget record. */
export async function dbUpsertBudget(budget: DbAgentBudget): Promise<void> {
  const sb = getSupabase();
  await sb.from("agent_budgets").upsert(
    { ...budget, updated_at: new Date().toISOString() },
    { onConflict: "agent_did" }
  );
}

/* ------------------------------------------------------------------ */
/*  Atomic Budget Operations                                           */
/* ------------------------------------------------------------------ */

/**
 * Deposit USDC into an agent's budget.
 * Called after on-chain USDC transfer from owner wallet to platform authority.
 */
export async function dbDepositBudget(
  agentDid: string,
  ownerWallet: string,
  amount: number,
  txHash: string
): Promise<DbAgentBudget> {
  const sb = getSupabase();

  // Get or create budget
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

  // Log transaction
  await dbInsertBudgetTxn({
    id: `btxn_dep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agent_did: agentDid,
    type: "deposit",
    amount,
    tx_hash: txHash,
  });

  return budget;
}

/**
 * Reserve (spend) from an agent's budget for a delegated task.
 * Returns updated budget or throws if insufficient funds.
 */
export async function dbSpendBudget(
  agentDid: string,
  amount: number,
  taskId: string,
  targetAgentDid: string
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

  await dbInsertBudgetTxn({
    id: `btxn_spend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agent_did: agentDid,
    type: "spend",
    amount,
    task_id: taskId,
    target_agent_did: targetAgentDid,
  });

  return budget;
}

/**
 * Refund budget when a delegated task fails.
 * Returns the spent amount to the agent's balance.
 */
export async function dbRefundBudget(
  agentDid: string,
  amount: number,
  taskId: string
): Promise<DbAgentBudget> {
  const budget = await dbGetBudget(agentDid);
  if (!budget) throw new Error(`No budget found for agent: ${agentDid}`);

  budget.balance += amount;
  budget.total_spent -= amount;
  await dbUpsertBudget(budget);

  await dbInsertBudgetTxn({
    id: `btxn_refund_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    agent_did: agentDid,
    type: "refund",
    amount,
    task_id: taskId,
  });

  return budget;
}

/* ------------------------------------------------------------------ */
/*  Transaction Log                                                    */
/* ------------------------------------------------------------------ */

async function dbInsertBudgetTxn(txn: DbBudgetTxn): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("agent_budget_txns").insert(txn);
  } catch { /* non-blocking */ }
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
