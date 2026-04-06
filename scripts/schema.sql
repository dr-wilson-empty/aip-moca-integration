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
  delegated_by TEXT,                    -- DID of the agent that delegated this task (null = human)
  is_agent_task BOOLEAN DEFAULT false,  -- true if created by agent-to-agent delegation
  chain_id TEXT,                        -- Chain ID for grouped autonomous pipeline tasks
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
  source TEXT DEFAULT 'synced',  -- 'ui' = registered via AIP UI, 'synced' = discovered via chain sync
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

-- Agent budgets table (Phase 5 — agent-to-agent payments)
CREATE TABLE IF NOT EXISTS agent_budgets (
  agent_did TEXT PRIMARY KEY,
  owner_wallet TEXT NOT NULL,
  balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
  max_per_task NUMERIC(20, 6) NOT NULL DEFAULT 1.0,
  total_spent NUMERIC(20, 6) NOT NULL DEFAULT 0,
  total_deposited NUMERIC(20, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Agent budget transactions log (deposits, spends, refunds)
CREATE TABLE IF NOT EXISTS agent_budget_txns (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL REFERENCES agent_budgets(agent_did),
  type TEXT NOT NULL,  -- 'deposit' | 'spend' | 'refund' | 'release'
  amount NUMERIC(20, 6) NOT NULL,
  task_id TEXT,
  target_agent_did TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automations table (with webhook trigger support — Phase 5)
CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule TEXT NOT NULL DEFAULT 'daily',
  budget_limit NUMERIC(20, 6) NOT NULL DEFAULT 1.0,
  budget_period TEXT NOT NULL DEFAULT 'daily',
  enabled BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  total_spent NUMERIC(20, 6) NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL DEFAULT 'schedule',  -- 'schedule' | 'webhook'
  webhook_secret TEXT,                            -- HMAC secret for webhook auth
  last_trigger_at TIMESTAMPTZ,                    -- rate limiting: last webhook trigger time
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Automation results table
CREATE TABLE IF NOT EXISTS automation_results (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  agent_name TEXT,
  capability TEXT,
  input TEXT,
  artifact TEXT,
  estimated_cost TEXT,
  status TEXT,
  trigger_source TEXT DEFAULT 'manual',  -- 'manual' | 'schedule' | 'webhook'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Agent memory table (Phase 5 — per user-agent pair memory)
CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'preference',  -- 'preference' | 'context' | 'fact'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Hosted agents table (persisted no-code agents)
CREATE TABLE IF NOT EXISTS hosted_agents (
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_hosted_agents_owner ON hosted_agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_agent_memory_pair ON agent_memory(agent_did, user_wallet);
CREATE INDEX IF NOT EXISTS idx_automations_wallet ON automations(wallet_address);
CREATE INDEX IF NOT EXISTS idx_automations_trigger ON automations(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_results_auto ON automation_results(automation_id);
CREATE INDEX IF NOT EXISTS idx_agent_budgets_owner ON agent_budgets(owner_wallet);
CREATE INDEX IF NOT EXISTS idx_agent_budget_txns_agent ON agent_budget_txns(agent_did);
CREATE INDEX IF NOT EXISTS idx_tasks_caller ON tasks(caller_address);
CREATE INDEX IF NOT EXISTS idx_tasks_state ON tasks(state);
CREATE INDEX IF NOT EXISTS idx_tasks_chain ON tasks(chain_id);
CREATE INDEX IF NOT EXISTS idx_escrows_status ON escrows(status);
CREATE INDEX IF NOT EXISTS idx_agent_cache_endpoint ON agent_cache(endpoint);
CREATE INDEX IF NOT EXISTS idx_twin_messages_wallet ON twin_messages(wallet_address);
