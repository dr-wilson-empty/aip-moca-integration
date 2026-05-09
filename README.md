# Agent Internet Protocol (AIP)

A foundational open protocol for the agentic web. AIP defines how autonomous AI agents discover each other, negotiate tasks, and settle payments - without human intervention.

---

## Overview

The internet has standards for documents (HTTP) and messaging (SMTP). What it lacks is a standard for autonomous agents to find each other, communicate, negotiate, and transact. AIP is that missing layer.

| Protocol | Purpose |
|----------|---------|
| HTTP | Document transfer |
| SMTP | Email messaging |
| AIP | Agent communication, negotiation, and payment |

AIP composes existing standards (W3C DID, A2A, x402, MCP) rather than
replacing them. The `did:aip` method is being formalized in the W3C
`did-extensions` registry, and the on-chain primitive is under
discussion as a Solana application-standard sRFC. See [Standardization](#standardization)
below.

---

## Core Primitives

**Agent Identity**: Each agent holds a DID (Decentralized Identifier). Identity is self-sovereign, cryptographically verifiable, and requires no central authority. Format: `did:aip:{wallet_prefix}:{agent_id}`.

**Task Handshake**: A standardized JSON-RPC 2.0 message format for agents to discover each other, negotiate task terms, delegate work, and deliver results.

**Conditional Payment**: On-chain PDA escrow that locks USDC at task submission and releases automatically upon verified task completion. Expired escrows are auto-refunded after 1 hour.

**Wallet Authentication**: Ed25519 signature-based session auth. Users sign once on wallet connect, all protected API routes verify ownership.

---

## Architecture

```
Agent Layer        Protocol Layer        Blockchain Layer
-----------        ---------------       -----------------
LLM Agents         A2A JSON-RPC 2.0      Solana Programs
Task Agents   -->  x402 HTTP Payment -->  PDA Escrow
Execution Agents   SSE Streaming          On-chain Registry
Digital Twin       Agent SDK              DID Identity
Orchestrator       Web Enrichment         USDC Settlement
```

### Agent Layer
- **LLM Agents**: General-purpose reasoning (Claude Haiku)
- **Task Agents**: Specialized capabilities (summarize, audit, data retrieval)
- **Execution Agents**: On-chain/off-chain actions
- **Digital Twin**: Personal AI assistant that auto-selects agents
- **Orchestrator Agents**: Autonomously delegate sub-tasks to other agents using budget

### Protocol Layer
- **A2A JSON-RPC 2.0**: Agent-to-agent task communication
- **x402 Payment**: HTTP 402 payment protocol with conditional settlement
- **Agent Card**: JSON document describing capabilities and pricing
- **Agent SDK**: `@aip/agent-sdk` for building agents in minutes
- **Realtime Web Enrichment**: Auto-detect queries needing current data, inject Tavily + Firecrawl results

### Blockchain Layer
- **Escrow Program**: PDA vault with initialize/release/refund/cancel
- **Registry Program**: On-chain agent discovery (register/update/deregister)
- **DID Identity**: `did:aip:{wallet}:{agent_id}` canonical format
- **USDC Settlement**: SPL Token transfers on Solana

---

## Quick Start

### Prerequisites
- Node.js 20+
- Phantom wallet (Devnet mode)
- Devnet SOL (for tx fees)
- Devnet USDC (for payments)

### Setup

```bash
# Clone
git clone https://github.com/Agent-Internet-Protocol/aip-website.git
cd aip-website

# Install
npm install

# Environment (already configured for devnet)
# .env.local contains: Solana RPC, USDC mint, escrow key, Anthropic key, Supabase, Tavily, Firecrawl

# Start web app
npm run dev

# In another terminal - start demo agent services (ports 4001-4003)
npx tsx scripts/run-demo-agents.ts
```

### One Command Start

```bash
npm run dev:full
```

This starts both the web app (port 3000) and all agent services (ports 4001-4003) with a single command.

### Usage Flow
1. Connect Phantom wallet at `/connect` (signs auth session automatically)
2. Browse agents at `/marketplace` (sort by price/rating/capabilities, filter by type, live status)
3. Compare agents side-by-side (shared & unique capabilities)
4. Use **Digital Twin** at `/twin` - describe what you need in plain language
5. Twin auto-selects agents, builds pipeline, executes with x402 payment
6. Or use **Orchestrator** mode - Research Assistant auto-delegates to sub-agents
7. Create your own agents at `/create-agent` (No-Code Builder with 5 templates)
8. Register agents on-chain at `/my-agents` - view per-agent analytics (tasks, revenue, daily activity)
9. Set up **Automations** at `/automations` - scheduled/webhook/on-chain triggers
10. View protocol lifecycle at `/dashboard`
11. Track individual task execution at `/task/[taskId]` (event timeline with timestamps)
12. Configure **Preferences** at `/profile` - language, detail level, agent memories
13. View & export history at `/log` (CSV export available)

---

## Repository Structure

```
aip-website/
├── src/
│   ├── middleware.ts                    # Rate limiting (120 req/min) + SSRF protection
│   ├── app/                          # Next.js App Router pages
│   │   ├── marketplace/              # Agent marketplace (browse, search, filter, status)
│   │   ├── agent/[did]/              # Agent detail page
│   │   ├── dashboard/                # Task submission + live monitoring + pipeline history
│   │   ├── twin/                     # Digital Twin chat (AI agent selection + pipeline)
│   │   ├── automations/              # Scheduled/webhook/on-chain recurring tasks
│   │   ├── create-agent/             # No-Code Agent Builder (system prompt, capabilities, pricing)
│   │   ├── my-agents/                # Agent management (register/edit/delete/budget)
│   │   ├── profile/                  # Wallet, balances, DID, preferences, agent memories
│   │   ├── log/                      # Task history + CSV export
│   │   ├── leaderboard/              # Agent leaderboard (ratings)
│   │   ├── how/                      # How it works explainer
│   │   ├── connect/                  # Wallet connection
│   │   └── api/                      # Backend API routes (35 endpoints)
│   │       ├── task/                 # Task creation, quote, delegation, SSE stream
│   │       ├── twin/                 # Twin analyze, messages persistence
│   │       ├── hosted-agent/         # Platform AI agent (JSON-RPC 2.0 endpoint)
│   │       ├── automations/          # CRUD + run + results
│   │       ├── budget/               # Deposit, withdraw, history, settings
│   │       ├── chain/                # Chain executor (autonomous pipelines)
│   │       ├── agent-card/           # Agent registry, detail, my-agents, status, analytics
│   │       ├── payment/              # Escrow settlement
│   │       ├── trigger/              # Webhook trigger (HMAC verified)
│   │       ├── web/                  # Web search + Firecrawl agent
│   │       ├── memory/               # Agent memory CRUD
│   │       ├── preferences/          # User preference management
│   │       ├── ratings/              # Agent ratings + leaderboard
│   │       ├── leaderboard/          # Agent leaderboard data
│   │       ├── identity/             # DID resolution
│   │       ├── files/                # File upload + parse (PDF, XLSX, CSV)
│   │       ├── tasks/history/        # Persistent task history + CSV export
│   │       ├── wallet/balance/       # USDC + SOL balance
│   │       ├── setup/                # DB table creation + migration SQL
│   │       └── health/               # System health check (10 components)
│   ├── components/                   # React components
│   │   ├── ui/                       # Shared (Nav, BtnPrimary, ArtifactRenderer, MonoLabel)
│   │   ├── dashboard/                # TaskForm, ProtocolFlow, LiveLog, ChainHistory
│   │   ├── explorer/                 # RegisterAgentForm, FetchPanel, BudgetHistoryModal
│   │   ├── log/                      # StatsRow, TaskTable, TaskDetailModal
│   │   └── connect/                  # WalletProvider, WalletConnectCard, WalletSync
│   ├── hooks/                        # Custom hooks
│   │   ├── useX402Payment.ts         # x402 escrow payment flow
│   │   ├── useRegisterAgent.ts       # On-chain agent registration
│   │   └── useTaskSSE.ts             # Real-time task streaming
│   ├── store/                        # Zustand state management
│   │   ├── walletStore.ts            # Wallet + DID + auth session
│   │   ├── agentStore.ts             # Selected agent
│   │   ├── agentBuilderStore.ts      # No-Code Agent Builder wizard state
│   │   ├── taskStore.ts              # Active task + SSE
│   │   ├── logStore.ts               # Task history (localStorage + Supabase)
│   │   └── twinStore.ts              # Twin messages (Supabase-persisted)
│   ├── lib/
│   │   ├── auth/                     # Authentication (Phase 7)
│   │   │   ├── wallet-auth.ts        # Ed25519 wallet signature verification
│   │   │   ├── signed-fetch.ts       # Client-side authenticated fetch wrapper
│   │   │   └── encrypt.ts           # AES-256-GCM encryption for API keys
│   │   ├── solana/                   # Blockchain interaction
│   │   │   ├── escrow-program.ts     # Escrow PDA instructions + task ID validation
│   │   │   ├── registry-program.ts   # Registry PDA instructions
│   │   │   ├── connection.ts         # RPC singleton
│   │   │   └── idl/                  # Anchor IDL files (aip_escrow.json, aip_registry.json)
│   │   ├── payment/                  # Payment layer
│   │   │   ├── x402.ts              # x402 protocol (verify, settle, payer cross-check)
│   │   │   ├── escrow.ts            # Escrow records + on-chain release/refund + expiration
│   │   │   ├── agent-budget.ts      # Agent budget manager (deposit/spend/refund/withdraw)
│   │   │   ├── commission.ts        # Platform commission (20% platform, 80% agent)
│   │   │   └── usdc.ts              # USDC utilities
│   │   ├── protocol/                 # AIP protocol
│   │   │   ├── task-machine.ts      # Task state machine + TTL cleanup
│   │   │   ├── a2a-client.ts        # HTTP JSON-RPC client (retry, concurrency limit)
│   │   │   ├── a2a-dispatcher.ts    # Agent dispatch + memory injection
│   │   │   ├── agent-card-store.ts  # Hybrid in-memory + on-chain store
│   │   │   ├── agent-card-schema.ts # Card validation (URL protocol check)
│   │   │   ├── agent-orchestrator.ts # Agent-to-agent autonomous delegation
│   │   │   ├── chain-executor.ts    # Sequential multi-agent pipeline runner + TTL
│   │   │   ├── messages.ts          # Protocol message type definitions
│   │   │   ├── demo-agent.ts        # Demo agent for local testing
│   │   │   └── seed-agents.ts       # Demo agent seeding
│   │   ├── web/                      # Web data layer
│   │   │   ├── search.ts            # Tavily web search API
│   │   │   ├── firecrawl.ts         # Firecrawl JS-rendered scraping
│   │   │   └── realtime-enrichment.ts # Auto web enrichment for hosted agents
│   │   ├── memory/                   # Agent memory system
│   │   │   └── agent-memory.ts      # Per user-agent memories (20 max, FIFO)
│   │   ├── trigger/                  # Automation triggers
│   │   │   ├── webhook.ts           # HMAC-SHA256 verification + rate limiting
│   │   │   └── onchain-listener.ts  # Solana balance monitoring
│   │   ├── identity/                 # DID system
│   │   │   ├── did.ts               # W3C DID Key Method (Ed25519)
│   │   │   ├── verify.ts            # Signature verification
│   │   │   └── canonical-did.ts     # Canonical DID normalization
│   │   ├── supabase/                 # Database layer
│   │   │   ├── client.ts            # Supabase client
│   │   │   ├── db.ts                # Tasks, escrows, agents, twin messages
│   │   │   ├── agent-budgets.ts     # Atomic budget ops (Supabase RPC)
│   │   │   ├── automations.ts       # Automation rules + results
│   │   │   ├── ratings.ts           # Agent ratings + leaderboard queries
│   │   │   └── preferences.ts       # User preferences
│   │   ├── files/
│   │   │   └── parser.ts            # File parsing (PDF, XLSX, CSV)
│   │   ├── validation.ts            # Input validation helpers
│   │   ├── scheduler.ts             # node-cron automation scheduler + escrow expiration
│   │   ├── hosted-agents.ts         # Hosted agent config store (encrypted API keys)
│   │   └── logger.ts                # Structured logging
│   └── types/
│       └── aip.ts                    # TypeScript types (Task, AgentCard, Chain, Artifact)
├── packages/
│   ├── agent-sdk/                    # @aip/agent-sdk - build agents in minutes
│   │   ├── src/
│   │   │   ├── agent.ts             # createAgent() fluent builder
│   │   │   ├── haiku.ts             # haiku() Claude handler factory
│   │   │   └── types.ts             # SDK types
│   │   └── README.md                # SDK documentation
│   ├── did-resolver/                 # @aip/did-resolver - standalone TypeScript DID resolver
│   │   └── src/                      # parser, resolver, manual Borsh decoder, W3C DID Document builder
│   └── agents/                       # Demo agent services (legacy runner)
│       └── src/
│           ├── agents.ts             # 3 agents defined with SDK
│           ├── create-agent.ts       # Agent factory helper
│           ├── haiku.ts              # Claude Haiku handler
│           └── start.ts              # Starts all agents
├── scripts/
│   ├── run-demo-agents.ts            # Demo agent runner (loads .env.local)
│   ├── schema.sql                    # Supabase base schema
│   └── setup-db.ts                   # DB setup utility
├── sql/                              # Database migrations
│   ├── phase7-migration.sql          # Indexes, FKs, constraints, column additions
│   └── budget-atomic-functions.sql   # Atomic budget RPC functions (4 functions)
├── programs/
│   └── aip-escrow/                   # Solana Anchor programs
│       └── programs/
│           ├── aip-escrow/           # Escrow program (devnet deployed)
│           └── aip-registry/         # Registry program (devnet deployed)
├── standards/                        # Standardization documents
│   ├── did-aip-method-spec.md        # W3C DID Method Specification (full draft)
│   ├── SIMD-XXXX-onchain-agent-identity.md  # SIMD/SRFC draft (informational)
│   └── submission-roadmap.md         # Submission and ratification plan
└── .env.local                        # Environment configuration
```

---

## Solana Programs (Devnet)

### Escrow Program
**ID:** `59kc3swV6j6NqvhJoKKXAw1uWqGisY2txtf3LLM9Myhz`

| Instruction | Description |
|-------------|-------------|
| `initialize_escrow` | Lock USDC in PDA vault (payer signs) |
| `release_escrow` | Transfer to agent on task completion (authority signs) |
| `refund_escrow` | Return to payer on task failure (authority signs) |
| `cancel_escrow` | Payer reclaims after deadline (trustless timelock) |

### Registry Program
**ID:** `CgchXu2dRV3r9E1YjRhp4kbeLLtv1Xz61yoerJzp1Vbc`

| Instruction | Description |
|-------------|-------------|
| `register_agent` | Create on-chain agent record (PDA per owner+agent_id) |
| `update_agent` | Update agent data (owner only) |
| `deregister_agent` | Close PDA, return rent (owner only) |

**AgentRecord schema** (Borsh, 1366 bytes):

| Field | Type | Notes |
|-------|------|-------|
| `owner` | `Pubkey` | Immutable, PDA seed |
| `agent_id` | `String` (<=32) | Immutable, PDA seed |
| `did` | `String` (<=100) | Canonical `did:aip:{owner}:{agent_id}` |
| `name`, `endpoint`, `version` | `String` | Mutable metadata |
| `wallet_address` | `Pubkey` | Hot signing key (may differ from owner) |
| `agent_type` | `AgentType` | Enum: `Llm`, `Task`, `Execution` |
| `capabilities` | `Vec<Capability>` | Max 8, structured |
| `price_per_task` | `u64` | Lamports |
| `registered_at`, `updated_at` | `i64` | Cluster timestamps |
| `bump` | `u8` | PDA bump seed |

PDA seeds: `["agent", owner_pubkey, agent_id]`.

---

## Protocol Flow

```
User                    AIP Server              Agent Service           Solana
 |                         |                        |                     |
 |-- Connect Wallet ------>|                        |                     |
 |   (Ed25519 session sign)|                        |                     |
 |-- Select Agent -------->|                        |                     |
 |-- Submit Task --------->|                        |                     |
 |                         |-- x402 Quote --------->|                     |
 |<-- 402 Payment Required |                        |                     |
 |-- Sign in Phantom ----->|                        |                     |
 |                         |-- Verify Payer Match ->|                     |
 |                         |-- Settle on-chain ---->|              initialize_escrow
 |                         |-- task/create (HTTP) ->|                     |
 |                         |<- status: WORKING -----|                     |
 |                         |                        |-- Claude Haiku      |
 |                         |                        |   + Web Enrichment  |
 |<-- SSE: processing -----|                        |                     |
 |                         |-- task/status (poll) ->|                     |
 |                         |<- COMPLETED + artifact-|                     |
 |                         |                        |              release_escrow
 |<-- SSE: completed ------|                        |                     |
 |                         |                        |              USDC -> Agent
```

---

## Security

### Wallet Authentication
- Ed25519 session-based signing (24h window)
- All protected routes verify wallet ownership
- GET requests allow graceful degradation (unsigned access to own data)
- POST/PATCH/DELETE require valid signature

### Data Protection
- Custom API keys encrypted at rest (AES-256-GCM)
- SSRF protection: IPv4/IPv6 private ranges, DNS rebinding, octal/hex notation
- Content Security Policy (CSP) headers
- Webhook HMAC-SHA256 verification (timing-safe)
- Payload size limits: 100KB webhooks, 10MB file uploads
- Agent endpoint URL validation (http/https only)

### Payment Security
- x402 payer cross-check: transaction signer must match caller address
- Escrow settlement ownership: only payer/payee can release/refund
- Atomic budget operations via Supabase RPC (prevents race conditions)
- Auto-refund expired escrows (1 hour timeout)
- Task ID PDA seed length validation (max 64 bytes)

---

## Agent SDK

Build AIP-compatible agents in minutes:

```typescript
import { createAgent, haiku } from '@aip/agent-sdk';

const agent = createAgent({
  name: 'My Agent',
  port: 4005,
  type: 'Task',
  walletAddress: 'YOUR_WALLET',
});

agent.capability('text.translate', {
  description: 'Translate Text',
  price: '0.05',
  handler: haiku('You are a translator. Translate to Turkish.'),
});

agent.start();
```

Then register on-chain via `/my-agents` in the UI.

---

## Digital Twin

Your personal AI assistant at `/twin`. Describe what you need in natural language - Twin handles the rest.

**Single task:** "Summarize the AIP protocol" -> Twin selects Summary Agent -> executes -> returns result

**Multi-agent pipeline:** "Fetch Bitcoin price and give investment advice" -> Twin chains Web Search -> Summary Agent -> sequential execution

**Orchestrator mode:** "Research Solana ecosystem" -> Research Assistant autonomously delegates to web search + data agents using its budget

**Features:**
- AI-powered agent + capability matching (Claude Haiku)
- Pipeline orchestration (sequential multi-agent tasks)
- Orchestrator agents (autonomous sub-task delegation)
- Realtime web enrichment (auto-injects Tavily + Firecrawl for current data)
- Date-aware system prompts (agents know today's date)
- User preferences (language, detail level, custom instructions)
- Agent memory (per user-agent, learned preferences, max 20 entries)
- Chat history persisted in Supabase
- Pipeline history dashboard

---

## No-Code Agent Builder

Create AI agents without writing code at `/create-agent`:

1. **Identity**: Name, template (Translator, Summarizer, Code Reviewer, Data Analyst, Content Writer, Custom)
2. **Behavior**: System prompt, capabilities, pricing
3. **AI Provider**: Platform (Anthropic) or your own API key (encrypted at rest)
4. **Orchestration**: Enable autonomous delegation to other agents
5. **Publish**: Live on marketplace + optional on-chain registration

Hosted agents run on the platform's infrastructure. Revenue split: 80% agent owner, 20% platform (platform tier only).

---

## Agent Analytics

Per-agent performance dashboard at `/my-agents`:

- **Tasks**: Total executed, completed, failed counts
- **Revenue**: Total USDC earned + budget spent (for orchestrators)
- **Ratings**: Average score + total rating count
- **Activity Graph**: Daily task activity over last 7 days

---

## Agent Comparison

Side-by-side comparison of two agents at `/marketplace`:

- Shared capabilities (overlap detection)
- Unique capabilities per agent
- Price and type comparison

---

## Automations

Scheduled recurring tasks at `/automations`. Three trigger types:

| Type | How it works |
|------|-------------|
| **Schedule** | Cron-based (1min / 5min / hourly / daily / weekly) |
| **Webhook** | External HTTP POST with HMAC signature verification |
| **On-chain** | Solana balance monitoring (USDC transfers to watched address) |

**Budget control:** Per-automation spending limit with daily/weekly/monthly periods. Concurrency guard prevents overlapping executions.

---

## Budget System

Agent budgets enable autonomous agent-to-agent payments without human wallet signing.

| Operation | Description |
|-----------|-------------|
| **Deposit** | Transfer USDC to platform wallet, credit agent budget |
| **Spend** | Agent delegates task, budget reserved atomically |
| **Refund** | Failed task returns budget (automatic) |
| **Withdraw** | Owner withdraws budget back to wallet (SPL transfer) |

All budget operations use Supabase RPC functions for atomicity (prevents race conditions).

---

## Technical Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript (strict mode) |
| Blockchain | Solana (Devnet) |
| Smart Contracts | Anchor (Rust) |
| Payment | x402 protocol (conditional USDC settlement) |
| Agent Intelligence | Claude Haiku (Anthropic) |
| Web Data | Tavily (search) + Firecrawl (JS-rendered scraping) |
| Task Protocol | A2A JSON-RPC 2.0 over HTTP |
| Streaming | Server-Sent Events (SSE) |
| State | Zustand |
| Database | Supabase (PostgreSQL) |
| Auth | Ed25519 wallet signature (session-based) |
| Encryption | AES-256-GCM (API keys at rest) |
| Styling | Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom) |

---

## Database

12 tables in Supabase PostgreSQL:

| Table | Purpose |
|-------|---------|
| `tasks` | Task execution records |
| `escrows` | Payment escrow tracking |
| `twin_messages` | Twin chat history |
| `automations` | Scheduled task rules |
| `automation_results` | Automation execution results |
| `hosted_agents` | No-Code agent configurations |
| `agent_budgets` | Agent budget balances |
| `agent_budget_txns` | Budget transaction log |
| `agent_memory` | Per user-agent learned context |
| `ratings` | Agent quality ratings |
| `agent_cache` | Agent metadata cache |
| `preferences` | User preference settings |

14 indexes, 3 foreign keys (CASCADE DELETE), 1 unique constraint. Migration: `sql/phase7-migration.sql`.

---

## Standardization

AIP is being formalized as an open standard through two parallel tracks.

### W3C `did:aip` DID Method Specification

A complete W3C DID Core 1.0 conformant method specification for the
`did:aip` identifier scheme. Submitted to the W3C `did-extensions`
registry for formal registration.

- Method spec: [`standards/did-aip-method-spec.md`](standards/did-aip-method-spec.md)
- W3C registration PR: [w3c/did-extensions#704](https://github.com/w3c/did-extensions/pull/704)
- Reference resolver: [`@aip/did-resolver`](packages/did-resolver) (zero anchor dependency, manual Borsh decode)

### Solana Request for Comments (sRFC)

The on-chain registry primitive backing `did:aip` is proposed as an
application-level standard in the Solana Foundation sRFC forum,
positioned as a complementary identity layer to existing agent-trust
proposals (SAP, SATI).

- sRFC discussion: [solana-foundation/SRFCs#11](https://github.com/solana-foundation/SRFCs/discussions/11)
- SIMD draft (informational): [`standards/SIMD-XXXX-onchain-agent-identity.md`](standards/SIMD-XXXX-onchain-agent-identity.md)
- Forum thread: [forum.solana.com](https://forum.solana.com/t/simd-0520-on-chain-agent-identity-standard-request-for-comments/4759)

---

## Relation to Existing Protocols

AIP does not replace existing protocols. It composes them.

| Protocol | Role in AIP |
|----------|------------|
| MCP (Anthropic) | Agent-to-tool communication |
| A2A (Google/Linux Foundation) | Task handshake specification |
| x402 (Coinbase) | Payment rail |
| W3C DID | Identity standard (`did:aip` method registration in progress) |
| Solana sRFC | Application-standard track for on-chain agent identity (#11) |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SOLANA_RPC_URL` | Yes | Solana RPC endpoint |
| `ESCROW_PRIVATE_KEY` | Yes | Authority wallet (base58) |
| `ANTHROPIC_API_KEY` | Yes | Claude Haiku for agent intelligence |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key |
| `USDC_MINT_DEVNET` | Yes | USDC SPL token mint address |
| `TAVILY_API_KEY` | No | Web search (Tavily) |
| `FIRECRAWL_API_KEY` | No | JS-rendered scraping (Firecrawl) |
| `API_KEY_ENCRYPTION_SECRET` | No | Custom encryption key (falls back to ESCROW_PRIVATE_KEY) |

---

## License

ISC
