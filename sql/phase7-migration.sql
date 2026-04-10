-- =====================================================================
-- AIP Phase 7 — Database Migration
-- Supabase SQL Editor'da calistirin.
-- Tum ifadeler idempotent — birden fazla calistirilabilir.
-- =====================================================================

-- =====================================================================
-- 1. EKSIK TABLOLAR (yoksa olustur)
-- =====================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  caller_did TEXT NOT NULL,
  caller_address TEXT NOT NULL,
  agent_did TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT '',
  agent_address TEXT NOT NULL DEFAULT '',
  capability TEXT NOT NULL DEFAULT '',
  input TEXT NOT NULL DEFAULT '',
  amount TEXT NOT NULL DEFAULT '0',
  state TEXT NOT NULL DEFAULT 'SUBMITTED',
  escrow_tx_hash TEXT,
  settlement_tx_hash TEXT,
  artifact TEXT,
  fail_reason TEXT,
  delegated_by TEXT,
  is_agent_task BOOLEAN DEFAULT false,
  chain_id TEXT,
  log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS twin_messages (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  plan JSONB,
  task_id TEXT,
  artifact TEXT,
  escrow_tx_hash TEXT,
  settlement_tx_hash TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automations (
  id TEXT PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  schedule TEXT NOT NULL DEFAULT 'daily',
  budget_limit NUMERIC(20,6) NOT NULL DEFAULT 1.0,
  budget_period TEXT NOT NULL DEFAULT 'daily',
  enabled BOOLEAN DEFAULT true,
  total_spent NUMERIC(20,6) NOT NULL DEFAULT 0,
  run_count INTEGER NOT NULL DEFAULT 0,
  last_run TIMESTAMPTZ,
  trigger_type TEXT NOT NULL DEFAULT 'schedule',
  webhook_secret TEXT,
  watch_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automation_results (
  id TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL,
  agent_name TEXT NOT NULL DEFAULT '',
  capability TEXT NOT NULL DEFAULT '',
  input TEXT NOT NULL DEFAULT '',
  artifact TEXT,
  estimated_cost TEXT NOT NULL DEFAULT '0',
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ DEFAULT now()
);

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
  can_orchestrate BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS agent_budget_txns (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL,
  type TEXT NOT NULL,
  amount NUMERIC(20, 6) NOT NULL,
  task_id TEXT,
  target_agent_did TEXT,
  tx_hash TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_memory (
  id TEXT PRIMARY KEY,
  agent_did TEXT NOT NULL,
  user_wallet TEXT NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'preference',
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  agent_did TEXT NOT NULL,
  wallet_address TEXT NOT NULL,
  task_id TEXT,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_cache (
  did TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  endpoint TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Task',
  version TEXT,
  wallet_address TEXT,
  capabilities_json TEXT,
  on_chain BOOLEAN DEFAULT false,
  agent_id TEXT,
  owner TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS preferences (
  wallet_address TEXT PRIMARY KEY,
  language TEXT DEFAULT 'auto',
  detail_level TEXT DEFAULT 'medium',
  custom_instructions TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================================
-- 2. INDEXLER (performans)
-- =====================================================================

-- Tasks: zamana gore siralama
CREATE INDEX IF NOT EXISTS idx_tasks_created_at
  ON tasks(created_at DESC);

-- Tasks: caller'a gore filtreleme
CREATE INDEX IF NOT EXISTS idx_tasks_caller_address
  ON tasks(caller_address);

-- Tasks: agent'a gore filtreleme
CREATE INDEX IF NOT EXISTS idx_tasks_agent_did
  ON tasks(agent_did);

-- Escrows: task_id + status compound index
CREATE INDEX IF NOT EXISTS idx_escrows_task_status
  ON escrows(task_id, status);

-- Twin messages: wallet + zaman (cursor pagination)
CREATE INDEX IF NOT EXISTS idx_twin_messages_wallet_time
  ON twin_messages(wallet_address, created_at DESC);

-- Agent memory: agent + user pair lookup
CREATE INDEX IF NOT EXISTS idx_agent_memory_pair
  ON agent_memory(agent_did, user_wallet);

-- Agent memory: TTL temizligi icin
CREATE INDEX IF NOT EXISTS idx_agent_memory_expires
  ON agent_memory(expires_at) WHERE expires_at IS NOT NULL;

-- Automations: wallet lookup
CREATE INDEX IF NOT EXISTS idx_automations_wallet
  ON automations(wallet_address);

-- Automation results: automation_id lookup
CREATE INDEX IF NOT EXISTS idx_automation_results_auto_id
  ON automation_results(automation_id);

-- Hosted agents: owner lookup
CREATE INDEX IF NOT EXISTS idx_hosted_agents_owner
  ON hosted_agents(owner_address);

-- Agent budgets: owner lookup
CREATE INDEX IF NOT EXISTS idx_agent_budgets_owner
  ON agent_budgets(owner_wallet);

-- Budget transactions: agent_did + zaman
CREATE INDEX IF NOT EXISTS idx_agent_budget_txns_agent
  ON agent_budget_txns(agent_did, created_at DESC);

-- Ratings: agent_did lookup
CREATE INDEX IF NOT EXISTS idx_ratings_agent_did
  ON ratings(agent_did);

-- Agent cache: owner lookup
CREATE INDEX IF NOT EXISTS idx_agent_cache_owner
  ON agent_cache(owner) WHERE owner IS NOT NULL;

-- =====================================================================
-- 3. UNIQUE CONSTRAINTS
-- =====================================================================

-- Escrow TX hash tekil olmali (ayni tx iki kez kullanilamamali)
DO $$ BEGIN
  ALTER TABLE escrows ADD CONSTRAINT uq_escrows_escrow_tx_hash UNIQUE (escrow_tx_hash);
EXCEPTION
  WHEN duplicate_table THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- 4. FOREIGN KEYS
-- =====================================================================

-- Escrows → Tasks (cascade delete ile)
DO $$ BEGIN
  ALTER TABLE escrows
    ADD CONSTRAINT fk_escrows_task_id
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Automation results → Automations (cascade delete ile)
DO $$ BEGIN
  ALTER TABLE automation_results
    ADD CONSTRAINT fk_automation_results_automation_id
    FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Budget transactions → Agent budgets
DO $$ BEGIN
  ALTER TABLE agent_budget_txns
    ADD CONSTRAINT fk_budget_txns_agent_did
    FOREIGN KEY (agent_did) REFERENCES agent_budgets(agent_did) ON DELETE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- =====================================================================
-- 5. KOLON EKLEMELERI (varsa atla)
-- =====================================================================

-- hosted_agents.can_orchestrate (Phase 6'da eklenmis olabilir)
DO $$ BEGIN
  ALTER TABLE hosted_agents ADD COLUMN can_orchestrate BOOLEAN DEFAULT false;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- tasks.chain_id (Phase 5-6'da eklenmis olabilir)
DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN chain_id TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- tasks.delegated_by
DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN delegated_by TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- tasks.is_agent_task
DO $$ BEGIN
  ALTER TABLE tasks ADD COLUMN is_agent_task BOOLEAN DEFAULT false;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- twin_messages.state
DO $$ BEGIN
  ALTER TABLE twin_messages ADD COLUMN state TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- =====================================================================
-- 6. DOGRULAMA
-- =====================================================================
-- Asagidaki sorgu ile tum tablolarin varligini dogrulayin:

-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
-- ORDER BY table_name;
