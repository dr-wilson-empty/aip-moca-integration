-- =====================================================================
-- Budget Atomic Operations — Supabase RPC Functions
-- Tum budget islemleri tek SQL statement ile atomik yapilir.
-- Race condition onlenir: concurrent istekler siralı isler.
-- =====================================================================

-- 1. ATOMIC SPEND — Budget'tan harcama (delegation icin)
CREATE OR REPLACE FUNCTION budget_spend(
  p_agent_did TEXT,
  p_amount NUMERIC,
  p_task_id TEXT,
  p_target_agent_did TEXT,
  p_txn_id TEXT
) RETURNS SETOF agent_budgets AS $$
DECLARE
  result agent_budgets;
BEGIN
  UPDATE agent_budgets
  SET balance = balance - p_amount,
      total_spent = total_spent + p_amount,
      updated_at = now()
  WHERE agent_did = p_agent_did
    AND balance >= p_amount
    AND p_amount <= max_per_task
  RETURNING * INTO result;

  IF NOT FOUND THEN
    -- Determine specific error
    PERFORM 1 FROM agent_budgets WHERE agent_did = p_agent_did;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No budget found for agent: %', p_agent_did;
    END IF;
    PERFORM 1 FROM agent_budgets WHERE agent_did = p_agent_did AND balance >= p_amount;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Insufficient budget for agent: %', p_agent_did;
    END IF;
    RAISE EXCEPTION 'Amount exceeds max_per_task for agent: %', p_agent_did;
  END IF;

  INSERT INTO agent_budget_txns (id, agent_did, type, amount, task_id, target_agent_did)
  VALUES (p_txn_id, p_agent_did, 'spend', p_amount, p_task_id, p_target_agent_did);

  RETURN NEXT result;
END;
$$ LANGUAGE plpgsql;


-- 2. ATOMIC DEPOSIT — Budget'a yükleme
CREATE OR REPLACE FUNCTION budget_deposit(
  p_agent_did TEXT,
  p_owner_wallet TEXT,
  p_amount NUMERIC,
  p_tx_hash TEXT,
  p_txn_id TEXT
) RETURNS SETOF agent_budgets AS $$
DECLARE
  result agent_budgets;
BEGIN
  INSERT INTO agent_budgets (agent_did, owner_wallet, balance, max_per_task, total_spent, total_deposited)
  VALUES (p_agent_did, p_owner_wallet, p_amount, 1.0, 0, p_amount)
  ON CONFLICT (agent_did) DO UPDATE SET
    balance = agent_budgets.balance + p_amount,
    total_deposited = agent_budgets.total_deposited + p_amount,
    updated_at = now()
  RETURNING * INTO result;

  INSERT INTO agent_budget_txns (id, agent_did, type, amount, tx_hash)
  VALUES (p_txn_id, p_agent_did, 'deposit', p_amount, p_tx_hash);

  RETURN NEXT result;
END;
$$ LANGUAGE plpgsql;


-- 3. ATOMIC REFUND — Failed task sonrasi budget iadesi
CREATE OR REPLACE FUNCTION budget_refund(
  p_agent_did TEXT,
  p_amount NUMERIC,
  p_task_id TEXT,
  p_txn_id TEXT
) RETURNS SETOF agent_budgets AS $$
DECLARE
  result agent_budgets;
BEGIN
  UPDATE agent_budgets
  SET balance = balance + p_amount,
      total_spent = GREATEST(total_spent - p_amount, 0),
      updated_at = now()
  WHERE agent_did = p_agent_did
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No budget found for agent: %', p_agent_did;
  END IF;

  INSERT INTO agent_budget_txns (id, agent_did, type, amount, task_id)
  VALUES (p_txn_id, p_agent_did, 'refund', p_amount, p_task_id);

  RETURN NEXT result;
END;
$$ LANGUAGE plpgsql;


-- 4. ATOMIC WITHDRAW — Budget'tan cekim (kullaniciya iade)
CREATE OR REPLACE FUNCTION budget_withdraw(
  p_agent_did TEXT,
  p_amount NUMERIC,
  p_tx_hash TEXT,
  p_txn_id TEXT
) RETURNS SETOF agent_budgets AS $$
DECLARE
  result agent_budgets;
BEGIN
  UPDATE agent_budgets
  SET balance = balance - p_amount,
      updated_at = now()
  WHERE agent_did = p_agent_did
    AND balance >= p_amount
  RETURNING * INTO result;

  IF NOT FOUND THEN
    PERFORM 1 FROM agent_budgets WHERE agent_did = p_agent_did;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'No budget found for agent: %', p_agent_did;
    END IF;
    RAISE EXCEPTION 'Insufficient balance for withdrawal';
  END IF;

  INSERT INTO agent_budget_txns (id, agent_did, type, amount, tx_hash)
  VALUES (p_txn_id, p_agent_did, 'withdraw', p_amount, p_tx_hash);

  RETURN NEXT result;
END;
$$ LANGUAGE plpgsql;
