/**
 * Setup Supabase tables for AIP.
 * Run: npx tsx scripts/setup-db.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SQL = `
-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  caller_did TEXT NOT NULL,
  caller_address TEXT NOT NULL,
  agent_did TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  agent_address TEXT NOT NULL,
  capability TEXT NOT NULL,
  input TEXT NOT NULL,
  amount TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'SUBMITTED',
  escrow_tx_hash TEXT,
  settlement_tx_hash TEXT,
  artifact TEXT,
  fail_reason TEXT,
  log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Escrows table
CREATE TABLE IF NOT EXISTS escrows (
  task_id TEXT PRIMARY KEY,
  amount TEXT NOT NULL,
  payer TEXT NOT NULL,
  payee TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'LOCKED',
  escrow_tx_hash TEXT,
  settlement_tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent cache table
CREATE TABLE IF NOT EXISTS agent_cache (
  did TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  type TEXT NOT NULL,
  version TEXT,
  wallet_address TEXT,
  capabilities_json TEXT,
  on_chain BOOLEAN DEFAULT false,
  agent_id TEXT,
  owner TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Twin messages table
CREATE TABLE IF NOT EXISTS twin_messages (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  plan JSONB,
  task_id TEXT,
  artifact TEXT,
  escrow_tx_hash TEXT,
  settlement_tx_hash TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_tasks_caller ON tasks(caller_address);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
CREATE INDEX IF NOT EXISTS idx_agent_cache_endpoint ON agent_cache(endpoint);
CREATE INDEX IF NOT EXISTS idx_twin_messages_wallet ON twin_messages(wallet_address);
`;

async function setup() {
  console.log("Setting up Supabase tables...");

  // Execute each statement separately
  const statements = SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0);

  for (const stmt of statements) {
    const { error } = await supabase.rpc("exec_sql", { sql: stmt + ";" }).single();
    if (error) {
      // rpc might not exist, try raw query approach
      console.log(`Statement: ${stmt.slice(0, 60)}...`);
      console.log(`  Note: Run this SQL in Supabase Dashboard → SQL Editor`);
    }
  }

  // Alternatively, verify tables exist by trying to select from them
  console.log("\nVerifying tables...");

  for (const table of ["tasks", "escrows", "agent_cache", "twin_messages"]) {
    const { error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`  ✗ ${table}: ${error.message}`);
    } else {
      console.log(`  ✓ ${table}: OK`);
    }
  }

  console.log("\nDone. If tables are missing, copy the SQL above into Supabase Dashboard → SQL Editor.");
}

setup().catch(console.error);
