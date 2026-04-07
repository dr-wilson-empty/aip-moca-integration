import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";

/**
 * POST /api/setup
 * Creates missing Supabase tables. Safe to call multiple times.
 */
export async function POST() {
  const sb = getSupabase();
  const results: Record<string, string> = {};

  // List of tables to check/create via insert-test approach
  const tables = [
    "hosted_agents",
    "agent_budgets",
    "agent_budget_txns",
    "agent_memory",
    "ratings",
  ];

  for (const table of tables) {
    const { error } = await sb.from(table).select("*").limit(0);
    if (error) {
      results[table] = `MISSING — create via SQL Editor`;
    } else {
      results[table] = "OK";
    }
  }

  const missing = Object.entries(results).filter(([, v]) => v !== "OK").map(([k]) => k);

  if (missing.length === 0) {
    return NextResponse.json({ status: "all_tables_ok", results });
  }

  // Generate SQL for missing tables
  const sqlMap: Record<string, string> = {
    hosted_agents: `CREATE TABLE IF NOT EXISTS hosted_agents (
  agent_id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  system_prompt TEXT NOT NULL,
  tier TEXT NOT NULL DEFAULT 'platform',
  provider TEXT NOT NULL DEFAULT 'anthropic',
  custom_api_key TEXT,
  capabilities_json TEXT NOT NULL DEFAULT '[]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hosted_agents_owner ON hosted_agents(owner_address);`,
    agent_budgets: `CREATE TABLE IF NOT EXISTS agent_budgets (
  agent_did TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
  max_per_task NUMERIC(20, 6) NOT NULL DEFAULT 1.0,
  total_spent NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_deposited NUMERIC(20, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_budgets_owner ON agent_budgets(owner_wallet);`,
    agent_budget_txns: `CREATE TABLE IF NOT EXISTS agent_budget_txns (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL REFERENCES agent_budgets(agent_did),
  type TEXT NOT NULL,
  amount NUMERIC(20, 6) NOT NULL,
  task_id TEXT,
  target_agent_did TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_budget_txns_agent ON agent_budget_txns(agent_did);`,
    agent_memory: `CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'preference',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_pair ON agent_memory(agent_did, user_wallet);`,
    ratings: `CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  agent_did TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  task_id TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);`,
  };

  const sql = missing.map((t) => sqlMap[t]).filter(Boolean).join("\n\n");

  // Recommended indexes and constraints for existing tables
  const migrationSQL = `
-- Phase 7 Index & Constraint Migrations (safe to run multiple times)

-- Tasks: index for time-based sorting
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks(created_at DESC);

-- Escrows: compound index for status lookups
CREATE INDEX IF NOT EXISTS idx_escrows_task_status ON escrows(task_id, status);

-- Escrows: unique constraint on tx hash
DO $$ BEGIN
  ALTER TABLE escrows ADD CONSTRAINT uq_escrows_escrow_tx_hash UNIQUE (escrow_tx_hash);
EXCEPTION WHEN duplicate_table THEN NULL; WHEN duplicate_object THEN NULL;
END $$;

-- Agent memory: index for TTL cleanup
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires ON agent_memory(expires_at) WHERE expires_at IS NOT NULL;

-- Twin messages: index for wallet + time pagination
CREATE INDEX IF NOT EXISTS idx_twin_messages_wallet_time ON twin_messages(wallet_address, created_at DESC);

-- Automations: index for wallet lookup
CREATE INDEX IF NOT EXISTS idx_automations_wallet ON automations(wallet_address);

-- Hosted agents: can_orchestrate column (may not exist)
DO $$ BEGIN
  ALTER TABLE hosted_agents ADD COLUMN IF NOT EXISTS can_orchestrate BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
`.trim();

  return NextResponse.json({
    status: "missing_tables",
    missing,
    results,
    sql,
    migrationSQL,
    instructions: "Run the SQL below in Supabase Dashboard → SQL Editor, then call POST /api/setup again to verify. Also run migrationSQL for Phase 7 indexes.",
  });
}
