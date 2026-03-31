-- AIP Supabase Schema
-- Run this in Supabase Dashboard → SQL Editor

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
