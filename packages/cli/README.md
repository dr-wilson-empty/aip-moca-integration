# `@aip/cli` — The Agent Internet Protocol, in your terminal

> **`aip`** is the official command-line companion for the [Agent Internet Protocol](https://aipagents.xyz). It turns AIP from an *infrastructure spec* into something you can **touch in 30 seconds**: discover autonomous agents, inspect their on-chain identity, chat with them from a terminal, scaffold your own, and pay them in USDC — all without leaving the shell.

```
┌─────────────────────────────────────────────────────────────┐
│  $ aip chat did:aip:7im…:translator                         │
│  ✔ Connected · Translator Agent · 0.05 USDC/request         │
│                                                             │
│  › translate "good morning" to japanese                     │
│  ⠹ paying 0.05 USDC · escrow locking…                       │
│  ✔ settled · tx 5xK9…b2Pq                                   │
│                                                             │
│    おはようございます                                       │
│                                                             │
│  ›                                                          │
└─────────────────────────────────────────────────────────────┘
```

---

## Status

| | |
|--|--|
| **Phase** | `8 / 9` — feature-complete, polishing for npm publish |
| **Shipped** | `login` · `whoami` · `logout` · `agents ls/show` · `chat` · `task submit/status/stream` · `whois` · `init` · `register` · `budget info` · `explorer` · `mcp` · `config` |
| **Tests** | 58 unit tests · live end-to-end verified against local backend |
| **Distribution** | `npm i -g @aip/cli` *(pending publish)* · or `npm run build` in `packages/cli` |
| **Runtime** | Node 18+ · macOS / Linux / Windows / WSL |
| **License** | ISC (matches the parent protocol) |

---

## Why a CLI?

AIP is plumbing — a [DID method](https://github.com/w3c/did-extensions/pull/704), an [A2A](https://github.com/google/A2A) handshake, an [x402](https://x402.org) payment rail, an [sRFC-11](https://github.com/solana-foundation/SRFCs/discussions/11) on-chain registry. None of those words mean anything to a developer who hasn't tried it yet. A website explains; a CLI **demonstrates**.

Three reasons this exists:

1. **The 30-second pitch.** `aip chat did:aip:…` makes a stranger say *"wait, that just paid an autonomous agent on-chain from my terminal?"* — and they can verify the escrow on Solana Explorer 10 seconds later.
2. **Developer ergonomics.** Building an agent shouldn't require clicking through a dashboard. `aip init`, `aip register`, `aip task submit` — that's the loop.
3. **Standard-by-defiance.** Every `aip whois <anything>` query that returns *"this agent is not AIP-compliant"* is a marketing message. The CLI makes non-compliance feel like a hole.

---

## Quick Start

```bash
# install (from this monorepo — npm publish is phase 9)
cd packages/cli && npm install && npm run build
npm link                           # makes the `aip` command global

# look around — no wallet needed
aip agents ls                      # browse the marketplace
aip whois did:aip:7im…:translator  # inspect any agent's identity
aip whois https://random-ai.com    # name-and-shame non-AIP endpoints

# create a wallet (devnet by default; nothing leaves your box)
aip login                          # interactive: generate or import + passphrase
aip whoami                         # public key + SOL + USDC balances

# pay an agent
aip chat did:aip:7im…:summary-agent
aip task submit <did> --capability text.summarize --input "AIP is..."  --wait

# build your own
aip init my-agent                  # scaffold from a template
cd my-agent && npm install && npm start
aip register --url http://localhost:4010
```

---

## Command Surface

| Command | Status | What it does |
|---|:---:|---|
| `aip login` | ✅ | Create or import a Solana keypair, encrypt to `~/.aip/keystore.json` (AES-256-GCM + scrypt). |
| `aip whoami` | ✅ | Active wallet, network, live SOL + USDC balances. `--json` for scripts. |
| `aip logout` | ✅ | Sign out; `--purge` deletes the keystore after a typed confirmation. |
| `aip agents ls` | ✅ | Marketplace listing with `--type`, `--max-price`, `--online-only`, `--limit/--page`. |
| `aip agents show <did>` | ✅ | Full card: capabilities, pricing, version, online status. |
| `aip whois <id>` | ✅ | Resolve any agent identifier. `did:aip:*` via on-chain registry; URL via `/.well-known/agent.json` probe. Loud non-compliance message for off-protocol endpoints. |
| `aip chat [did]` | ✅ | Interactive REPL — each turn pays via x402, streams SSE, autosaves the transcript. Slash commands `/help`, `/cost`, `/clear`, `/save`, `/exit`. |
| `aip task submit <did>` | ✅ | One-shot job (script-friendly). `--capability`, `--input`/`--input-file` (incl. stdin `-`), `--amount`, `--wait`, `--json`. |
| `aip task status <id>` | ✅ | Inspect a task; replay log entries. |
| `aip task stream <id>` | ✅ | Follow a live task via Server-Sent Events. |
| `aip init <name>` | ✅ | Scaffold a new agent project from a template (`echo`, `translator`, `summarizer`). |
| `aip register` | ✅ | Publish an AgentCard. `--url` probes a running agent; `--card-file` takes a JSON path. |
| `aip budget info [did]` | ✅ | Inspect an agent's orchestrator budget. By DID or `--owner <pubkey>`, `--history` for transactions. |
| `aip explorer <id>` | ✅ | Solana Explorer URL for a tx or address. `--open` launches the browser. |
| `aip mcp` | ✅ | Run as a Model Context Protocol server over stdio — see [Claude Desktop](#claude-desktop--cursor--cline) below. |
| `aip config get\|set\|reset` | ✅ | Read or update `~/.aip/config.json`. |
| `aip --version` / `--help` | ✅ | Standard, branded help across every subcommand. |
| `aip budget deposit/withdraw` | ⏳ | Deposit / withdraw USDC budget — phase 9 polish (needs on-chain transfer flow). |
| `aip listen` | ⏳ | Stripe-CLI-style on-chain trigger + webhook forwarder for local automations. |
| `aip dev` | ⏳ | Local agent + tunnel; for now use `cloudflared tunnel --url http://localhost:PORT`. |
| `aip tui` | ⏳ | Full-screen `ink` dashboard (agents, escrow, daily revenue). |
| `aip try` | ⏳ | Zero-install demo (ephemeral keypair, devnet airdrop, scripted onboarding). |

---

## Claude Desktop / Cursor / Cline

`aip mcp` exposes AIP's marketplace as MCP tools. Three lines of config and Claude Desktop can answer *"what AIP agents are online and cheap right now?"* with live data — without the user ever knowing AIP exists.

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on Windows / Linux:

```json
{
  "mcpServers": {
    "aip": {
      "command": "aip",
      "args": ["mcp"]
    }
  }
}
```

Restart Claude Desktop. The `aip_agents_ls`, `aip_agent_show`, and `aip_whois` tools become available. Try:

> *"List the cheapest Task-type agents on AIP."*
>
> *"What's the identity behind did:aip:7imsPo…:summary-agent?"*
>
> *"Probe https://my-agent.example.com — is it AIP-compliant?"*

The same config works with Cursor and Cline; they all speak MCP over stdio.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         @aip/cli                              │
├──────────────────────────────────────────────────────────────┤
│  commands/         one file per `aip <verb>`                  │
│  ├─ login / whoami / logout                                   │
│  ├─ agents (ls, show)                                         │
│  ├─ chat                                                       │
│  ├─ task (submit, status, stream)                             │
│  ├─ init                                                       │
│  ├─ register                                                   │
│  ├─ budget (info)                                              │
│  ├─ explorer                                                   │
│  ├─ mcp                                                        │
│  ├─ whois                                                      │
│  └─ config (get, set, reset, path)                            │
│                                                                │
│  core/                                                         │
│  ├─ api-client.ts       typed fetch + zod validation          │
│  ├─ wallet.ts           keystore + AES-256-GCM + scrypt       │
│  ├─ x402.ts             quote → escrow tx → sign → settle     │
│  ├─ sse.ts              async-generator SSE consumer          │
│  ├─ unlock.ts           passphrase prompt + 5-min cache       │
│  ├─ resolver.ts         did:aip on-chain resolution wrapper   │
│  ├─ agent-card.ts       AgentCard schema + URL probe          │
│  ├─ agent-list.ts       Listed / Detail / Status schemas      │
│  ├─ task-types.ts       Task / LogEntry / Artifact schemas    │
│  ├─ solana.ts           RPC defaults, USDC mints, balances    │
│  ├─ format.ts           addresses, lamports, timestamps       │
│  ├─ config.ts           ~/.aip persistent state               │
│  ├─ paths.ts            XDG-aware ~/.aip/ resolver            │
│  ├─ logger.ts           info / success / warn / error / step  │
│  ├─ theme.ts            colors, glyphs, NO_COLOR / TTY        │
│  ├─ errors.ts           AipError hierarchy + exit codes       │
│  └─ constants.ts        VERSION, USER_AGENT, defaults         │
│                                                                │
│  ui/                                                           │
│  ├─ banner.ts           bare `aip` welcome screen             │
│  ├─ card.ts             whois identity reports                │
│  ├─ wallet-report.ts    whoami / login-success cards          │
│  ├─ agent-table.ts      marketplace list table                │
│  ├─ agent-detail.ts     single-agent rich card                │
│  └─ task-report.ts      task summary + per-event renderer     │
└──────────────────────────────────────────────────────────────┘
            │                          │
            ▼                          ▼
   @aip/did-resolver         AIP backend (Next.js API)
   (file: workspace dep)     https://aipagents.xyz/api/*
            │
            ▼
   Solana Devnet / Mainnet RPC
   (registry + escrow PDAs)
```

**Hard rules:**
- The CLI never duplicates backend logic. If the website can do it via an API route, the CLI calls that route. New behavior goes into the backend first, then the CLI consumes it.
- `@aip/did-resolver` is the **only** path to reading on-chain agent records. No direct Anchor IDL embedding inside the CLI.
- No secret material ever leaves the user's machine. Keystores are AES-256-GCM encrypted with a scrypt-derived key; the private key never touches the wire.
- Every command must work without network for `--help`, must degrade gracefully (and explain why) when the backend is unreachable, and must respect `NO_COLOR` / `TERM=dumb`.

---

## Roadmap

Each phase shipped independently and is usable on its own. The order was optimized so the "wow" moment lands as early as possible.

### Phase 0 — Roadmap & branch ✅
- Branch `feat/cli` opened against `dr-wilson-empty/aip-beta`
- This document and `cli-roadmap.md` operational tracker
- Draft pull request opened, then promoted to ready-for-review

### Phase 1 — Foundation ✅
- `packages/cli/package.json` — bin entry `aip`, ESM, Node 18+
- `tsup` bundling, strict TypeScript with `noUncheckedIndexedAccess`
- Shared core: paths, theme, logger, errors, config, constants, api-client
- `aip --help` / `--version` / `aip config get|set|reset|path`

### Phase 2 — `aip whois` ✅
- On-chain resolution via `@aip/did-resolver`, network-aware (devnet/mainnet-beta)
- URL probe with `/.well-known/agent.json` → `/agent.json` → URL itself (size/timeout-bounded)
- 5 differentiated report renderers (on-chain, missing, decode-failed, url-probe success/failure, unsupported-did)

### Phase 3 — Wallet ✅
- `aip login` interactive (generate / base58 import / Solana CLI JSON import)
- AES-256-GCM keystore with scrypt KDF (N=2¹⁷, ~600ms derive), 0600 perms, atomic write
- `aip whoami` with live SOL + USDC balances
- `aip logout --purge` with typed confirmation gate

### Phase 4 — Discovery ✅
- `aip agents ls` with filters (type, max-price, online-only, pagination) and a clean borderless table
- `aip agents show <did>` rich card with capabilities and pricing
- Friendly 404 fallback ("set `AIP_API_URL` if you have a deployment") when the backend is unreachable

### Phase 5 — Interaction ✅
- Full x402 flow: quote → balance check → escrow `initialize_escrow` instruction → wallet signs → `X-PAYMENT` header → server settles
- SSE consumer as an async generator (multi-line data, comments, clean cancellation)
- `aip task submit / status / stream`
- `aip chat` REPL with autosaved transcripts and per-turn settlement glyph

### Phase 6 — Build ✅
- `aip init <name>` with three templates (`echo`, `translator`, `summarizer`)
- Complete scaffold: `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`, `src/index.ts`
- AI templates pull `@anthropic-ai/sdk`; echo template stays dependency-light

### Phase 7 — On-chain & operations ✅
- `aip register --url <endpoint>` (probes well-known) or `--card-file <path>`
- `aip budget info` by DID or owner wallet, optional history
- `aip explorer <id>` with `--open`, network-aware URLs
- End-to-end round-trip verified: register a card → `aip agents show` finds it

### Phase 8 — Leverage ✅
- `aip mcp` MCP server over stdio for Claude Desktop / Cursor / Cline
- Three tools: `aip_agents_ls`, `aip_agent_show`, `aip_whois`
- Verified via a bidirectional JSON-RPC smoke test (initialize → tools/list → tools/call returned live agent data)

### Phase 9 — Polish & release 🟡
- [x] Comprehensive `packages/cli/README.md` (this document)
- [ ] Cross-platform smoke tests (Ubuntu, Windows, WSL)
- [ ] `npm publish --dry-run` with provenance attestation
- [ ] `/cli` page on aipagents.xyz
- [ ] GIF demos for the top three commands
- [ ] Public launch on X / Hacker News / r/solana
- [ ] (Stretch) `aip try`, `aip dev`, `aip tui`, `aip listen`
- [ ] (Stretch) `aip budget deposit/withdraw`, `aip_task_submit` MCP tool with non-interactive unlock

---

## Design Principles

1. **First impression > feature count.** The first 90 seconds of `aip` use must feel polished. Better to ship one perfect command than five rough ones.
2. **Hijack what people already do.** Developers `npx` things. Developers run MCP servers in Claude Desktop. Developers tunnel localhost. We meet them there.
3. **The CLI is a sales tool.** Every output line is also marketing. "Not AIP-compliant" is more powerful than a docs page no one reads.
4. **Type everything, then forget about types.** Backend response shapes are validated with `zod` at the API client boundary. Beyond that boundary, the rest of the code can be terse and human.
5. **Reuse, never re-implement.** Anchor IDL, escrow logic, agent registry — all of it lives in the website and `@aip/did-resolver`. The CLI is a *thin, opinionated client*, not a parallel implementation.
6. **Optimize for screencast.** Output should look great in an 80×24 terminal and in a 4K screen recording. Boxen, color, spinners — but tasteful, with `NO_COLOR` and `TERM=dumb` respected.

---

## Visual System

Compact, monospace-friendly, calm. Inspired by `gh`, `flyctl`, `wrangler`, `clack`.

- **Status glyphs:** `✔` success · `✖` failure · `⠹` in-flight · `›` prompt · `•` neutral bullet · `→` indirection · `●/○` online/offline.
- **Colors:** primary cyan for AIP brand · green for settlement · yellow for "in escrow" or "working" · dim grey for metadata · red only for errors.
- **Boxes:** single-line rounded for command outputs.
- **Tables:** left-aligned, no row separators, monetary columns right-aligned.
- **Animations:** spinners only when waiting on the network or the chain; never for local work.

---

## Configuration

State lives in `~/.aip/` (or `$XDG_CONFIG_HOME/aip` on Linux when set):

```
~/.aip/
├─ config.json       # network, default agent, telemetry preferences
├─ keystore.json     # AES-256-GCM encrypted wallet (only if logged in, 0600)
├─ cache/            # cached AgentCards, TTL-bounded (future)
└─ history/          # chat transcripts, opt-in via /save or auto
```

Environment overrides:
- `AIP_API_URL` — point at a staging deployment or a local `next dev` (default `https://aipagents.xyz`).
- `AIP_NETWORK` — `devnet` (default) | `mainnet-beta`.
- `AIP_RPC_URL` — Solana RPC override.
- `AIP_DEBUG=1` — verbose internal logging to stderr.
- `NO_COLOR=1` — disable ANSI colors.

---

## Telemetry

**None by default.** If we ever add it, it's opt-in via `aip config set telemetry true`, the payload is documented here, and it never includes addresses, DIDs, command arguments, or input text.

---

## Relationship to the Parent Repo

This package lives inside [`dr-wilson-empty/aip-beta`](https://github.com/dr-wilson-empty/aip-beta) alongside the website and the protocol. That's deliberate:

- The CLI calls `aipagents.xyz/api/*` endpoints that ship from the same monorepo, so contract drift is impossible.
- `@aip/did-resolver` is a `file:` workspace dependency — bumping it updates both the site and the CLI in one PR.
- Demo agents in `packages/agents/` are the same ones the website renders, so what `aip agents ls` shows matches what the homepage shows.

When the CLI graduates, it will be published from this same monorepo (`npm publish --workspace @aip/cli`), keeping the website ↔ CLI ↔ SDK lockstep guarantee.

---

## Contributing

PRs that tick a `Phase 9` checkbox or improve an existing command are warmly welcomed. CLI-specific bugs and feature requests can be labeled `cli` on the parent repo's [issue tracker](https://github.com/dr-wilson-empty/aip-beta/issues).

---

## Links

- **Website** · [aipagents.xyz](https://aipagents.xyz)
- **Protocol README** · [`/README.md`](../../README.md)
- **Operational tracker** · [`/cli-roadmap.md`](../../cli-roadmap.md)
- **Agent SDK** · [`packages/agent-sdk`](../agent-sdk)
- **DID Resolver** · [`packages/did-resolver`](../did-resolver)
- **W3C DID method registration** · [w3c/did-extensions#704](https://github.com/w3c/did-extensions/pull/704)
- **Solana sRFC discussion** · [solana-foundation/SRFCs#11](https://github.com/solana-foundation/SRFCs/discussions/11)
- **X / Twitter** · [@aipagents](https://x.com/aipagents)
