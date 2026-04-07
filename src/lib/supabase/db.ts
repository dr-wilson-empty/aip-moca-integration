/**
 * Supabase persistence layer for AIP.
 * All writes are fire-and-forget (non-blocking) to keep in-memory speed.
 * Reads are used for history/recovery.
 */
import { getSupabase } from "./client";

/* ------------------------------------------------------------------ */
/*  Tasks                                                              */
/* ------------------------------------------------------------------ */

export interface DbTask {
  id: string;
  caller_did: string;
  caller_address: string;
  agent_did: string;
  agent_name: string;
  agent_address: string;
  capability: string;
  input: string;
  amount: string;
  state: string;
  escrow_tx_hash?: string;
  settlement_tx_hash?: string;
  artifact?: string;
  fail_reason?: string;
  delegated_by?: string;
  is_agent_task?: boolean;
  chain_id?: string;
  log: unknown[];
  created_at?: string;
  updated_at?: string;
}

export async function dbUpsertTask(task: DbTask): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("tasks").upsert(task, { onConflict: "id" });
  } catch { /* non-blocking */ }
}

export async function dbGetTask(id: string): Promise<DbTask | null> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from("tasks").select("*").eq("id", id).single();
    return data;
  } catch { return null; }
}

export async function dbListTasks(callerAddress?: string): Promise<DbTask[]> {
  try {
    const sb = getSupabase();
    let q = sb.from("tasks").select("*").order("created_at", { ascending: false }).limit(100);
    if (callerAddress) q = q.eq("caller_address", callerAddress);
    const { data } = await q;
    return data ?? [];
  } catch { return []; }
}

/* ------------------------------------------------------------------ */
/*  Escrows                                                            */
/* ------------------------------------------------------------------ */

export interface DbEscrow {
  task_id: string;
  amount: string;
  payer: string;
  payee: string;
  status: string;
  escrow_tx_hash?: string;
  settlement_tx_hash?: string;
}

export async function dbUpsertEscrow(escrow: DbEscrow): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("escrows").upsert(escrow, { onConflict: "task_id" });
  } catch { /* non-blocking */ }
}

/* ------------------------------------------------------------------ */
/*  Agent Cache                                                        */
/* ------------------------------------------------------------------ */

export interface DbAgent {
  did: string;
  name: string;
  endpoint: string;
  type: string;
  version?: string;
  wallet_address?: string;
  capabilities_json?: string;
  on_chain?: boolean;
  agent_id?: string;
  owner?: string;
  source?: string; // 'ui' | 'synced'
}

export async function dbUpsertAgent(agent: DbAgent): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("agent_cache").upsert(agent, { onConflict: "did" });
  } catch { /* non-blocking */ }
}

export async function dbListAgents(): Promise<DbAgent[]> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from("agent_cache").select("*").order("created_at", { ascending: false });
    return data ?? [];
  } catch { return []; }
}

/** Mark an agent as registered via UI (for source tracking) */
export async function dbMarkAgentUIRegistered(did: string, owner: string, agentId: string): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("agent_cache").upsert(
      { did, owner, agent_id: agentId, source: "ui", name: "", endpoint: "", type: "Task" },
      { onConflict: "did" }
    );
  } catch { /* non-blocking */ }
}

/** Get agents registered via UI for a specific owner */
export async function dbGetUIRegisteredDids(owner: string): Promise<Set<string>> {
  try {
    const sb = getSupabase();
    const { data } = await sb.from("agent_cache")
      .select("did")
      .eq("owner", owner)
      .eq("source", "ui");
    return new Set((data ?? []).map((r: { did: string }) => r.did));
  } catch { return new Set(); }
}

/* ------------------------------------------------------------------ */
/*  Twin Messages                                                      */
/* ------------------------------------------------------------------ */

export interface DbTwinMessage {
  id: string;
  wallet_address: string;
  role: string;
  content: string;
  plan?: unknown;
  task_id?: string;
  artifact?: string;
  escrow_tx_hash?: string;
  settlement_tx_hash?: string;
  state?: string;
}

export async function dbInsertTwinMessage(msg: DbTwinMessage): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("twin_messages").insert(msg);
  } catch { /* non-blocking */ }
}

export async function dbUpdateTwinMessage(id: string, update: Partial<DbTwinMessage>): Promise<void> {
  try {
    const sb = getSupabase();
    await sb.from("twin_messages").update(update).eq("id", id);
  } catch { /* non-blocking */ }
}

export async function dbGetTwinMessages(walletAddress: string, limit = 200, before?: string): Promise<DbTwinMessage[]> {
  try {
    const sb = getSupabase();
    let q = sb.from("twin_messages")
      .select("*")
      .eq("wallet_address", walletAddress)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (before) {
      q = q.lt("created_at", before);
    }

    const { data } = await q;
    // Reverse to return chronological order (oldest first)
    return (data ?? []).reverse();
  } catch { return []; }
}

export async function dbGetTwinMessageCount(walletAddress: string): Promise<number> {
  try {
    const sb = getSupabase();
    const { count } = await sb.from("twin_messages")
      .select("*", { count: "exact", head: true })
      .eq("wallet_address", walletAddress);
    return count ?? 0;
  } catch { return 0; }
}
