# AIP — Supabase Veritabanı Şeması

## Tablolar

### tasks
Tüm görev kayıtları.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| caller_did | TEXT | NOT NULL |
| caller_address | TEXT | NOT NULL |
| agent_did | TEXT | NOT NULL |
| agent_name | TEXT | '' |
| agent_address | TEXT | '' |
| capability | TEXT | '' |
| input | TEXT | '' |
| amount | TEXT | '0' |
| state | TEXT | 'SUBMITTED' |
| escrow_tx_hash | TEXT | |
| settlement_tx_hash | TEXT | |
| artifact | TEXT | |
| fail_reason | TEXT | |
| delegated_by | TEXT | |
| is_agent_task | BOOLEAN | false |
| chain_id | TEXT | |
| log | JSONB | '[]' |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

### escrows
Escrow ödeme kayıtları.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| task_id | TEXT | PK, FK → tasks(id) |
| amount | TEXT | NOT NULL |
| payer | TEXT | NOT NULL |
| payee | TEXT | NOT NULL |
| status | TEXT | 'LOCKED' |
| escrow_tx_hash | TEXT | UNIQUE |
| settlement_tx_hash | TEXT | |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

### twin_messages
Twin sohbet mesajları.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| wallet_address | TEXT | NOT NULL |
| role | TEXT | NOT NULL |
| content | TEXT | '' |
| plan | JSONB | |
| task_id | TEXT | |
| artifact | TEXT | |
| escrow_tx_hash | TEXT | |
| settlement_tx_hash | TEXT | |
| state | TEXT | |
| created_at | TIMESTAMPTZ | now() |

---

### automations
Otomasyon tanımları.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| wallet_address | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| prompt | TEXT | NOT NULL |
| schedule | TEXT | 'daily' |
| budget_limit | NUMERIC(20,6) | 1.0 |
| budget_period | TEXT | 'daily' |
| enabled | BOOLEAN | true |
| total_spent | NUMERIC(20,6) | 0 |
| run_count | INTEGER | 0 |
| last_run | TIMESTAMPTZ | |
| trigger_type | TEXT | 'schedule' |
| webhook_secret | TEXT | |
| watch_address | TEXT | |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

### automation_results
Otomasyon çalışma sonuçları.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| automation_id | TEXT | NOT NULL, FK → automations(id) |
| agent_name | TEXT | '' |
| capability | TEXT | '' |
| input | TEXT | '' |
| artifact | TEXT | |
| estimated_cost | TEXT | '0' |
| status | TEXT | 'completed' |
| created_at | TIMESTAMPTZ | now() |

---

### hosted_agents
Platform üzerinde barındırılan agent'lar.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| agent_id | TEXT | PK |
| owner_address | TEXT | NOT NULL |
| name | TEXT | NOT NULL |
| description | TEXT | '' |
| system_prompt | TEXT | NOT NULL |
| tier | TEXT | 'platform' |
| provider | TEXT | 'anthropic' |
| custom_api_key | TEXT | AES-256 encrypted |
| capabilities_json | TEXT | '[]' |
| can_orchestrate | BOOLEAN | false |
| active | BOOLEAN | true |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

### agent_budgets
Agent USDC bütçe bakiyeleri.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| agent_did | TEXT | PK |
| owner_wallet | TEXT | NOT NULL |
| balance | NUMERIC(20,6) | 0 |
| max_per_task | NUMERIC(20,6) | 1.0 |
| total_spent | NUMERIC(20,6) | 0 |
| total_deposited | NUMERIC(20,6) | 0 |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

### agent_budget_txns
Bütçe işlem geçmişi.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| agent_did | TEXT | NOT NULL, FK → agent_budgets(agent_did) |
| type | TEXT | NOT NULL — deposit / spend / refund / release / withdraw |
| amount | NUMERIC(20,6) | NOT NULL |
| task_id | TEXT | |
| target_agent_did | TEXT | |
| tx_hash | TEXT | |
| created_at | TIMESTAMPTZ | now() |

---

### agent_memory
Agent'ların kullanıcılar hakkında öğrendiği bilgiler.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | TEXT | PK |
| agent_did | TEXT | NOT NULL |
| user_wallet | TEXT | NOT NULL |
| memory_type | TEXT | 'preference' — preference / context / fact |
| content | TEXT | NOT NULL |
| created_at | TIMESTAMPTZ | now() |
| expires_at | TIMESTAMPTZ | |

Max 20 kayıt per (agent_did, user_wallet) çifti. FIFO eviction.

---

### ratings
Agent değerlendirmeleri.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| id | SERIAL | PK |
| agent_did | TEXT | NOT NULL |
| wallet_address | TEXT | NOT NULL |
| task_id | TEXT | |
| rating | INTEGER | NOT NULL, 1-5 arası |
| comment | TEXT | |
| created_at | TIMESTAMPTZ | now() |

---

### agent_cache
Keşfedilen agent'ların cache'i.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| did | TEXT | PK |
| name | TEXT | '' |
| endpoint | TEXT | '' |
| type | TEXT | 'Task' |
| version | TEXT | |
| wallet_address | TEXT | |
| capabilities_json | TEXT | |
| on_chain | BOOLEAN | false |
| agent_id | TEXT | |
| owner | TEXT | |
| source | TEXT | 'ui' / 'synced' |
| created_at | TIMESTAMPTZ | now() |

---

### preferences
Kullanıcı tercihleri.

| Kolon | Tip | Varsayılan |
|-------|-----|------------|
| wallet_address | TEXT | PK |
| language | TEXT | 'auto' — auto / tr / en |
| detail_level | TEXT | 'medium' — short / medium / detailed |
| custom_instructions | TEXT | '' |
| created_at | TIMESTAMPTZ | now() |
| updated_at | TIMESTAMPTZ | now() |

---

## RPC Fonksiyonları (Atomic Budget Ops)

- `budget_spend(p_agent_did, p_amount, p_task_id, p_target)` — bakiye düş
- `budget_deposit(p_agent_did, p_owner, p_amount, p_tx_hash)` — bakiye ekle
- `budget_refund(p_agent_did, p_amount, p_task_id)` — iade
- `budget_withdraw(p_agent_did, p_owner, p_amount)` — çekim

## Migration Dosyası

`sql/phase7-migration.sql` — tüm CREATE TABLE, INDEX, FK tanımları.
