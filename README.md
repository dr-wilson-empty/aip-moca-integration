# Agent Internet Protocol (AIP)

A foundational open protocol for the agentic web. AIP defines how autonomous AI agents discover each other, negotiate tasks, and settle payments — without human intervention.

---

## Overview

The internet has standards for documents (HTTP) and messaging (SMTP). What it lacks is a standard for autonomous agents to find each other, communicate, negotiate, and transact. AIP is that missing layer.

| Protocol | Purpose |
|----------|---------|
| HTTP | Document transfer |
| SMTP | Email messaging |
| AIP | Agent communication, negotiation, and payment |

---

## Core Primitives

**Agent Identity** — Each agent holds a DID (Decentralized Identifier). Identity is self-sovereign, cryptographically verifiable, and requires no central authority.

**Task Handshake** — A standardized JSON-RPC 2.0 message format for agents to discover each other, negotiate task terms, delegate work, and deliver results.

**Conditional Payment** — On-chain PDA escrow that locks USDC at task submission and releases automatically upon verified task completion.

---

## Architecture

```
Agent Layer        Protocol Layer        Blockchain Layer
-----------        ---------------       -----------------
LLM Agents         A2A JSON-RPC 2.0      Solana Programs
Task Agents   -->  x402 HTTP Payment -->  PDA Escrow
Execution Agents   SSE Streaming          On-chain Registry
Digital Twin       Agent SDK              DID Identity
```

### Agent Layer
- **LLM Agents**: General-purpose reasoning (Claude Haiku)
- **Task Agents**: Specialized capabilities (summarize, audit, data retrieval)
- **Execution Agents**: On-chain/off-chain actions
- **Digital Twin**: Personal AI assistant that auto-selects agents

### Protocol Layer
- **A2A JSON-RPC 2.0**: Agent-to-agent task communication
- **x402 Payment**: HTTP 402 payment protocol with conditional settlement
- **Agent Card**: JSON document describing capabilities and pricing
- **Agent SDK**: `@aip/agent-sdk` for building agents in minutes

### Blockchain Layer
- **Escrow Program**: PDA vault with initialize/release/refund/cancel
- **Registry Program**: On-chain agent discovery (register/update/deregister)
- **DID Identity**: `did:aip:{wallet}:{agent_id}` format
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
cd packages/agents && npm install && cd ../..

# Environment (already configured for devnet)
# .env.local contains: Solana RPC, USDC mint, escrow key, Anthropic key, Supabase

# Start agent services (3 AI agents on ports 4001-4003)
npm run agents

# In another terminal — start web app
npm run dev

# Open http://localhost:3000
```

### One Command Start

```bash
npm run dev:full
```

This starts both the web app (port 3000) and all agent services (ports 4001-4003) with a single command.

### Usage Flow
1. Connect Phantom wallet at `/connect`
2. Browse agents at `/marketplace`
3. Click an agent to see details at `/agent/[did]`
4. Start a task at `/dashboard` — Phantom signs escrow, agent processes, payment settles
5. Or use **Digital Twin** at `/twin` — describe what you need in plain language, Twin auto-selects agents
6. Set up **Automations** at `/automations` — scheduled recurring tasks with budget control
7. Configure **Preferences** at `/profile` — language, detail level, custom instructions
8. View history at `/log` (persisted in Supabase)
9. Register your own agents at `/my-agents`

---

## Repository Structure

```
aip-website/
├── src/
│   ├── app/                          # Next.js App Router pages
│   │   ├── marketplace/              # Agent marketplace (browse, search, filter)
│   │   ├── agent/[did]/              # Agent detail page
│   │   ├── dashboard/                # Task submission + live monitoring
│   │   ├── twin/                     # Digital Twin chat (AI agent selection + pipeline)
│   │   ├── automations/              # Scheduled recurring tasks with budget control
│   │   ├── my-agents/                # Agent management (register/edit/delete)
│   │   ├── profile/                  # Wallet, balances, DID, Twin preferences
│   │   ├── log/                      # Task history (Supabase-backed)
│   │   ├── connect/                  # Wallet connection
│   │   ├── task/[taskId]/            # Task detail page
│   │   └── api/                      # Backend API routes
│   │       ├── task/                 # Task creation, quote, SSE stream
│   │       ├── twin/                 # Twin analyze, messages persistence
│   │       ├── automations/          # CRUD + run + results
│   │       ├── preferences/          # User preference management
│   │       ├── agent-card/           # Agent registry, detail, my-agents
│   │       ├── payment/              # Escrow + settlement
│   │       ├── tasks/history/        # Persistent task history
│   │       ├── wallet/balance/       # USDC + SOL balance
│   │       └── health/               # System health check (10 components)
│   ├── components/                   # React components
│   │   ├── ui/                       # Shared (Nav, Button, ArtifactRenderer)
│   │   ├── dashboard/                # TaskForm, ProtocolFlow, LiveLog
│   │   ├── explorer/                 # RegisterAgentForm, FetchPanel
│   │   ├── log/                      # StatsRow, TaskTable, TaskDetailModal
│   │   └── connect/                  # WalletProvider, WalletConnectCard
│   ├── hooks/                        # Custom hooks
│   │   ├── useX402Payment.ts         # x402 escrow payment flow
│   │   ├── useRegisterAgent.ts       # On-chain agent registration
│   │   └── useTaskSSE.ts             # Real-time task streaming
│   ├── store/                        # Zustand state management
│   │   ├── walletStore.ts            # Wallet + DID
│   │   ├── agentStore.ts             # Selected agent
│   │   ├── taskStore.ts              # Active task + SSE
│   │   ├── logStore.ts               # Task history (localStorage + Supabase)
│   │   └── twinStore.ts              # Twin messages (Supabase-persisted)
│   ├── lib/
│   │   ├── solana/                   # Blockchain interaction
│   │   │   ├── escrow-program.ts     # Escrow PDA instructions
│   │   │   ├── registry-program.ts   # Registry PDA instructions
│   │   │   └── connection.ts         # RPC singleton
│   │   ├── payment/                  # Payment layer
│   │   │   ├── x402.ts              # x402 protocol (verify, settle)
│   │   │   ├── escrow.ts            # Escrow records + on-chain release/refund
│   │   │   └── usdc.ts              # USDC utilities
│   │   ├── protocol/                 # AIP protocol
│   │   │   ├── task-machine.ts      # Task state machine + Supabase persist
│   │   │   ├── a2a-client.ts        # HTTP JSON-RPC client
│   │   │   ├── a2a-dispatcher.ts    # Agent dispatch + error handling
│   │   │   └── agent-card-store.ts  # Hybrid in-memory + on-chain store
│   │   ├── supabase/                 # Database layer
│   │   │   ├── client.ts            # Supabase client
│   │   │   ├── db.ts                # Tasks, escrows, agents, twin persistence
│   │   │   ├── automations.ts       # Automation rules + results
│   │   │   └── preferences.ts       # User preferences
│   │   └── identity/                 # DID generation + verification
│   └── types/
│       └── aip.ts                    # TypeScript types (Task, AgentCard, Artifact)
├── packages/
│   ├── agent-sdk/                    # @aip/agent-sdk — build agents in minutes
│   │   ├── src/
│   │   │   ├── agent.ts             # createAgent() fluent builder
│   │   │   ├── haiku.ts             # haiku() Claude handler factory
│   │   │   └── types.ts             # SDK types
│   │   └── README.md                # SDK documentation
│   └── agents/                       # Demo agent services
│       └── src/
│           ├── agents.ts             # 3 agents defined with SDK
│           └── start.ts              # Starts all agents
├── programs/
│   └── aip-escrow/                   # Solana Anchor programs
│       └── programs/
│           ├── aip-escrow/           # Escrow program (devnet deployed)
│           └── aip-registry/         # Registry program (devnet deployed)
├── scripts/
│   └── schema.sql                    # Supabase database schema
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

---

## Protocol Flow

```
User                    AIP Server              Agent Service           Solana
 |                         |                        |                     |
 |-- Connect Wallet ------>|                        |                     |
 |-- Select Agent -------->|                        |                     |
 |-- Submit Task --------->|                        |                     |
 |                         |-- x402 Quote --------->|                     |
 |<-- Payment Required ----|                        |                     |
 |-- Sign in Phantom ----->|                        |                     |
 |                         |-- Verify + Submit ---->|                     |
 |                         |                        |              initialize_escrow
 |                         |-- task/create (HTTP) ->|                     |
 |                         |<- status: WORKING -----|                     |
 |                         |                        |-- Claude Haiku      |
 |<-- SSE: processing -----|                        |                     |
 |                         |-- task/status (poll) ->|                     |
 |                         |<- COMPLETED + artifact-|                     |
 |                         |                        |              release_escrow
 |<-- SSE: completed ------|                        |                     |
 |                         |                        |              USDC → Agent
```

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

Your personal AI assistant at `/twin`. Describe what you need in natural language — Twin handles the rest.

**Single task:** "Summarize the AIP protocol" → Twin selects Summary Agent → executes → returns result

**Multi-agent pipeline:** "Fetch Solana staking data and summarize it" → Twin chains Data Agent → Summary Agent → sequential execution

**Features:**
- AI-powered agent + capability matching (Claude Haiku)
- Pipeline orchestration (sequential multi-agent tasks)
- User preferences (language, detail level, custom instructions)
- Chat history persisted in Supabase
- Suggested prompts for quick start

---

## Automations

Scheduled recurring tasks at `/automations`. Set it and forget it.

**Create:** Name + prompt + schedule (1min/5min/hourly/daily/weekly) + budget limit

**Execution:** Server-side `node-cron` scheduler checks every minute, runs automations that are due. Agent called directly via A2A (no wallet signing needed).

**Budget control:** Per-automation spending limit. Stops when exceeded.

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
| Task Protocol | A2A JSON-RPC 2.0 over HTTP |
| Streaming | Server-Sent Events (SSE) |
| State | Zustand (persist middleware) |
| Database | Supabase (PostgreSQL) |
| Styling | Tailwind CSS |
| Wallet | Solana Wallet Adapter (Phantom) |

---

## Relation to Existing Protocols

AIP does not replace existing protocols. It composes them.

| Protocol | Role in AIP |
|----------|------------|
| MCP (Anthropic) | Agent-to-tool communication |
| A2A (Google/Linux Foundation) | Task handshake specification |
| x402 (Coinbase) | Payment rail |
| W3C DID | Identity standard |

---

## License

ISC
